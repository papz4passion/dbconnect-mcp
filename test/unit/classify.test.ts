import { describe, expect, it } from "vitest";
import { classifyConnectionError } from "../../src/adapters/postgres/classify.js";
import { DbError } from "../../src/errors.js";

describe("classifyConnectionError", () => {
  it("maps ENOTFOUND and EAI_AGAIN to dns", () => {
    expect(classifyConnectionError({ code: "ENOTFOUND", message: "not found" }).category).toBe("dns");
    expect(classifyConnectionError({ code: "EAI_AGAIN", message: "retry" }).category).toBe("dns");
  });

  it("maps ECONNREFUSED/EHOSTUNREACH/ENETUNREACH/ECONNRESET to network", () => {
    for (const code of ["ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "ECONNRESET"]) {
      expect(classifyConnectionError({ code, message: "x" }).category).toBe("network");
    }
  });

  it("maps ETIMEDOUT and SQLSTATE 57014 to timeout", () => {
    expect(classifyConnectionError({ code: "ETIMEDOUT", message: "x" }).category).toBe("timeout");
    expect(classifyConnectionError({ code: "57014", message: "canceling statement" }).category).toBe(
      "timeout",
    );
  });

  it("maps TLS error codes/messages to ssl", () => {
    expect(
      classifyConnectionError({ code: "DEPTH_ZERO_SELF_SIGNED_CERT", message: "self signed" }).category,
    ).toBe("ssl");
    expect(
      classifyConnectionError({ message: "unable to verify the first certificate UNABLE_TO_VERIFY_LEAF_SIGNATURE" })
        .category,
    ).toBe("ssl");
    expect(classifyConnectionError({ message: "The server does not support SSL connections" }).category).toBe(
      "ssl",
    );
  });

  it("maps SQLSTATE 28P01/28000 to auth", () => {
    expect(classifyConnectionError({ code: "28P01", message: "password auth failed" }).category).toBe("auth");
    expect(classifyConnectionError({ code: "28000", message: "auth failed" }).category).toBe("auth");
  });

  it("maps SQLSTATE 3D000 to database_not_found", () => {
    expect(classifyConnectionError({ code: "3D000", message: "db missing" }).category).toBe(
      "database_not_found",
    );
  });

  it("maps SQLSTATE 57P01/57P02/57P03 to server_unavailable", () => {
    for (const code of ["57P01", "57P02", "57P03"]) {
      expect(classifyConnectionError({ code, message: "x" }).category).toBe("server_unavailable");
    }
  });

  it("maps SQLSTATE 42501 to permission", () => {
    expect(classifyConnectionError({ code: "42501", message: "denied" }).category).toBe("permission");
  });

  it("maps SQLSTATE 25006 to read_only", () => {
    expect(classifyConnectionError({ code: "25006", message: "read only" }).category).toBe("read_only");
  });

  it("maps other SQLSTATE codes to query, preserving sqlstate/detail/position", () => {
    const result = classifyConnectionError({
      code: "42601",
      message: "syntax error",
      detail: "near SELEC",
      position: "8",
    });
    expect(result.category).toBe("query");
    expect(result.sqlstate).toBe("42601");
    expect(result.detail).toBe("near SELEC");
    expect(result.position).toBe("8");
  });

  it("maps anything else to unknown", () => {
    expect(classifyConnectionError(new Error("something weird")).category).toBe("unknown");
  });

  it("redacts the message and detail through the provided redactor", () => {
    const redact = (text: string) => text.replace("secret", "****");
    const result = classifyConnectionError({ code: "28P01", message: "auth failed for secret" }, redact);
    expect(result.message).not.toContain("secret");
  });

  it("passes through an existing DbError unchanged", () => {
    const original = new DbError({ category: "timeout", message: "already classified" });
    expect(classifyConnectionError(original)).toBe(original);
  });
});
