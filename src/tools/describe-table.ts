import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DatabaseAdapter } from "../adapters/types.js";
import { toolError, toolSuccess } from "../tool-result.js";

const inputShape = {
  table: z.string(),
  schema: z.string().optional().default("public"),
};

export function registerDescribeTableTool(server: McpServer, adapter: DatabaseAdapter): void {
  server.registerTool(
    "describe_table",
    {
      description:
        "Describes a table's columns (name, data type, nullability, default, ordinal position) and primary key.",
      inputSchema: inputShape,
    },
    async (args) => {
      try {
        const description = await adapter.describeTable(args.schema, args.table);
        return toolSuccess({ ...description });
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
