import { describe, expect, it } from "vitest";
import { createAdapter, createAdapterForScheme, schemeFromConnectionString } from "../../src/adapters/registry.js";
import { ConfigError } from "../../src/config/types.js";
import type { ResolvedConfig } from "../../src/config/types.js";

function baseConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    host: "localhost",
    port: 5432,
    user: "postgres",
    password: undefined,
    database: "postgres",
    sslmode: "disable",
    sslrootcert: undefined,
    sslcert: undefined,
    sslkey: undefined,
    allowWrite: false,
    poolMax: 5,
    connectTimeoutSeconds: 10,
    queryTimeoutSeconds: 30,
    maxRows: 1000,
    logLevel: "info",
    connectionStringForRedaction: undefined,
    ...overrides,
  };
}

describe("adapter registry", () => {
  it("selects PostgreSQL for the postgres:// scheme", () => {
    const config = baseConfig({ connectionStringForRedaction: "postgres://u@h/db" });
    const adapter = createAdapter(config);
    expect(adapter.engine).toBe("postgresql");
  });

  it("selects PostgreSQL for the postgresql:// scheme", () => {
    const config = baseConfig({ connectionStringForRedaction: "postgresql://u@h/db" });
    const adapter = createAdapter(config);
    expect(adapter.engine).toBe("postgresql");
  });

  it("defaults to PostgreSQL when only flags/env are given (no connection string)", () => {
    const config = baseConfig();
    const adapter = createAdapter(config);
    expect(adapter.engine).toBe("postgresql");
  });

  it("fails for an unsupported scheme with the supported-engine list", () => {
    expect(() => createAdapterForScheme("mysql", baseConfig())).toThrowError(ConfigError);
    try {
      createAdapterForScheme("mysql", baseConfig());
    } catch (err) {
      expect((err as ConfigError).message).toContain("mysql");
      expect((err as ConfigError).message).toContain("postgresql");
    }
  });

  it("extracts the scheme from a connection string", () => {
    expect(schemeFromConnectionString("postgres://u@h/db")).toBe("postgres");
    expect(schemeFromConnectionString("mysql://u@h/db")).toBe("mysql");
  });
});
