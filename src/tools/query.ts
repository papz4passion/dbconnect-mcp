import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DatabaseAdapter } from "../adapters/types.js";
import { toolError, toolSuccess } from "../tool-result.js";

const inputShape = {
  sql: z.string(),
  params: z.array(z.unknown()).optional().default([]),
  max_rows: z.number().int().positive().optional(),
};

export interface QueryToolOptions {
  allowWrite: boolean;
  maxRows: number;
  queryTimeoutSeconds: number;
}

function buildDescription(allowWrite: boolean): string {
  const mode = allowWrite
    ? "Writes are ENABLED: statements are committed on success and rolled back on failure."
    : "Read-only (default): every statement runs in a read-only transaction and is always rolled back; writes and DDL are rejected by the database.";
  return `Executes one SQL statement with optional positional parameters ($1, $2, ...). ${mode}`;
}

export function resolveEffectiveMaxRows(requested: number | undefined, serverCap: number): number {
  return requested !== undefined ? Math.min(requested, serverCap) : serverCap;
}

export function registerQueryTool(
  server: McpServer,
  adapter: DatabaseAdapter,
  options: QueryToolOptions,
): void {
  server.registerTool(
    "query",
    {
      description: buildDescription(options.allowWrite),
      inputSchema: inputShape,
    },
    async (args) => {
      try {
        const maxRows = resolveEffectiveMaxRows(args.max_rows, options.maxRows);
        const result = await adapter.execute(args.sql, args.params, {
          maxRows,
          queryTimeoutMs: options.queryTimeoutSeconds * 1000,
        });
        return toolSuccess({ ...result });
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
