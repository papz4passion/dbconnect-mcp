import { readFileSync } from "node:fs";
import type { ConnectionOptions as TlsConnectionOptions } from "node:tls";
import { ConfigError } from "./types.js";
import type { SslMode } from "./types.js";

export const SSL_MODES: readonly SslMode[] = [
  "disable",
  "prefer",
  "require",
  "verify-ca",
  "verify-full",
];

export function isSslMode(value: string): value is SslMode {
  return (SSL_MODES as readonly string[]).includes(value);
}

export function assertValidSslMode(value: string): SslMode {
  if (!isSslMode(value)) {
    throw new ConfigError(
      `Invalid sslmode "${value}". Supported values: ${SSL_MODES.join(", ")}.`,
    );
  }
  return value;
}

export interface SslFileOptions {
  sslrootcert?: string;
  sslcert?: string;
  sslkey?: string;
}

export type PgSslOption = boolean | (TlsConnectionOptions & { rejectUnauthorized?: boolean });

function loadFile(path: string, label: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    throw new ConfigError(
      `Could not read ${label} at "${path}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function buildTlsOptions(
  mode: SslMode,
  files: SslFileOptions,
  host: string,
): PgSslOption {
  const ca = files.sslrootcert ? loadFile(files.sslrootcert, "sslrootcert") : undefined;
  const cert = files.sslcert ? loadFile(files.sslcert, "sslcert") : undefined;
  const key = files.sslkey ? loadFile(files.sslkey, "sslkey") : undefined;

  switch (mode) {
    case "disable":
      return false;
    case "prefer":
      return { rejectUnauthorized: false, ca, cert, key };
    case "require":
      return { rejectUnauthorized: false, ca, cert, key };
    case "verify-ca":
      return {
        rejectUnauthorized: true,
        ca,
        cert,
        key,
        checkServerIdentity: () => undefined,
      };
    case "verify-full":
      return {
        rejectUnauthorized: true,
        ca,
        cert,
        key,
        servername: host,
      };
    default: {
      const exhaustive: never = mode;
      throw new ConfigError(`Unhandled sslmode: ${String(exhaustive)}`);
    }
  }
}
