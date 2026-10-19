import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createPostgresAdapter } from "../../src/adapters/postgres/adapter.js";
import { DbError } from "../../src/errors.js";
import type { ResolvedConfig } from "../../src/config/types.js";
import { startScramContainer, containerToConnectionParts } from "./helpers/container.js";

function configFor(
  parts: ReturnType<typeof containerToConnectionParts>,
  overrides: Partial<ResolvedConfig> = {},
): ResolvedConfig {
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
    ...overrides,
  };
}

describe("introspection safety and privilege filtering", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await startScramContainer();
    const parts = containerToConnectionParts(container);
    const adapter = createPostgresAdapter(configFor(parts, { allowWrite: true }));

    await adapter.execute('create schema "Sales"', [], { maxRows: 10, queryTimeoutMs: 5000 });
    await adapter.execute(
      'create table "Sales"."Order ""Items""" (id serial primary key, qty int)',
      [],
      { maxRows: 10, queryTimeoutMs: 5000 },
    );

    await adapter.execute("create schema hr", [], { maxRows: 10, queryTimeoutMs: 5000 });
    await adapter.execute("create table hr.employees (id serial primary key, ssn text)", [], {
      maxRows: 10,
      queryTimeoutMs: 5000,
    });

    await adapter.execute("create role restricted_role login password 'restrictedpass'", [], {
      maxRows: 10,
      queryTimeoutMs: 5000,
    });
    await adapter.execute("grant connect on database testdb to restricted_role", [], {
      maxRows: 10,
      queryTimeoutMs: 5000,
    });
    await adapter.execute('grant usage on schema public to restricted_role', [], {
      maxRows: 10,
      queryTimeoutMs: 5000,
    });
    // deliberately do NOT grant usage on schema hr to restricted_role

    await adapter.close();
  }, 120_000);

  afterAll(async () => {
    await container.stop();
  });

  it("describes a mixed-case, quoted table name exactly, via bound parameters", async () => {
    const parts = containerToConnectionParts(container);
    const adapter = createPostgresAdapter(configFor(parts));

    const description = await adapter.describeTable("Sales", 'Order "Items"');
    expect(description.columns.map((c) => c.name)).toEqual(["id", "qty"]);

    await adapter.close();
  });

  it("reports not-found (never executes other SQL) for an injection attempt as a table name", async () => {
    const parts = containerToConnectionParts(container);
    const adapter = createPostgresAdapter(configFor(parts));

    const maliciousName = `nonexistent"; drop table "Sales"."Order ""Items"""; --`;
    await expect(adapter.describeTable("public", maliciousName)).rejects.toBeInstanceOf(DbError);

    // The targeted table must still exist afterwards.
    const stillThere = await adapter.describeTable("Sales", 'Order "Items"');
    expect(stillThere.columns.length).toBeGreaterThan(0);

    await adapter.close();
  });

  it("hides schema hr from a role with no USAGE privilege on it", async () => {
    const parts = containerToConnectionParts(container);
    const restrictedAdapter = createPostgresAdapter(
      configFor(parts, { user: "restricted_role", password: "restrictedpass" }),
    );

    const schemas = await restrictedAdapter.listSchemas({ includeSystem: false });
    expect(schemas.map((s) => s.name)).not.toContain("hr");

    // The hr schema exists at the catalog level, but the restricted role has
    // no USAGE on it, so no tables inside it should be revealed.
    const hrTables = await restrictedAdapter.listTables("hr");
    expect(hrTables).toEqual([]);

    await restrictedAdapter.close();
  });
});
