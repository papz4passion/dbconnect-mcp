import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DatabaseAdapter } from "../adapters/types.js";
import { toolError, toolSuccess } from "../tool-result.js";

export function registerTestConnectionTool(server: McpServer, adapter: DatabaseAdapter): void {
  server.registerTool(
    "test_connection",
    {
      description:
        "Opens or checks out a connection, runs a trivial round-trip, and reports server version, database, user, host, port, SSL state, and latency.",
      inputSchema: z.object({}).shape,
    },
    async () => {
      try {
        const info = await adapter.test();
        return toolSuccess({ ...info });
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
