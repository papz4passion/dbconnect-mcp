import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../../src/config/resolve.js";
import { ConfigError } from "../../src/config/types.js";

describe("--password-file", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "dbconnect-mcp-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads the password from a file and trims one trailing newline", () => {
    const file = path.join(dir, "pw");
    writeFileSync(file, "s3cret\n");
    const config = resolveConfig({ host: "x", passwordFile: file }, {});
    expect(config.password).toBe("s3cret");
  });

  it("trims only a single trailing newline", () => {
    const file = path.join(dir, "pw");
    writeFileSync(file, "s3cret\n\n");
    const config = resolveConfig({ host: "x", passwordFile: file }, {});
    expect(config.password).toBe("s3cret\n");
  });

  it("leaves a password with no trailing newline unchanged", () => {
    const file = path.join(dir, "pw");
    writeFileSync(file, "s3cret");
    const config = resolveConfig({ host: "x", passwordFile: file }, {});
    expect(config.password).toBe("s3cret");
  });

  it("throws a ConfigError for a missing file without leaking contents", () => {
    const missing = path.join(dir, "does-not-exist");
    let caught: unknown;
    try {
      resolveConfig({ host: "x", passwordFile: missing }, {});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    const message = (caught as ConfigError).message;
    expect(message).toContain(missing);
    expect(message).not.toContain("s3cret");
  });

  it("takes precedence over --password when both are given", () => {
    const file = path.join(dir, "pw");
    writeFileSync(file, "from-file\n");
    const config = resolveConfig({ host: "x", password: "from-flag", passwordFile: file }, {});
    expect(config.password).toBe("from-file");
  });
});
