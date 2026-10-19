import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { startScramContainer, containerToConnectionParts } from "../integration/helpers/container.js";
import { connectionStringFor, spawnClient } from "./helpers/client.js";

describe("e2e: test_connection", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await startScramContainer();
  }, 120_000);

  afterAll(async () => {
    await container.stop();
  });

  it("completes initialize and returns a successful test_connection result", async () => {
    const parts = containerToConnectionParts(container);
    const { client, close } = await spawnClient({
      args: [connectionStringFor(parts), "--sslmode", "disable"],
    });

    try {
      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name)).toContain("test_connection");

      const result = await client.callTool({ name: "test_connection", arguments: {} });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ database: parts.database, user: parts.user });
    } finally {
      await close();
    }
  }, 30_000);
});
