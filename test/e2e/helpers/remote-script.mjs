import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [, , cliEntry, connectionString, sslrootcert] = process.argv;

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      cliEntry,
      connectionString,
      "--sslmode",
      "verify-full",
      "--sslrootcert",
      sslrootcert,
      "--allow-write",
    ],
  });
  const client = new Client({ name: "remote-e2e", version: "0.0.0" });
  await client.connect(transport);

  const testResult = await client.callTool({ name: "test_connection", arguments: {} });
  const schemasResult = await client.callTool({ name: "list_schemas", arguments: {} });
  const createResult = await client.callTool({
    name: "query",
    arguments: { sql: "create table if not exists remote_check (id serial primary key, note text)" },
  });
  const tablesResult = await client.callTool({ name: "list_tables", arguments: { schema: "public" } });
  const describeResult = await client.callTool({
    name: "describe_table",
    arguments: { table: "remote_check", schema: "public" },
  });
  const queryResult = await client.callTool({
    name: "query",
    arguments: { sql: "select $1::text as note", params: ["hello"] },
  });

  await client.close();

  const summary = {
    test: { isError: testResult.isError ?? false, structuredContent: testResult.structuredContent },
    schemas: { isError: schemasResult.isError ?? false },
    create: { isError: createResult.isError ?? false },
    tables: { isError: tablesResult.isError ?? false },
    describe: { isError: describeResult.isError ?? false },
    query: { isError: queryResult.isError ?? false, structuredContent: queryResult.structuredContent },
  };

  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

main().catch((err) => {
  process.stderr.write(`REMOTE_SCRIPT_FAILURE: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exitCode = 1;
});
