import { describe, expect, it } from "vitest";
import { assertValidSslMode, buildTlsOptions } from "../../src/config/ssl.js";
import { ConfigError } from "../../src/config/types.js";

describe("ssl mode mapping", () => {
  it("maps disable to false", () => {
    expect(buildTlsOptions("disable", {}, "host")).toBe(false);
  });

  it("maps prefer to permissive TLS options (no verification)", () => {
    const opts = buildTlsOptions("prefer", {}, "host");
    expect(opts).toMatchObject({ rejectUnauthorized: false });
  });

  it("maps require to permissive TLS options (encrypt without verification)", () => {
    const opts = buildTlsOptions("require", {}, "host");
    expect(opts).toMatchObject({ rejectUnauthorized: false });
  });

  it("maps verify-ca to rejectUnauthorized true with identity check disabled", () => {
    const opts = buildTlsOptions("verify-ca", {}, "host");
    expect(opts).toMatchObject({ rejectUnauthorized: true });
    expect(typeof (opts as { checkServerIdentity?: unknown }).checkServerIdentity).toBe("function");
  });

  it("maps verify-full to rejectUnauthorized true with servername set to host", () => {
    const opts = buildTlsOptions("verify-full", {}, "db.example.com");
    expect(opts).toMatchObject({ rejectUnauthorized: true, servername: "db.example.com" });
  });

  it("rejects an invalid sslmode value", () => {
    expect(() => assertValidSslMode("bogus")).toThrowError(ConfigError);
  });

  it("accepts every documented sslmode value", () => {
    for (const mode of ["disable", "prefer", "require", "verify-ca", "verify-full"]) {
      expect(assertValidSslMode(mode)).toBe(mode);
    }
  });
});
