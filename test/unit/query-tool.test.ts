import { describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerQueryTool, resolveEffectiveMaxRows } from "../../src/tools/query.js";
import type { DatabaseAdapter, ExecOptions, QueryResult } from "../../src/adapters/types.js";

function fakeAdapter(execute: (sql: string, params: unknown[], opts: ExecOptions) => Promise<QueryResult>): DatabaseAdapter {
  return {
    engine: "postgresql",
    test: vi.fn(),
    listSchemas: vi.fn(),
    listTables: vi.fn(),
    describeTable: vi.fn(),
    execute,
    close: vi.fn(),
  };
}

async function connectedClientFor(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

describe("resolveEffectiveMaxRows", () => {
  it("clamps a per-call max_rows above the server cap down to the server cap", () => {
    expect(resolveEffectiveMaxRows(5000, 1000)).toBe(1000);
  });

  it("uses the requested max_rows when it is below the server cap", () => {
    expect(resolveEffectiveMaxRows(10, 1000)).toBe(10);
  });

  it("uses the server cap when no per-call max_rows is given", () => {
    expect(resolveEffectiveMaxRows(undefined, 1000)).toBe(1000);
  });
});

describe("query tool: registered handler behavior (in-memory transport, no DB)", () => {
  it("passes the clamped max_rows through to adapter.execute", async () => {
    const execute = vi.fn().mockResolvedValue({
      columns: [],
      rows: [],
      rowCount: 0,
      command: "SELECT",
      truncated: false,
    } satisfies QueryResult);
    const adapter = fakeAdapter(execute);

    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerQueryTool(server, adapter, { allowWrite: false, maxRows: 1000, queryTimeoutSeconds: 30 });

    const client = await connectedClientFor(server);
    await client.callTool({ name: "query", arguments: { sql: "select 1", max_rows: 5000 } });

    expect(execute).toHaveBeenCalledWith("select 1", [], expect.objectContaining({ maxRows: 1000 }));
  });

  it("describes itself as read-only when allowWrite is false", async () => {
    const adapter = fakeAdapter(vi.fn());
    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerQueryTool(server, adapter, { allowWrite: false, maxRows: 1000, queryTimeoutSeconds: 30 });

    const client = await connectedClientFor(server);
    const { tools } = await client.listTools();
    expect(tools[0]?.description?.toLowerCase()).toContain("read-only");
  });

  it("describes itself as write-enabled when allowWrite is true", async () => {
    const adapter = fakeAdapter(vi.fn());
    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerQueryTool(server, adapter, { allowWrite: true, maxRows: 1000, queryTimeoutSeconds: 30 });

    const client = await connectedClientFor(server);
    const { tools } = await client.listTools();
    expect(tools[0]?.description?.toLowerCase()).toContain("enabled");
  });

  it("returns an isError tool result when adapter.execute throws", async () => {
    const { DbError } = await import("../../src/errors.js");
    const execute = vi.fn().mockRejectedValue(new DbError({ category: "read_only", message: "no writes" }));
    const adapter = fakeAdapter(execute);
    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerQueryTool(server, adapter, { allowWrite: false, maxRows: 1000, queryTimeoutSeconds: 30 });

    const client = await connectedClientFor(server);
    const result = await client.callTool({ name: "query", arguments: { sql: "insert into x values (1)" } });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ category: "read_only" });
  });
});
