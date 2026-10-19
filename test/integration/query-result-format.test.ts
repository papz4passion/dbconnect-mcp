import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createPostgresAdapter } from "../../src/adapters/postgres/adapter.js";
import { startScramContainer } from "./helpers/container.js";
import { configForContainer } from "./helpers/config.js";

describe("query tool: result format and lossless type parsers", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await startScramContainer();
  }, 120_000);

  afterAll(async () => {
    await container.stop();
  });

  it("returns columns with types, rows, rowCount, and command for a SELECT", async () => {
    const adapter = createPostgresAdapter(configForContainer(container));

    const result = await adapter.execute(
      "select 1::int4 as id, now()::timestamptz as created_at",
      [],
      { maxRows: 10, queryTimeoutMs: 5000 },
    );

    expect(result.command).toBe("SELECT");
    expect(result.rowCount).toBe(1);
    const columnNames = result.columns.map((c) => c.name);
    expect(columnNames).toEqual(["id", "created_at"]);
    const idColumn = result.columns.find((c) => c.name === "id");
    const createdAtColumn = result.columns.find((c) => c.name === "created_at");
    expect(idColumn?.dataType).toBe("int4");
    expect(createdAtColumn?.dataType).toBe("timestamptz");

    await adapter.close();
  });

  it("returns a large int8 value as a lossless string", async () => {
    const adapter = createPostgresAdapter(configForContainer(container));

    const result = await adapter.execute("select 9007199254740993::int8 as big", [], {
      maxRows: 10,
      queryTimeoutMs: 5000,
    });
    expect(result.rows[0]).toEqual({ big: "9007199254740993" });

    await adapter.close();
  });

  it("returns numeric, timestamptz, bytea, and jsonb values correctly", async () => {
    const adapter = createPostgresAdapter(configForContainer(container));

    const result = await adapter.execute(
      `select
        123456789012345678901234567890.123456789::numeric as amount,
        '2024-01-15 10:30:00+00'::timestamptz as ts,
        '\\x48656c6c6f'::bytea as data,
        '{"a": 1, "b": [2, 3]}'::jsonb as payload
      `,
      [],
      { maxRows: 10, queryTimeoutMs: 5000 },
    );

    const row = result.rows[0] as Record<string, unknown>;
    expect(row.amount).toBe("123456789012345678901234567890.123456789");
    expect(typeof row.ts).toBe("string");
    expect(row.data).toBe("\\x48656c6c6f");
    expect(row.payload).toEqual({ a: 1, b: [2, 3] });

    await adapter.close();
  });
});
