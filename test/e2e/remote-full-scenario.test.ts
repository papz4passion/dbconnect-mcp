import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GenericContainer, Network } from "testcontainers";
import type { StartedNetwork, StartedTestContainer } from "testcontainers";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { generateSelfSignedCert, readCertFile } from "../integration/helpers/container.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../..");
const REMOTE_PG_ALIAS = "pg-remote";

/**
 * Full chained e2e scenario (design D15 / task 8.1): a non-localhost
 * hostname reached via a Docker network alias, sslmode=verify-full, and
 * SCRAM-SHA-256 auth. Because dbconnect-mcp is spawned over stdio by the
 * MCP SDK client (a local child process), and the "remote" Postgres host
 * is only resolvable from inside the Docker network, the client side of
 * this scenario also runs inside a throwaway Node container attached to
 * the same network, driven by test/e2e/helpers/remote-script.mjs.
 */
describe("e2e: full remote scenario (verify-full, SCRAM, non-localhost alias)", () => {
  let network: StartedNetwork;
  let pgContainer: StartedPostgreSqlContainer;
  let clientContainer: StartedTestContainer;

  beforeAll(async () => {
    network = await new Network().start();

    const cert = generateSelfSignedCert(REMOTE_PG_ALIAS);
    const certPem = readCertFile(cert.certPath);
    const keyPem = readCertFile(cert.keyPath);

    pgContainer = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("testdb")
      .withUsername("testuser")
      .withPassword("testpass")
      .withEnvironment({ POSTGRES_INITDB_ARGS: "--auth-host=scram-sha-256 --auth-local=scram-sha-256" })
      .withNetwork(network)
      .withNetworkAliases(REMOTE_PG_ALIAS)
      .withCopyContentToContainer([
        { content: certPem, target: "/tmp/server.crt", mode: 0o644 },
        { content: keyPem, target: "/tmp/server.key", mode: 0o600 },
        {
          content: [
            "#!/bin/sh",
            "set -e",
            "cp /tmp/server.crt /var/lib/postgresql/server.crt",
            "cp /tmp/server.key /var/lib/postgresql/server.key",
            "chown postgres:postgres /var/lib/postgresql/server.crt /var/lib/postgresql/server.key",
            "chmod 600 /var/lib/postgresql/server.key",
            'exec docker-entrypoint.sh "$@"',
          ].join("\n"),
          target: "/usr/local/bin/ssl-entrypoint.sh",
          mode: 0o755,
        },
      ])
      .withEntrypoint(["/usr/local/bin/ssl-entrypoint.sh"])
      .withCommand([
        "postgres",
        "-c",
        "password_encryption=scram-sha-256",
        "-c",
        "ssl=on",
        "-c",
        "ssl_cert_file=/var/lib/postgresql/server.crt",
        "-c",
        "ssl_key_file=/var/lib/postgresql/server.key",
      ])
      .start();

    clientContainer = await new GenericContainer("node:20-alpine")
      .withNetwork(network)
      .withBindMounts([
        { source: REPO_ROOT, target: "/app" },
        { source: cert.certPath, target: "/certs/server.crt" },
      ])
      .withWorkingDir("/app")
      .withCommand(["tail", "-f", "/dev/null"])
      .start();
  }, 180_000);

  afterAll(async () => {
    await clientContainer?.stop();
    await pgContainer?.stop();
    await network?.stop();
  });

  it("chains test_connection -> list_schemas -> list_tables -> describe_table -> query successfully, with no password in any captured output", async () => {
    const connectionString = `postgresql://testuser:testpass@${REMOTE_PG_ALIAS}:5432/testdb`;

    const result = await clientContainer.exec([
      "node",
      "test/e2e/helpers/remote-script.mjs",
      "dist/cli.js",
      connectionString,
      "/certs/server.crt",
    ]);

    expect(result.exitCode).toBe(0);

    const summary = JSON.parse(result.output.trim().split("\n").filter(Boolean).pop() ?? "{}") as Record<
      string,
      { isError: boolean }
    >;
    for (const [name, outcome] of Object.entries(summary)) {
      expect(outcome.isError, `${name} should not be an error`).toBe(false);
    }

    const combinedOutput = `${result.stdout}\n${result.stderr}`;
    expect(combinedOutput).not.toContain("testpass");
  }, 60_000);
});
