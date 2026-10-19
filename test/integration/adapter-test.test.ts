import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createPostgresAdapter } from "../../src/adapters/postgres/adapter.js";
import type { ResolvedConfig } from "../../src/config/types.js";
import { startScramContainer, containerToConnectionParts } from "./helpers/container.js";

describe("adapter.test() against a SCRAM-SHA-256 server", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await startScramContainer();
  }, 120_000);

  afterAll(async () => {
    await container.stop();
  });

  it("returns server version, database, user, host, port, SSL state, and latency, with no password present", async () => {
    const parts = containerToConnectionParts(container);
    const config: ResolvedConfig = {
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
    const adapter = createPostgresAdapter(config);

    const info = await adapter.test();

    expect(info.serverVersion).toMatch(/PostgreSQL/);
    expect(info.database).toBe(parts.database);
    expect(info.user).toBe(parts.user);
    expect(info.host).toBe(parts.host);
    expect(info.port).toBe(parts.port);
    expect(info.ssl).toBe(false);
    expect(info.latencyMs).toBeGreaterThanOrEqual(0);

    const serialized = JSON.stringify(info);
    expect(serialized).not.toContain(parts.password);

    await adapter.close();
  });
});
