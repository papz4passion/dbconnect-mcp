import { readFileSync } from "node:fs";
import { parse as parseConnectionString } from "pg-connection-string";
import { ConfigError, DEFAULTS } from "./types.js";
import type { LogLevel, ResolvedConfig, SslMode } from "./types.js";
import { assertValidSslMode } from "./ssl.js";

export interface CliFlags {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  passwordFile?: string;
  database?: string;
  sslmode?: string;
  sslrootcert?: string;
  sslcert?: string;
  sslkey?: string;
  connectionString?: string;
  allowWrite?: boolean;
  poolMax?: number;
  connectTimeout?: number;
  queryTimeout?: number;
  maxRows?: number;
  logLevel?: LogLevel;
}

export interface ResolveEnv {
  PGHOST?: string;
  PGPORT?: string;
  PGUSER?: string;
  PGPASSWORD?: string;
  PGDATABASE?: string;
  PGSSLMODE?: string;
  PGSSLROOTCERT?: string;
  PGSSLCERT?: string;
  PGSSLKEY?: string;
  DATABASE_URL?: string;
  [key: string]: string | undefined;
}

interface Layer {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  sslmode?: string;
  sslrootcert?: string;
  sslcert?: string;
  sslkey?: string;
}

function parsePort(raw: string | number | null | undefined, source: string): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = typeof raw === "number" ? raw : Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0 || n > 65535) {
    throw new ConfigError(`Invalid port "${String(raw)}" from ${source}: must be 1-65535.`);
  }
  return n;
}

const CONNECTION_STRING_SCHEME_PATTERN = /^postgres(?:ql)?:\/\//i;

