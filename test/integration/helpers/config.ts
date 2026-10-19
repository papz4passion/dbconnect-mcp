import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { ResolvedConfig } from "../../../src/config/types.js";
import { containerToConnectionParts } from "./container.js";

export function configForContainer(
  container: StartedPostgreSqlContainer,
  overrides: Partial<ResolvedConfig> = {},
): ResolvedConfig {
  const parts = containerToConnectionParts(container);
  return {
    host: parts.host,
    port: parts.port,
    user: parts.user,
    password: parts.password,
    database: parts.database,
    sslmode: "disable",
    sslrootcert: undefined,
    sslcert: undefined,
    sslkey: undefined,
    allowWrite: false,
    poolMax: 5,
    connectTimeoutSeconds: 5,
    queryTimeoutSeconds: 10,
    maxRows: 1000,
    logLevel: "error",
    connectionStringForRedaction: undefined,
    ...overrides,
  };
}
