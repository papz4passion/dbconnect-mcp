import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";

export const SCRAM_IMAGE = "postgres:16-alpine";

export async function startScramContainer(): Promise<StartedPostgreSqlContainer> {
  const container = await new PostgreSqlContainer(SCRAM_IMAGE)
    .withDatabase("testdb")
    .withUsername("testuser")
    .withPassword("testpass")
    .withEnvironment({ POSTGRES_INITDB_ARGS: "--auth-host=scram-sha-256 --auth-local=scram-sha-256" })
    .withCommand(["-c", "password_encryption=scram-sha-256"])
    .start();
  return container;
}

export interface ConnectionParts {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function containerToConnectionParts(container: StartedPostgreSqlContainer): ConnectionParts {
  return {
    host: container.getHost(),
    port: container.getPort(),
    user: container.getUsername(),
    password: container.getPassword(),
    database: container.getDatabase(),
  };
}

export interface SelfSignedCert {
  certPath: string;
  keyPath: string;
  commonName: string;
}

/**
 * Generates a self-signed certificate with `openssl` on the host and returns
 * the local file paths. Used to stand up a PostgreSQL container with SSL
 * enabled for the sslmode=require/verify-ca/verify-full and prefer-fallback
 * integration scenarios (design D15).
 */
export function generateSelfSignedCert(commonName = "localhost"): SelfSignedCert {
  const dir = mkdtempSync(path.join(tmpdir(), "dbconnect-mcp-ssl-"));
  const keyPath = path.join(dir, "server.key");
  const certPath = path.join(dir, "server.crt");

  execFileSync("openssl", [
    "req",
    "-new",
    "-x509",
    "-days",
    "365",
    "-nodes",
    "-text",
    "-out",
    certPath,
    "-keyout",
    keyPath,
    "-subj",
    `/CN=${commonName}`,
  ]);

  return { certPath, keyPath, commonName };
}

export function readCertFile(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

export async function startSslContainer(cert: SelfSignedCert): Promise<StartedPostgreSqlContainer> {
  const certPem = readCertFile(cert.certPath);
  const keyPem = readCertFile(cert.keyPath);

  // postgres refuses to start if the key file is group/world-readable or not
  // owned by the server's running user; files copied into the container by
  // the docker daemon land as root, so we chown/chmod them via a startup
  // wrapper before invoking the image's normal entrypoint.
  const container = await new PostgreSqlContainer(SCRAM_IMAGE)
    .withDatabase("testdb")
    .withUsername("testuser")
    .withPassword("testpass")
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
      "ssl=on",
      "-c",
      "ssl_cert_file=/var/lib/postgresql/server.crt",
      "-c",
      "ssl_key_file=/var/lib/postgresql/server.key",
    ])
    .start();
  return container;
}
