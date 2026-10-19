import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { afterAll, beforeAll } from "vitest";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { startScramContainer, containerToConnectionParts } from "../integration/helpers/container.js";
import { CLI_ENTRY, connectionStringFor, spawnClient } from "./helpers/client.js";

describe("e2e: server lifecycle", () => {
  it("stays up and lists tools when the database is unreachable at startup, and test_connection reports the failure", async () => {
    const { client, close } = await spawnClient({
      args: ["--host", "127.0.0.1", "--port", "1", "--database", "unreachable", "--connect-timeout", "2"],
    });

    try {
      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name).sort()).toEqual(
        ["describe_table", "list_schemas", "list_tables", "query", "test_connection"].sort(),
      );

      const result = await client.callTool({ name: "test_connection", arguments: {} });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toHaveProperty("category");
      expect(result.structuredContent).toHaveProperty("hint");
    } finally {
      await close();
    }
  }, 30_000);

  it("releases connections and exits 0 when the client closes stdin", async () => {
    const exitPromise = new Promise<number | null>((resolve) => {
      const child = spawn(process.execPath, [CLI_ENTRY, "--host", "127.0.0.1", "--port", "1", "--database", "x"], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      child.on("exit", (code) => resolve(code));
      // give the process a moment to start, then close stdin
      setTimeout(() => child.stdin.end(), 200);
    });

    const code = await exitPromise;
    expect(code).toBe(0);
  }, 15_000);

  it("exits with a non-zero status on SIGINT after startup", async () => {
    const exitPromise = new Promise<string | null>((resolve) => {
      const child = spawn(process.execPath, [CLI_ENTRY, "--host", "127.0.0.1", "--port", "1", "--database", "x"], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      child.on("exit", (_code, signal) => resolve(signal));
      setTimeout(() => child.kill("SIGINT"), 200);
    });

    await exitPromise;
  }, 15_000);
});

describe("e2e: stdout cleanliness under --log-level debug", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await startScramContainer();
  }, 120_000);

  afterAll(async () => {
    await container.stop();
  });

  it("writes only valid JSON-RPC frames to stdout even at debug log level", async () => {
    const parts = containerToConnectionParts(container);

    const stdoutChunks: Buffer[] = [];
    const child = spawn(
      process.execPath,
      [CLI_ENTRY, connectionStringFor(parts), "--sslmode", "disable", "--log-level", "debug"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));

    const initRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "e2e", version: "0" },
      },
    };
    child.stdin.write(`${JSON.stringify(initRequest)}\n`);
    await new Promise((resolve) => setTimeout(resolve, 300));
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    await new Promise((resolve) => setTimeout(resolve, 300));
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "test_connection", arguments: {} } })}\n`);
    await new Promise((resolve) => setTimeout(resolve, 500));

    child.stdin.end();
    await new Promise((resolve) => child.on("exit", resolve));

    const stdout = Buffer.concat(stdoutChunks).toString("utf8");
    const lines = stdout.split("\n").filter((line) => line.trim().length > 0);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  }, 30_000);
});
