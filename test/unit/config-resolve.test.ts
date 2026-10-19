import { describe, expect, it } from "vitest";
import { resolveConfig, hasAnyConnectionTarget } from "../../src/config/resolve.js";
import { ConfigError } from "../../src/config/types.js";

describe("resolveConfig", () => {
  it("applies built-in defaults when nothing else is given", () => {
    const config = resolveConfig({}, {});
    expect(config.host).toBe("localhost");
    expect(config.port).toBe(5432);
    expect(config.user).toBe("postgres");
    expect(config.database).toBe("postgres");
    expect(config.sslmode).toBe("prefer");
  });

  it("uses the default port when none is supplied by any source", () => {
    const config = resolveConfig({ host: "db.example.com" }, {});
    expect(config.port).toBe(5432);
  });

  it("reads PG* environment variables", () => {
    const config = resolveConfig(
      {},
      {
        PGHOST: "envhost",
        PGPORT: "6000",
        PGUSER: "envuser",
        PGPASSWORD: "envpass",
        PGDATABASE: "envdb",
      },
    );
    expect(config.host).toBe("envhost");
    expect(config.port).toBe(6000);
    expect(config.user).toBe("envuser");
    expect(config.password).toBe("envpass");
    expect(config.database).toBe("envdb");
  });

  it("authenticates using PGPASSWORD when the host is given by flag", () => {
    const config = resolveConfig({ host: "10.0.0.5" }, { PGPASSWORD: "secret" });
    expect(config.host).toBe("10.0.0.5");
    expect(config.password).toBe("secret");
  });

  it("parses a remote connection string with sslmode", () => {
    const config = resolveConfig(
      { connectionString: "postgresql://app:secret@db.example.com:5432/sales?sslmode=require" },
      {},
    );
    expect(config.host).toBe("db.example.com");
    expect(config.port).toBe(5432);
    expect(config.database).toBe("sales");
    expect(config.user).toBe("app");
    expect(config.password).toBe("secret");
    expect(config.sslmode).toBe("require");
  });

  it("gives connection string precedence over PG* env vars", () => {
    const config = resolveConfig(
      { connectionString: "postgresql://app@db.example.com/sales" },
      { PGHOST: "envhost", PGDATABASE: "envdb" },
    );
    expect(config.host).toBe("db.example.com");
    expect(config.database).toBe("sales");
  });

  it("gives discrete flags precedence over the connection string, keeping other settings", () => {
    const config = resolveConfig(
      {
        connectionString: "postgresql://app:secret@db.example.com:5432/sales",
        database: "staging",
      },
      {},
    );
    expect(config.database).toBe("staging");
    expect(config.host).toBe("db.example.com");
    expect(config.user).toBe("app");
    expect(config.password).toBe("secret");
  });

  it("reads DATABASE_URL as a connection string source", () => {
    const config = resolveConfig({}, { DATABASE_URL: "postgresql://app@db.example.com/sales" });
    expect(config.host).toBe("db.example.com");
    expect(config.database).toBe("sales");
  });

  it("throws ConfigError for a malformed connection string without leaking it", () => {
    let caught: unknown;
    try {
      resolveConfig({ connectionString: "not a valid :// uri" }, {});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    expect((caught as ConfigError).message).toMatch(/malformed/i);
  });

  it("rejects an invalid sslmode value", () => {
    expect(() => resolveConfig({ sslmode: "yolo" }, {})).toThrowError(ConfigError);
  });

  it("hasAnyConnectionTarget detects host flag, connection string, or env vars", () => {
    expect(hasAnyConnectionTarget({}, {})).toBe(false);
    expect(hasAnyConnectionTarget({ host: "x" }, {})).toBe(true);
    expect(hasAnyConnectionTarget({}, { PGHOST: "x" })).toBe(true);
    expect(hasAnyConnectionTarget({}, { DATABASE_URL: "postgres://x/y" })).toBe(true);
    expect(hasAnyConnectionTarget({ connectionString: "postgres://x/y" }, {})).toBe(true);
  });
});
