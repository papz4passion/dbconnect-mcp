import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DatabaseAdapter } from "../adapters/types.js";
import { toolError, toolSuccess } from "../tool-result.js";

const inputShape = {
  schema: z.string().optional().default("public"),
};

export function registerListTablesTool(server: McpServer, adapter: DatabaseAdapter): void {
  server.registerTool(
    "list_tables",
    {
      description:
        "Lists tables, views, materialized views, and foreign tables in a schema (default: public).",
      inputSchema: inputShape,
    },
    async (args) => {
      try {
        const tables = await adapter.listTables(args.schema);
        return toolSuccess({ tables });
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
