import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ResolvedConfig } from "./config/types.js";
import type { Logger } from "./logger.js";
import { createAdapter } from "./adapters/registry.js";
import type { DatabaseAdapter } from "./adapters/types.js";
import { registerTestConnectionTool } from "./tools/test-connection.js";
import { registerListSchemasTool } from "./tools/list-schemas.js";
import { registerListTablesTool } from "./tools/list-tables.js";
import { registerDescribeTableTool } from "./tools/describe-table.js";
import { registerQueryTool } from "./tools/query.js";
import { getPackageVersion } from "./version.js";

export function createMcpServer(config: ResolvedConfig, adapter: DatabaseAdapter): McpServer {
  const server = new McpServer({
    name: "dbconnect-mcp",
    version: getPackageVersion(),
  });

  registerTestConnectionTool(server, adapter);
  registerListSchemasTool(server, adapter);
  registerListTablesTool(server, adapter);
  registerDescribeTableTool(server, adapter);
  registerQueryTool(server, adapter, {
    allowWrite: config.allowWrite,
    maxRows: config.maxRows,
    queryTimeoutSeconds: config.queryTimeoutSeconds,
  });

  return server;
}

export async function runServer(config: ResolvedConfig, logger: Logger): Promise<void> {
  const adapter = createAdapter(config);
  const server = createMcpServer(config, adapter);
  const transport = new StdioServerTransport();

  let shuttingDown = false;
  const shutdown = async (reason: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Shutting down (${reason})`);
    try {
      await server.close();
    } catch (err) {
      logger.debug(`Error while closing MCP server: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      await adapter.close();
    } catch (err) {
      logger.debug(`Error while closing database pool: ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exitCode = 0;
  };

  process.stdin.on("end", () => {
    void shutdown("stdin closed");
  });
  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  logger.info(
    `dbconnect-mcp ${getPackageVersion()} starting (host=${config.host} port=${config.port} database=${config.database} allowWrite=${config.allowWrite})`,
  );

  await server.connect(transport);
  logger.info("MCP server connected over stdio");
}
