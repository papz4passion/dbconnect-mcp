import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createPostgresAdapter } from "../../src/adapters/postgres/adapter.js";
import type { ResolvedConfig } from "../../src/config/types.js";
import { startScramContainer, containerToConnectionParts } from "./helpers/container.js";

function configFor(parts: ReturnType<typeof containerToConnectionParts>): ResolvedConfig {
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
  };
}

describe("list_schemas", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await startScramContainer();
  }, 120_000);

  afterAll(async () => {
    await container.stop();
  });

  it("returns public and a created schema, excluding system schemas by default", async () => {
    const parts = containerToConnectionParts(container);
    const config = { ...configFor(parts), allowWrite: true };
    const adapter = createPostgresAdapter(config);
    await adapter.execute("create schema if not exists sales", [], { maxRows: 10, queryTimeoutMs: 5000 });

    const schemas = await adapter.listSchemas({ includeSystem: false });
    const names = schemas.map((s) => s.name);
    expect(names).toContain("public");
    expect(names).toContain("sales");
    expect(names).not.toContain("pg_catalog");
    expect(names).not.toContain("information_schema");

    await adapter.close();
  });

  it("includes system schemas when include_system is true", async () => {
    const parts = containerToConnectionParts(container);
    const adapter = createPostgresAdapter(configFor(parts));

    const schemas = await adapter.listSchemas({ includeSystem: true });
    const names = schemas.map((s) => s.name);
    expect(names).toContain("pg_catalog");
    expect(names).toContain("information_schema");

    await adapter.close();
  });
});
