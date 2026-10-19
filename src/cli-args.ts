import { parseArgs } from "node:util";
import { ConfigError } from "./config/types.js";
import type { CliFlags } from "./config/resolve.js";

export interface ParsedCli {
  help: boolean;
  version: boolean;
  positionalConnectionString: string | undefined;
  flags: CliFlags;
  twoConnectionStrings: boolean;
}

const OPTIONS = {
  help: { type: "boolean" as const, short: "h" },
  version: { type: "boolean" as const },
  host: { type: "string" as const },
  port: { type: "string" as const },
  user: { type: "string" as const },
  password: { type: "string" as const },
  "password-file": { type: "string" as const },
  database: { type: "string" as const },
  sslmode: { type: "string" as const },
  sslrootcert: { type: "string" as const },
  sslcert: { type: "string" as const },
  sslkey: { type: "string" as const },
  "connection-string": { type: "string" as const },
  "allow-write": { type: "boolean" as const },
  "pool-max": { type: "string" as const },
  "connect-timeout": { type: "string" as const },
  "query-timeout": { type: "string" as const },
  "max-rows": { type: "string" as const },
  "log-level": { type: "string" as const },
};

function parseIntFlag(name: string, raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ConfigError(`Invalid value for --${name}: "${raw}" must be a positive integer.`);
  }
  return n;
}

const VALID_LOG_LEVELS = new Set(["error", "warn", "info", "debug"]);

export function parseCliArgs(argv: string[]): ParsedCli {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      options: OPTIONS,
      strict: true,
      allowPositionals: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ConfigError(`${message} Run with --help to see supported flags.`);
  }

  const { values, positionals } = parsed;

  if (positionals.length > 1) {
    throw new ConfigError(
      `Unexpected extra arguments: ${positionals.slice(1).join(" ")}. Run with --help to see usage.`,
    );
  }

  const positionalConnectionString = positionals[0];
  const flagConnectionString = values["connection-string"] as string | undefined;
  const twoConnectionStrings =
    positionalConnectionString !== undefined && flagConnectionString !== undefined;

  const logLevelRaw = values["log-level"] as string | undefined;
  if (logLevelRaw !== undefined && !VALID_LOG_LEVELS.has(logLevelRaw)) {
    throw new ConfigError(
      `Invalid value for --log-level: "${logLevelRaw}". Supported values: error, warn, info, debug.`,
    );
  }

  const flags: CliFlags = {};
  if (values.host !== undefined) flags.host = values.host as string;
  if (values.port !== undefined) flags.port = parseIntFlag("port", values.port as string);
  if (values.user !== undefined) flags.user = values.user as string;
  if (values.password !== undefined) flags.password = values.password as string;
  if (values["password-file"] !== undefined) flags.passwordFile = values["password-file"] as string;
  if (values.database !== undefined) flags.database = values.database as string;
  if (values.sslmode !== undefined) flags.sslmode = values.sslmode as string;
  if (values.sslrootcert !== undefined) flags.sslrootcert = values.sslrootcert as string;
  if (values.sslcert !== undefined) flags.sslcert = values.sslcert as string;
  if (values.sslkey !== undefined) flags.sslkey = values.sslkey as string;
  if (flagConnectionString !== undefined || positionalConnectionString !== undefined) {
    flags.connectionString = flagConnectionString ?? positionalConnectionString;
  }
  if (values["allow-write"] !== undefined) flags.allowWrite = values["allow-write"] as boolean;
  if (values["pool-max"] !== undefined) flags.poolMax = parseIntFlag("pool-max", values["pool-max"] as string);
  if (values["connect-timeout"] !== undefined)
    flags.connectTimeout = parseIntFlag("connect-timeout", values["connect-timeout"] as string);
  if (values["query-timeout"] !== undefined)
    flags.queryTimeout = parseIntFlag("query-timeout", values["query-timeout"] as string);
  if (values["max-rows"] !== undefined) flags.maxRows = parseIntFlag("max-rows", values["max-rows"] as string);
  if (logLevelRaw !== undefined) flags.logLevel = logLevelRaw as CliFlags["logLevel"];

  return {
    help: Boolean(values.help),
    version: Boolean(values.version),
    positionalConnectionString,
    flags,
    twoConnectionStrings,
  };
}

export const HELP_TEXT = `dbconnect-mcp - A self-contained MCP server for PostgreSQL

Usage:
  dbconnect-mcp [connection-string] [options]
  dbconnect-mcp --help
  dbconnect-mcp --version

Connection target (in order of precedence: flags > connection string > PG* env vars > defaults):
  [connection-string]         postgres:// or postgresql:// URI (positional)
  --connection-string <uri>   Same as above, as a flag
  --host <host>                Database host (hostname, IP, or Unix socket dir)
  --port <port>                 Database port (default: 5432)
  --user <user>                  Database user
  --password <password>          Database password
  --password-file <path>         Read password from a file (trailing newline trimmed)
  --database <name>              Database name

SSL/TLS:
  --sslmode <mode>              disable | prefer (default) | require | verify-ca | verify-full
  --sslrootcert <path>           CA bundle for verify-ca / verify-full
  --sslcert <path>                Client certificate
  --sslkey <path>                  Client key

Query execution:
  --allow-write                  Allow write/DDL statements (default: read-only)
  --max-rows <n>                   Maximum rows returned per query (default: 1000)
  --query-timeout <seconds>        Statement timeout (default: 30)

Pooling and connection:
  --pool-max <n>                   Max pooled connections (default: 5)
  --connect-timeout <seconds>      Connection timeout (default: 10)

Other:
  --log-level <level>              error | warn | info | debug (default: info)
  --help, -h                        Show this help and exit
  --version                          Show the package version and exit

Environment variables:
  PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE,
  PGSSLMODE, PGSSLROOTCERT, PGSSLCERT, PGSSLKEY,
  DATABASE_URL (postgres:// connection string)
`;
