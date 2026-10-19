import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DatabaseAdapter } from "../adapters/types.js";
import { toolError, toolSuccess } from "../tool-result.js";

const inputShape = {
  include_system: z.boolean().optional().default(false),
};

export function registerListSchemasTool(server: McpServer, adapter: DatabaseAdapter): void {
  server.registerTool(
    "list_schemas",
    {
      description:
        "Lists schemas visible to the connected user. System schemas are excluded unless include_system is true.",
      inputSchema: inputShape,
    },
    async (args) => {
      try {
        const schemas = await adapter.listSchemas({ includeSystem: args.include_system });
        return toolSuccess({ schemas });
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
