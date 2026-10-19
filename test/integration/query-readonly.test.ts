import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createPostgresAdapter } from "../../src/adapters/postgres/adapter.js";
import { DbError } from "../../src/errors.js";
import { startScramContainer } from "./helpers/container.js";
import { configForContainer } from "./helpers/config.js";

describe("query tool: read-only enforcement (default mode)", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await startScramContainer();
    const setupAdapter = createPostgresAdapter(configForContainer(container, { allowWrite: true }));
    await setupAdapter.execute("create table users (id serial primary key, email text, active boolean default true)", [], {
      maxRows: 10,
      queryTimeoutMs: 5000,
    });
    await setupAdapter.execute("insert into users (email) values ('a@example.com'), ('b@example.com')", [], {
      maxRows: 10,
      queryTimeoutMs: 5000,
    });
    await setupAdapter.close();
  }, 120_000);

  afterAll(async () => {
    await container.stop();
  });

  it("rejects an INSERT with category read_only and inserts no row", async () => {
    const adapter = createPostgresAdapter(configForContainer(container));

    await expect(
      adapter.execute("insert into users (email) values ('c@example.com')", [], {
        maxRows: 10,
        queryTimeoutMs: 5000,
      }),
    ).rejects.toMatchObject({ category: "read_only" });

    const countResult = await adapter.execute("select count(*)::int as count from users", [], {
      maxRows: 10,
      queryTimeoutMs: 5000,
    });
    expect(countResult.rows[0]).toMatchObject({ count: 2 });

    await adapter.close();
  });

  it("rejects a write disguised in a CTE and deletes no row", async () => {
    const adapter = createPostgresAdapter(configForContainer(container));

    await expect(
      adapter.execute("with d as (delete from users returning *) select * from d", [], {
        maxRows: 10,
        queryTimeoutMs: 5000,
      }),
    ).rejects.toBeInstanceOf(DbError);

    const countResult = await adapter.execute("select count(*)::int as count from users", [], {
      maxRows: 10,
      queryTimeoutMs: 5000,
    });
    expect(countResult.rows[0]).toMatchObject({ count: 2 });

    await adapter.close();
  });

  it("rejects multiple statements and executes nothing", async () => {
    const adapter = createPostgresAdapter(configForContainer(container));

    await expect(
      adapter.execute("select 1; select 2", [], { maxRows: 10, queryTimeoutMs: 5000 }),
    ).rejects.toMatchObject({ category: "query" });

    await adapter.close();
  });

  it("rejects transaction-control statements while keeping the read-only guarantee", async () => {
    const adapter = createPostgresAdapter(configForContainer(container));

    for (const stmt of ["BEGIN", "COMMIT", "ROLLBACK", "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE"]) {
      await expect(
        adapter.execute(stmt, [], { maxRows: 10, queryTimeoutMs: 5000 }),
      ).rejects.toBeInstanceOf(DbError);
    }

    // The read-only guarantee must still hold for subsequent calls.
    await expect(
      adapter.execute("insert into users (email) values ('x@example.com')", [], {
        maxRows: 10,
        queryTimeoutMs: 5000,
      }),
    ).rejects.toMatchObject({ category: "read_only" });

    await adapter.close();
  });

  it("does not let a SET search_path from one call persist to the next", async () => {
    const adapter = createPostgresAdapter(configForContainer(container));

    await adapter.execute("set search_path to pg_catalog", [], { maxRows: 10, queryTimeoutMs: 5000 });

    // If search_path leaked, "users" (in public) would not resolve here.
    const result = await adapter.execute("select count(*)::int as count from users", [], {
      maxRows: 10,
      queryTimeoutMs: 5000,
    });
    expect(result.rows[0]).toMatchObject({ count: 2 });

    await adapter.close();
  });
});