function connectionStringToLayer(connectionString: string): Layer {
  if (!CONNECTION_STRING_SCHEME_PATTERN.test(connectionString)) {
    throw new ConfigError(
      'Malformed connection string: expected a "postgres://" or "postgresql://" URI.',
    );
  }

  let parsed: ReturnType<typeof parseConnectionString>;
  try {
    // We interpret sslmode/ssl* ourselves (design D6), so ask for libpq-compatible
    // parsing to avoid pg-connection-string's own sslmode-to-TLS-option mapping
    // and its related deprecation warning.
    parsed = parseConnectionString(connectionString, { useLibpqCompat: true });
  } catch (err) {
    throw new ConfigError(
      `Malformed connection string: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!parsed.host) {
    throw new ConfigError("Malformed connection string: could not determine the host.");
  }

  const layer: Layer = {};
  if (parsed.host) layer.host = parsed.host;
  if (parsed.port) layer.port = parsePort(parsed.port, "connection string");
  if (parsed.user) layer.user = parsed.user;
  if (parsed.password) layer.password = parsed.password;
  if (parsed.database) layer.database = parsed.database;

  const sslmode = parsed["sslmode"];
  if (typeof sslmode === "string") layer.sslmode = sslmode;
  const sslrootcert = parsed["sslrootcert"];
  if (typeof sslrootcert === "string") layer.sslrootcert = sslrootcert;
  const sslcert = parsed["sslcert"];
  if (typeof sslcert === "string") layer.sslcert = sslcert;
  const sslkey = parsed["sslkey"];
  if (typeof sslkey === "string") layer.sslkey = sslkey;

  return layer;
}

function mergeLayer(base: Layer, override: Layer): Layer {
  const merged: Layer = { ...base };
  for (const key of Object.keys(override) as (keyof Layer)[]) {
    const value = override[key];
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

function readPasswordFile(path: string): string {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    throw new ConfigError(
      `Could not read --password-file "${path}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return raw.endsWith("\n") ? raw.slice(0, -1) : raw;
}

export function resolveConfig(flags: CliFlags, env: ResolveEnv): ResolvedConfig {
  const defaultsLayer: Layer = {
    host: DEFAULTS.host,
    port: DEFAULTS.port,
    user: DEFAULTS.user,
    database: DEFAULTS.database,
    sslmode: DEFAULTS.sslmode,
  };

  const envLayer: Layer = {};
  if (env.PGHOST) envLayer.host = env.PGHOST;
  if (env.PGPORT) envLayer.port = parsePort(env.PGPORT, "PGPORT");
  if (env.PGUSER) envLayer.user = env.PGUSER;
  if (env.PGPASSWORD) envLayer.password = env.PGPASSWORD;
  if (env.PGDATABASE) envLayer.database = env.PGDATABASE;
  if (env.PGSSLMODE) envLayer.sslmode = env.PGSSLMODE;
  if (env.PGSSLROOTCERT) envLayer.sslrootcert = env.PGSSLROOTCERT;
  if (env.PGSSLCERT) envLayer.sslcert = env.PGSSLCERT;
  if (env.PGSSLKEY) envLayer.sslkey = env.PGSSLKEY;

  const connectionStringSource = flags.connectionString ?? env.DATABASE_URL;
  let connectionStringLayer: Layer = {};
  let connectionStringForRedaction: string | undefined;
  if (connectionStringSource !== undefined) {
    connectionStringLayer = connectionStringToLayer(connectionStringSource);
    connectionStringForRedaction = connectionStringSource;
  }

  const flagsLayer: Layer = {};
  if (flags.host !== undefined) flagsLayer.host = flags.host;
  if (flags.port !== undefined) flagsLayer.port = parsePort(flags.port, "--port");
  if (flags.user !== undefined) flagsLayer.user = flags.user;
  if (flags.database !== undefined) flagsLayer.database = flags.database;
  if (flags.sslmode !== undefined) flagsLayer.sslmode = flags.sslmode;
  if (flags.sslrootcert !== undefined) flagsLayer.sslrootcert = flags.sslrootcert;
  if (flags.sslcert !== undefined) flagsLayer.sslcert = flags.sslcert;
  if (flags.sslkey !== undefined) flagsLayer.sslkey = flags.sslkey;

  let flagPassword: string | undefined;
  if (flags.passwordFile !== undefined) {
    flagPassword = readPasswordFile(flags.passwordFile);
  } else if (flags.password !== undefined) {
    flagPassword = flags.password;
  }
  if (flagPassword !== undefined) flagsLayer.password = flagPassword;

  let merged = defaultsLayer;
  merged = mergeLayer(merged, envLayer);
  merged = mergeLayer(merged, connectionStringLayer);
  merged = mergeLayer(merged, flagsLayer);

  const host = merged.host ?? DEFAULTS.host;
  const port = merged.port ?? DEFAULTS.port;
  const user = merged.user ?? DEFAULTS.user;
  const database = merged.database ?? DEFAULTS.database;

  const sslmodeRaw = merged.sslmode ?? DEFAULTS.sslmode;
  const sslmode: SslMode = assertValidSslMode(sslmodeRaw);

  const allowWrite = flags.allowWrite ?? DEFAULTS.allowWrite;
  const poolMax = flags.poolMax ?? DEFAULTS.poolMax;
  const connectTimeoutSeconds = flags.connectTimeout ?? DEFAULTS.connectTimeoutSeconds;
  const queryTimeoutSeconds = flags.queryTimeout ?? DEFAULTS.queryTimeoutSeconds;
  const maxRows = flags.maxRows ?? DEFAULTS.maxRows;
  const logLevel = flags.logLevel ?? DEFAULTS.logLevel;

  return {
    host,
    port,
    user,
    password: merged.password,
    database,
    sslmode,
    sslrootcert: merged.sslrootcert,
    sslcert: merged.sslcert,
    sslkey: merged.sslkey,
    allowWrite,
    poolMax,
    connectTimeoutSeconds,
    queryTimeoutSeconds,
    maxRows,
    logLevel,
    connectionStringForRedaction,
  };
}

export function hasAnyConnectionTarget(flags: CliFlags, env: ResolveEnv): boolean {
  return Boolean(
    flags.host ||
      flags.connectionString ||
      env.DATABASE_URL ||
      env.PGHOST ||
      flags.database ||
      env.PGDATABASE ||
      flags.user ||
      env.PGUSER,
  );
}
