import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createPostgresAdapter } from "../../src/adapters/postgres/adapter.js";
import { startScramContainer } from "./helpers/container.js";
import { configForContainer } from "./helpers/config.js";

describe("query tool: query error reporting", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await startScramContainer();
  }, 120_000);

  afterAll(async () => {
    await container.stop();
  });

  it("reports a syntax error with SQLSTATE 42601, the server message, and a position", async () => {
    const adapter = createPostgresAdapter(configForContainer(container));

    try {
      await adapter.execute("selec 1", [], { maxRows: 10, queryTimeoutMs: 5000 });
      expect.unreachable("expected a syntax error");
    } catch (err) {
      const dbErr = err as { category: string; sqlstate?: string; message: string; position?: string };
      expect(dbErr.category).toBe("query");
      expect(dbErr.sqlstate).toBe("42601");
      expect(dbErr.message.toLowerCase()).toContain("syntax error");
      expect(dbErr.position).toBeDefined();
    }

    await adapter.close();
  });

  it("reports a missing table with SQLSTATE 42P01 naming the table", async () => {
    const adapter = createPostgresAdapter(configForContainer(container));

    try {
      await adapter.execute("select * from no_such_table_xyz", [], { maxRows: 10, queryTimeoutMs: 5000 });
      expect.unreachable("expected a missing-table error");
    } catch (err) {
      const dbErr = err as { category: string; sqlstate?: string; message: string };
      expect(dbErr.category).toBe("query");
      expect(dbErr.sqlstate).toBe("42P01");
      expect(dbErr.message).toContain("no_such_table_xyz");
    }

    await adapter.close();
  });
});
