import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { createPostgresAdapter } from "../../src/adapters/postgres/adapter.js";
import { startScramContainer, containerToConnectionParts } from "./helpers/container.js";
import { configForContainer } from "./helpers/config.js";

describe("query tool: statement timeout", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await startScramContainer();
  }, 120_000);

  afterAll(async () => {
    await container.stop();
  });

  it("cancels pg_sleep(60) under a 2-second timeout and reports category timeout", async () => {
    const adapter = createPostgresAdapter(configForContainer(container, { queryTimeoutSeconds: 2 }));

    await expect(
      adapter.execute("select pg_sleep(60)", [], { maxRows: 10, queryTimeoutMs: 2000 }),
    ).rejects.toMatchObject({ category: "timeout" });

    await adapter.close();
  }, 20_000);

  it("leaves no backend still running the cancelled statement", async () => {
    const adapter = createPostgresAdapter(configForContainer(container, { queryTimeoutSeconds: 2 }));

    await expect(
      adapter.execute("select pg_sleep(60)", [], { maxRows: 10, queryTimeoutMs: 2000 }),
    ).rejects.toMatchObject({ category: "timeout" });

    // Give PostgreSQL a moment to finish cancelling the backend.
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const parts = containerToConnectionParts(container);
    const admin = new pg.Client({
      host: parts.host,
      port: parts.port,
      user: parts.user,
      password: parts.password,
      database: parts.database,
    });
    await admin.connect();
    try {
      const result = await admin.query(
        `select count(*)::int as count from pg_stat_activity where query like '%pg_sleep%' and state = 'active'`,
      );
      expect((result.rows[0] as { count: number }).count).toBe(0);
    } finally {
      await admin.end();
    }

    await adapter.close();
  }, 20_000);
});
