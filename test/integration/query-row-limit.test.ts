import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createPostgresAdapter } from "../../src/adapters/postgres/adapter.js";
import { startScramContainer } from "./helpers/container.js";
import { configForContainer } from "./helpers/config.js";

describe("query tool: row limit and bounded reads", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await startScramContainer();
    const setupAdapter = createPostgresAdapter(configForContainer(container, { allowWrite: true }));
    await setupAdapter.execute("create table big (id serial primary key)", [], {
      maxRows: 10,
      queryTimeoutMs: 5000,
    });
    await setupAdapter.execute("insert into big select generate_series(1, 5000)", [], {
      maxRows: 10,
      queryTimeoutMs: 30000,
    });
    await setupAdapter.close();
  }, 120_000);

  afterAll(async () => {
    await container.stop();
  });

  it("caps rows at the server max and marks the result truncated", async () => {
    const adapter = createPostgresAdapter(configForContainer(container));

    const result = await adapter.execute("select * from big order by id", [], {
      maxRows: 1000,
      queryTimeoutMs: 10000,
    });
    expect(result.rows).toHaveLength(1000);
    expect(result.truncated).toBe(true);

    await adapter.close();
  });

  it("respects whatever maxRows the caller passes as the cursor read limit", async () => {
    // The `query` tool clamps a per-call max_rows argument to --max-rows
    // before calling execute() (see src/tools/query.ts and its unit test);
    // this exercises the adapter's own enforcement of that already-resolved
    // limit against a real cursor read.
    const adapter = createPostgresAdapter(configForContainer(container));

    const result = await adapter.execute("select * from big order by id", [], {
      maxRows: 100,
      queryTimeoutMs: 10000,
    });
    expect(result.rows).toHaveLength(100);
    expect(result.truncated).toBe(true);

    await adapter.close();
  });

  it("reports an accurate command tag and rowCount for an UPDATE without RETURNING", async () => {
    const adapter = createPostgresAdapter(configForContainer(container, { allowWrite: true }));

    const result = await adapter.execute("update big set id = id where id <= 10", [], {
      maxRows: 1000,
      queryTimeoutMs: 10000,
    });
    expect(result.command).toBe("UPDATE");
    expect(result.rowCount).toBe(10);
    expect(result.rows).toEqual([]);

    await adapter.close();
  });
});
