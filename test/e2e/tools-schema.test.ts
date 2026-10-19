import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { startScramContainer, containerToConnectionParts } from "../integration/helpers/container.js";
import { connectionStringFor, spawnClient } from "./helpers/client.js";

describe("e2e: tools/list schemas match the documented README tool args", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await startScramContainer();
  }, 120_000);

  afterAll(async () => {
    await container.stop();
  });

  it("list_schemas, list_tables, and describe_table expose the documented args", async () => {
    const parts = containerToConnectionParts(container);
    const { client, close } = await spawnClient({
      args: [connectionStringFor(parts), "--sslmode", "disable"],
    });

    try {
      const { tools } = await client.listTools();
      const byName = new Map(tools.map((t) => [t.name, t]));

      const listSchemas = byName.get("list_schemas");
      expect(listSchemas?.inputSchema.properties).toMatchObject({
        include_system: { type: "boolean" },
      });

      const listTables = byName.get("list_tables");
      expect(listTables?.inputSchema.properties).toMatchObject({
        schema: { type: "string" },
      });

      const describeTable = byName.get("describe_table");
      expect(describeTable?.inputSchema.properties).toMatchObject({
        table: { type: "string" },
        schema: { type: "string" },
      });
      expect(describeTable?.inputSchema.required).toEqual(["table"]);
    } finally {
      await close();
    }
  }, 30_000);
});
