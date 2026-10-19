export type SslMode = "disable" | "prefer" | "require" | "verify-ca" | "verify-full";
export type LogLevel = "error" | "warn" | "info" | "debug";

export interface ResolvedConfig {
  host: string;
  port: number;
  user: string;
  password: string | undefined;
  database: string;
  sslmode: SslMode;
  sslrootcert: string | undefined;
  sslcert: string | undefined;
  sslkey: string | undefined;
  allowWrite: boolean;
  poolMax: number;
  connectTimeoutSeconds: number;
  queryTimeoutSeconds: number;
  maxRows: number;
  logLevel: LogLevel;
  connectionStringForRedaction: string | undefined;
}

export const DEFAULTS = {
  host: "localhost",
  port: 5432,
  user: "postgres",
  database: "postgres",
  sslmode: "prefer" as SslMode,
  allowWrite: false,
  poolMax: 5,
  connectTimeoutSeconds: 10,
  queryTimeoutSeconds: 30,
  maxRows: 1000,
  logLevel: "info" as LogLevel,
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}
