import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createPostgresAdapter } from "../../src/adapters/postgres/adapter.js";
import { DbError } from "../../src/errors.js";
import type { ResolvedConfig } from "../../src/config/types.js";
import { startScramContainer, containerToConnectionParts } from "./helpers/container.js";

function configFor(parts: ReturnType<typeof containerToConnectionParts>, allowWrite = false): ResolvedConfig {
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
    allowWrite,
    poolMax: 5,
    connectTimeoutSeconds: 5,
    queryTimeoutSeconds: 10,
    maxRows: 1000,
    logLevel: "error",
    connectionStringForRedaction: undefined,
  };
}

describe("list_tables", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await startScramContainer();
    const parts = containerToConnectionParts(container);
    const adapter = createPostgresAdapter(configFor(parts, true));
    await adapter.execute("create schema if not exists sales", [], { maxRows: 10, queryTimeoutMs: 5000 });
    await adapter.execute("create table sales.orders (id serial primary key, total numeric)", [], {
      maxRows: 10,
      queryTimeoutMs: 5000,
    });
    await adapter.execute("create view sales.order_totals as select sum(total) as total from sales.orders", [], {
      maxRows: 10,
      queryTimeoutMs: 5000,
    });
    await adapter.close();
  }, 120_000);

  afterAll(async () => {
    await container.stop();
  });

  it("lists tables and views in a schema with the correct kind", async () => {
    const parts = containerToConnectionParts(container);
    const adapter = createPostgresAdapter(configFor(parts));

    const tables = await adapter.listTables("sales");
    const byName = new Map(tables.map((t) => [t.name, t.kind]));
    expect(byName.get("orders")).toBe("table");
    expect(byName.get("order_totals")).toBe("view");

    await adapter.close();
  });

  it("returns a not-found error for a schema that does not exist", async () => {
    const parts = containerToConnectionParts(container);
    const adapter = createPostgresAdapter(configFor(parts));

    await expect(adapter.listTables("does_not_exist")).rejects.toBeInstanceOf(DbError);

    await adapter.close();
  });
});
