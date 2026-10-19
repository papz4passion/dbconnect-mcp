import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createPostgresAdapter } from "../../src/adapters/postgres/adapter.js";
import type { ResolvedConfig } from "../../src/config/types.js";
import { startScramContainer, containerToConnectionParts } from "./helpers/container.js";

async function countActiveConnections(container: StartedPostgreSqlContainer): Promise<number> {
  const parts = containerToConnectionParts(container);
  const client = new pg.Client({
    host: parts.host,
    port: parts.port,
    user: parts.user,
    password: parts.password,
    database: parts.database,
  });
  await client.connect();
  try {
    const result = await client.query(
      "select count(*)::int as count from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
      [parts.database],
    );
    return (result.rows[0] as { count: number }).count;
  } finally {
    await client.end();
  }
}

function configFor(container: StartedPostgreSqlContainer): ResolvedConfig {
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
  };
}

describe("PostgreSQL adapter: lazy pool and pooling", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await startScramContainer();
  }, 120_000);

  afterAll(async () => {
    await container.stop();
  });

  it("creates no connection at adapter construction; first use connects lazily", async () => {
    const before = await countActiveConnections(container);

    const adapter = createPostgresAdapter(configFor(container));
    const afterConstruct = await countActiveConnections(container);
    expect(afterConstruct).toBe(before);

    const info = await adapter.test();
    expect(info.database).toBe("testdb");
    const afterFirstCall = await countActiveConnections(container);
    expect(afterFirstCall).toBeGreaterThan(before);

    await adapter.close();
  });

  it("reuses pooled connections across sequential calls and close() ends all clients", async () => {
    const adapter = createPostgresAdapter(configFor(container));
    await adapter.test();
    await adapter.listSchemas({ includeSystem: false });
    await adapter.listSchemas({ includeSystem: false });

    const whileOpen = await countActiveConnections(container);
    expect(whileOpen).toBeGreaterThan(0);

    await adapter.close();
    const afterClose = await countActiveConnections(container);
    expect(afterClose).toBe(0);

    // A second close() should be a no-op, not throw.
    await adapter.close();
  });
});
