import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createPostgresAdapter } from "../../src/adapters/postgres/adapter.js";
import { startScramContainer } from "./helpers/container.js";
import { configForContainer } from "./helpers/config.js";

describe("query tool: write mode (--allow-write)", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await startScramContainer();
    const setupAdapter = createPostgresAdapter(configForContainer(container, { allowWrite: true }));
    await setupAdapter.execute(
      "create table accounts (id serial primary key, name text unique, active boolean default true)",
      [],
      { maxRows: 10, queryTimeoutMs: 5000 },
    );
    await setupAdapter.execute("insert into accounts (name) values ('alice'), ('bob')", [], {
      maxRows: 10,
      queryTimeoutMs: 5000,
    });
    await setupAdapter.close();
  }, 120_000);

  afterAll(async () => {
    await container.stop();
  });

  it("commits an UPDATE and reports the number of affected rows", async () => {
    const adapter = createPostgresAdapter(configForContainer(container, { allowWrite: true }));

    const result = await adapter.execute("update accounts set active = false where name = $1", ["alice"], {
      maxRows: 10,
      queryTimeoutMs: 5000,
    });
    expect(result.rowCount).toBe(1);
    expect(result.command).toBe("UPDATE");

    const verifyAdapter = createPostgresAdapter(configForContainer(container));
    const check = await verifyAdapter.execute("select active from accounts where name = $1", ["alice"], {
      maxRows: 10,
      queryTimeoutMs: 5000,
    });
    expect(check.rows[0]).toMatchObject({ active: false });

    await adapter.close();
    await verifyAdapter.close();
  });

  it("rolls back a failed write with no partial changes", async () => {
    const adapter = createPostgresAdapter(configForContainer(container, { allowWrite: true }));

    await expect(
      adapter.execute("insert into accounts (name) values ('carol'), ('bob')", [], {
        maxRows: 10,
        queryTimeoutMs: 5000,
      }),
    ).rejects.toBeDefined();

    const check = await adapter.execute("select count(*)::int as count from accounts where name = $1", ["carol"], {
      maxRows: 10,
      queryTimeoutMs: 5000,
    });
    expect(check.rows[0]).toMatchObject({ count: 0 });

    await adapter.close();
  });
});
