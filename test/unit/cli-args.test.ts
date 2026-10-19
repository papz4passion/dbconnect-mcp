import { describe, expect, it } from "vitest";
import { parseCliArgs, HELP_TEXT } from "../../src/cli-args.js";
import { getPackageVersion } from "../../src/version.js";

describe("cli-args", () => {
  it("throws on an unknown flag", () => {
    expect(() => parseCliArgs(["--bogus-flag"])).toThrowError(/Unknown.*bogus-flag|bogus-flag/i);
  });

  it("parses --help", () => {
    const parsed = parseCliArgs(["--help"]);
    expect(parsed.help).toBe(true);
  });

  it("help text lists every flag and env var", () => {
    for (const flag of [
      "--host",
      "--port",
      "--user",
      "--password",
      "--password-file",
      "--database",
      "--sslmode",
      "--sslrootcert",
      "--sslcert",
      "--sslkey",
      "--connection-string",
      "--allow-write",
      "--pool-max",
      "--connect-timeout",
      "--query-timeout",
      "--max-rows",
      "--log-level",
      "--help",
      "--version",
    ]) {
      expect(HELP_TEXT).toContain(flag);
    }
    for (const envVar of [
      "PGHOST",
      "PGPORT",
      "PGUSER",
      "PGPASSWORD",
      "PGDATABASE",
      "PGSSLMODE",
      "PGSSLROOTCERT",
      "PGSSLCERT",
      "PGSSLKEY",
      "DATABASE_URL",
    ]) {
      expect(HELP_TEXT).toContain(envVar);
    }
  });

  it("parses --version and reports the package version", () => {
    const parsed = parseCliArgs(["--version"]);
    expect(parsed.version).toBe(true);
    const version = getPackageVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("detects two connection strings supplied", () => {
    const parsed = parseCliArgs(["postgres://a/b", "--connection-string", "postgres://c/d"]);
    expect(parsed.twoConnectionStrings).toBe(true);
  });

  it("accepts a single positional connection string", () => {
    const parsed = parseCliArgs(["postgres://a/b"]);
    expect(parsed.twoConnectionStrings).toBe(false);
    expect(parsed.flags.connectionString).toBe("postgres://a/b");
  });

  it("parses discrete flags", () => {
    const parsed = parseCliArgs(["--host", "10.0.0.5", "--port", "6543", "--user", "report", "--database", "analytics"]);
    expect(parsed.flags.host).toBe("10.0.0.5");
    expect(parsed.flags.port).toBe(6543);
    expect(parsed.flags.user).toBe("report");
    expect(parsed.flags.database).toBe("analytics");
  });

  it("rejects an invalid --log-level", () => {
    expect(() => parseCliArgs(["--log-level", "verbose"])).toThrowError(/log-level/);
  });
});
