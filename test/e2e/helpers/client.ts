import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const CLI_ENTRY = path.resolve(here, "../../../dist/cli.js");

export interface SpawnClientOptions {
  args: string[];
  env?: Record<string, string>;
}

export interface SpawnedClient {
  client: Client;
  transport: StdioClientTransport;
  close: () => Promise<void>;
}

export async function spawnClient(options: SpawnClientOptions): Promise<SpawnedClient> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [CLI_ENTRY, ...options.args],
    env: options.env ?? {},
    stderr: "pipe",
  });

  const client = new Client({ name: "dbconnect-mcp-e2e", version: "0.0.0" });
  await client.connect(transport);

  return {
    client,
    transport,
    close: async () => {
      await client.close();
    },
  };
}

export function connectionStringFor(parts: {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}): string {
  return `postgresql://${parts.user}:${encodeURIComponent(parts.password)}@${parts.host}:${parts.port}/${parts.database}`;
}
