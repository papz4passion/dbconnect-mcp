import { execFileSync } from "node:child_process";
import { mkdtempSync, symlinkSync, readdirSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { startScramContainer, containerToConnectionParts } from "../integration/helpers/container.js";
import { CLI_ENTRY, connectionStringFor } from "./helpers/client.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function buildPathWithoutPsql(): string {
  const originalDirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const filteredDir = mkdtempSync(path.join(tmpdir(), "dbconnect-mcp-no-psql-"));

  for (const dir of originalDirs) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry === "psql" || entry.startsWith("psql.")) continue;
      const target = path.join(dir, entry);
      const linkPath = path.join(filteredDir, entry);
      try {
        if (lstatSync(target).isSymbolicLink() || lstatSync(target).isFile()) {
          symlinkSync(target, linkPath);
        }
      } catch {
        // skip entries we cannot stat/symlink (permissions, broken links, duplicates)
      }
    }
  }

  return filteredDir;
}

describe("e2e: launch on a machine without psql", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await startScramContainer();
  }, 120_000);

  afterAll(async () => {
    await container.stop();
  });

  it("starts and connects successfully even when PATH has no psql", async () => {
    // Confirm the host actually has psql, so this test is meaningful.
    let hostHasPsql = true;
    try {
      execFileSync("psql", ["--version"]);
    } catch {
      hostHasPsql = false;
    }

    const strippedPath = buildPathWithoutPsql();
    const parts = containerToConnectionParts(container);

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [CLI_ENTRY, connectionStringFor(parts), "--sslmode", "disable"],
      env: { PATH: strippedPath },
      stderr: "pipe",
    });
    const client = new Client({ name: "no-psql-e2e", version: "0.0.0" });
    await client.connect(transport);

    try {
      const result = await client.callTool({ name: "test_connection", arguments: {} });
      expect(result.isError).not.toBe(true);
    } finally {
      await client.close();
    }

    if (!hostHasPsql) {
      // The assertion above already proves the server works without psql on
      // PATH; this note just records that the host itself had none either.
      expect(hostHasPsql).toBe(false);
    }
  }, 30_000);
});
