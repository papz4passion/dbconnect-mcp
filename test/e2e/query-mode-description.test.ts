import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { startScramContainer, containerToConnectionParts } from "../integration/helpers/container.js";
import { connectionStringFor, spawnClient } from "./helpers/client.js";

describe("e2e: query tool description reflects read-only/write mode", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await startScramContainer();
  }, 120_000);

  afterAll(async () => {
    await container.stop();
  });

  it("describes itself as read-only by default", async () => {
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

  it("describes itself as write-enabled with --allow-write", async () => {
    const parts = containerToConnectionParts(container);
    const { client, close } = await spawnClient({
      args: [connectionStringFor(parts), "--sslmode", "disable", "--allow-write"],
    });
    try {
      const { tools } = await client.listTools();
      const queryTool = tools.find((t) => t.name === "query");
      expect(queryTool?.description?.toLowerCase()).toContain("enabled");
    } finally {
      await close();
    }
  }, 30_000);
});
