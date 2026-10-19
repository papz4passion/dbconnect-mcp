import { describe, expect, it } from "vitest";
import { resolveConfig } from "../../src/config/resolve.js";

describe("README configuration examples", () => {
  it("parses the positional connection string example", () => {
    const config = resolveConfig(
      { connectionString: "postgresql://app:secret@db.example.com:5432/sales?sslmode=require" },
      {},
    );
    expect(config.host).toBe("db.example.com");
    expect(config.port).toBe(5432);
    expect(config.database).toBe("sales");
    expect(config.user).toBe("app");
    expect(config.sslmode).toBe("require");
  });

  it("parses the DATABASE_URL example", () => {
    const config = resolveConfig(
      {},
      { DATABASE_URL: "postgresql://app:secret@db.example.com:5432/sales" },
    );
    expect(config.host).toBe("db.example.com");
    expect(config.database).toBe("sales");
  });

  it("parses the discrete flags example", () => {
    const config = resolveConfig(
      { host: "10.0.0.5", port: 6543, user: "report", database: "analytics" },
      {},
    );
    expect(config.host).toBe("10.0.0.5");
    expect(config.port).toBe(6543);
    expect(config.user).toBe("report");
    expect(config.database).toBe("analytics");
  });

  it("parses the PG* environment variable example", () => {
    const config = resolveConfig(
      { database: "analytics" },
      { PGHOST: "10.0.0.5", PGUSER: "report", PGPASSWORD: "secret" },
    );
    expect(config.host).toBe("10.0.0.5");
    expect(config.user).toBe("report");
    expect(config.password).toBe("secret");
    expect(config.database).toBe("analytics");
  });
});
