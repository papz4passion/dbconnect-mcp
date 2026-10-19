import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createPostgresAdapter } from "../../src/adapters/postgres/adapter.js";
import type { ResolvedConfig } from "../../src/config/types.js";
import {
  startScramContainer,
  startSslContainer,
  containerToConnectionParts,
  generateSelfSignedCert,
} from "./helpers/container.js";

function baseConfig(overrides: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    host: "localhost",
    port: 5432,
    user: "testuser",
    password: "testpass",
    database: "testdb",
    sslmode: "disable",
    sslrootcert: undefined,
    sslcert: undefined,
    sslkey: undefined,
    allowWrite: false,
    poolMax: 5,
    connectTimeoutSeconds: 3,
    queryTimeoutSeconds: 10,
    maxRows: 1000,
    logLevel: "error",
    connectionStringForRedaction: undefined,
    ...overrides,
  };
}

describe("connection error classification against a real server", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await startScramContainer();
  }, 120_000);

  afterAll(async () => {
    await container.stop();
  });

  it("classifies a wrong password as auth", async () => {
    const parts = containerToConnectionParts(container);
    const adapter = createPostgresAdapter(
      baseConfig({ host: parts.host, port: parts.port, user: parts.user, password: "wrong-password", database: parts.database }),
    );
    await expect(adapter.test()).rejects.toMatchObject({ category: "auth" });
    await adapter.close();
  });

  it("classifies a missing database as database_not_found", async () => {
    const parts = containerToConnectionParts(container);
    const adapter = createPostgresAdapter(
      baseConfig({ host: parts.host, port: parts.port, user: parts.user, password: parts.password, database: "does_not_exist" }),
    );
    await expect(adapter.test()).rejects.toMatchObject({ category: "database_not_found" });
    await adapter.close();
  });

  it("classifies a closed port as network", async () => {
    const parts = containerToConnectionParts(container);
    // Port 1 is reserved and will refuse the TCP connection outright.
    const adapter = createPostgresAdapter(
      baseConfig({ host: parts.host, port: 1, user: parts.user, password: parts.password, database: parts.database }),
    );
    await expect(adapter.test()).rejects.toMatchObject({ category: "network" });
    await adapter.close();
  });

  it("classifies an unresolvable host as dns", async () => {
    const adapter = createPostgresAdapter(
      baseConfig({ host: "this-host-does-not-resolve.invalid", port: 5432, connectTimeoutSeconds: 3 }),
    );
    await expect(adapter.test()).rejects.toMatchObject({ category: "dns" });
    await adapter.close();
  });

  it("classifies a blackholed address as timeout", async () => {
    // 10.255.255.1 is a non-routable address commonly used to simulate a
    // silently-dropping host in test environments.
    const adapter = createPostgresAdapter(
      baseConfig({ host: "10.255.255.1", port: 5432, connectTimeoutSeconds: 2 }),
    );
    await expect(adapter.test()).rejects.toMatchObject({ category: "timeout" });
    await adapter.close();
  }, 15_000);

  it("classifies a verify-full hostname mismatch as ssl", async () => {
    // The cert's CN deliberately does not match the container's connect
    // host, so verify-full's hostname check must fail.
    const cert = generateSelfSignedCert("not-the-real-hostname");
    const sslContainer = await startSslContainer(cert);
    try {
      const parts = containerToConnectionParts(sslContainer);
      const adapter = createPostgresAdapter(
        baseConfig({
          host: parts.host,
          port: parts.port,
          user: parts.user,
          password: parts.password,
          database: parts.database,
          sslmode: "verify-full",
          sslrootcert: cert.certPath,
        }),
      );
      await expect(adapter.test()).rejects.toMatchObject({ category: "ssl" });
      await adapter.close();
    } finally {
      await sslContainer.stop();
    }
  }, 120_000);

  it("never includes a stack trace in the thrown error's tool payload", async () => {
    const parts = containerToConnectionParts(container);
    const adapter = createPostgresAdapter(
      baseConfig({ host: parts.host, port: parts.port, user: parts.user, password: "wrong-password", database: parts.database }),
    );
    try {
      await adapter.test();
      expect.unreachable("expected test() to throw");
    } catch (err) {
      const payload = (err as { toToolErrorPayload?: () => Record<string, unknown> }).toToolErrorPayload?.();
      expect(payload).toBeDefined();
      expect(JSON.stringify(payload)).not.toMatch(/at .*\.(js|ts):\d+/);
    }
    await adapter.close();
  });
});
