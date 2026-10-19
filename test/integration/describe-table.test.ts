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

describe("describe_table", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await startScramContainer();
    const parts = containerToConnectionParts(container);
    const adapter = createPostgresAdapter(configFor(parts, true));
    await adapter.execute(
      "create table users (id serial primary key, email text not null)",
      [],
      { maxRows: 10, queryTimeoutMs: 5000 },
    );
    await adapter.close();
  }, 120_000);

  afterAll(async () => {
    await container.stop();
  });

  it("describes an existing table's columns and primary key, in ordinal order", async () => {
    const parts = containerToConnectionParts(container);
    const adapter = createPostgresAdapter(configFor(parts));

    const description = await adapter.describeTable("public", "users");

    expect(description.columns.map((c) => c.name)).toEqual(["id", "email"]);
    const idColumn = description.columns[0];
    const emailColumn = description.columns[1];
    expect(idColumn).toMatchObject({ name: "id", nullable: false, ordinalPosition: 1 });
    expect(idColumn?.dataType).toBe("integer");
    expect(idColumn?.default).toMatch(/nextval/);
    expect(emailColumn).toMatchObject({ name: "email", dataType: "text", nullable: false, ordinalPosition: 2 });
    expect(description.primaryKey).toEqual(["id"]);

    await adapter.close();
  });

  it("returns a not-found error for a table that does not exist", async () => {
    const parts = containerToConnectionParts(container);
    const adapter = createPostgresAdapter(configFor(parts));

    await expect(adapter.describeTable("public", "does_not_exist")).rejects.toBeInstanceOf(DbError);

    await adapter.close();
  });
});
