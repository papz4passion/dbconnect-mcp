import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createPostgresAdapter } from "../../src/adapters/postgres/adapter.js";
import type { ResolvedConfig } from "../../src/config/types.js";
import { startScramContainer, containerToConnectionParts } from "./helpers/container.js";

describe("pool recovery after a dropped connection", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await startScramContainer();
  }, 120_000);

  afterAll(async () => {
    await container.stop();
  });

  it("obtains a fresh connection and succeeds after the backend is terminated", async () => {
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
      poolMax: 2,
      connectTimeoutSeconds: 5,
      queryTimeoutSeconds: 10,
      maxRows: 1000,
      logLevel: "error",
      connectionStringForRedaction: undefined,
    };
    const adapter = createPostgresAdapter(config);

    await adapter.test();

    const admin = new pg.Client({
      host: parts.host,
      port: parts.port,
      user: parts.user,
      password: parts.password,
      database: parts.database,
    });
    await admin.connect();
    try {
      await admin.query(
        `select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`,
        [parts.database],
      );
    } finally {
      await admin.end();
    }

    const info = await adapter.test();
    expect(info.database).toBe(parts.database);

    await adapter.close();
  });
});
