import type { ResolvedConfig } from "../config/types.js";
import { ConfigError } from "../config/types.js";
import type { DatabaseAdapter } from "./types.js";
import { createPostgresAdapter } from "./postgres/adapter.js";

export type AdapterFactory = (config: ResolvedConfig) => DatabaseAdapter;

const REGISTRY: Record<string, AdapterFactory> = {
  postgres: createPostgresAdapter,
  postgresql: createPostgresAdapter,
};

const SUPPORTED_SCHEMES = Object.keys(REGISTRY);

export function createAdapterForScheme(scheme: string, config: ResolvedConfig): DatabaseAdapter {
  const factory = REGISTRY[scheme];
  if (!factory) {
    throw new ConfigError(
      `Unsupported database engine "${scheme}". Supported engines: ${SUPPORTED_SCHEMES.join(", ")}.`,
    );
  }
  return factory(config);
}

const CONNECTION_STRING_SCHEME_PATTERN = /^(\w+):\/\//;

export function schemeFromConnectionString(connectionString: string): string | undefined {
  const match = CONNECTION_STRING_SCHEME_PATTERN.exec(connectionString);
  return match?.[1]?.toLowerCase();
}

export function createAdapter(config: ResolvedConfig): DatabaseAdapter {
  const scheme = config.connectionStringForRedaction
    ? schemeFromConnectionString(config.connectionStringForRedaction)
    : undefined;
  return createAdapterForScheme(scheme ?? "postgresql", config);
}

export { SUPPORTED_SCHEMES };
