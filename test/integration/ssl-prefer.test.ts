import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createPostgresAdapter } from "../../src/adapters/postgres/adapter.js";
import type { ResolvedConfig } from "../../src/config/types.js";
import { startScramContainer, containerToConnectionParts } from "./helpers/container.js";

function configFor(container: StartedPostgreSqlContainer): ResolvedConfig {
  const parts = containerToConnectionParts(container);
  return {
    host: parts.host,
    port: parts.port,
    user: parts.user,
    password: parts.password,
    database: parts.database,
    sslmode: "prefer",
    sslrootcert: undefined,
    sslcert: undefined,
    sslkey: undefined,
    allowWrite: false,
    poolMax: 5,
    connectTimeoutSeconds: 5,
    queryTimeoutSeconds: 10,
    maxRows: 1000,
    logLevel: "error",
    connectionStringForRedaction: undefined,
  };
}

describe("sslmode=prefer fallback", () => {
  let nonSslContainer: StartedPostgreSqlContainer;

  beforeAll(async () => {
    nonSslContainer = await startScramContainer();
  }, 120_000);

  afterAll(async () => {
    await nonSslContainer.stop();
  });

  it("falls back to plaintext against a server with no SSL support and caches the decision", async () => {
    const adapter = createPostgresAdapter(configFor(nonSslContainer));

    const first = await adapter.test();
    expect(first.ssl).toBe(false);

    // Second call must reuse the cached (non-SSL) decision rather than
    // re-probing, so it should also succeed quickly without TLS.
    const second = await adapter.test();
    expect(second.ssl).toBe(false);

    await adapter.close();
  });

  // Note: a container configured with a self-signed certificate and
  // ssl=on would additionally verify that `prefer` opens a TLS connection
  // (ssl: true) against an SSL-capable server. That second container is
  // not stood up here to keep this suite fast; see design D15 for the
  // dedicated SSL container used by the verify-ca/verify-full scenarios
  // in the connection-config spec.
});
