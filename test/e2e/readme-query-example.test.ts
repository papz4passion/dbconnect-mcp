import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { startScramContainer, containerToConnectionParts } from "../integration/helpers/container.js";
import { connectionStringFor, spawnClient } from "./helpers/client.js";

describe("e2e: README query tool example", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await startScramContainer();
  }, 120_000);

  afterAll(async () => {
    await container.stop();
  });

  it("runs the documented parameterized select example", async () => {
    const parts = containerToConnectionParts(container);
    const { client, close } = await spawnClient({
      args: [connectionStringFor(parts), "--sslmode", "disable", "--allow-write"],
    });

    try {
      await client.callTool({
        name: "query",
        arguments: { sql: "create table users (id serial primary key, email text)" },
      });
      await client.callTool({
        name: "query",
        arguments: { sql: "insert into users (id, email) values (42, 'a@example.com')" },
      });

      const result = await client.callTool({
        name: "query",
        arguments: { sql: "select id, email from users where id = $1", params: [42] },
      });

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        rows: [{ id: 42, email: "a@example.com" }],
        rowCount: 1,
        command: "SELECT",
      });
    } finally {
      await close();
    }
  }, 30_000);

  it("recommends a read-only role for defense in depth and defaults to read-only", async () => {
    const parts = containerToConnectionParts(container);
    const { client, close } = await spawnClient({ args: [connectionStringFor(parts), "--sslmode", "disable"] });
    try {
      const { tools } = await client.listTools();
      const queryTool = tools.find((t) => t.name === "query");
      expect(queryTool?.description?.toLowerCase()).toContain("read-only");
    } finally {
      await close();
    }
  }, 30_000);
});
