import { describe, expect, it } from "vitest";
import { createRedactor } from "../../src/redact.js";

describe("redact", () => {
  it("masks credentials embedded in a connection URI", () => {
    const redact = createRedactor({ password: "secret" });
    const input = "connecting to postgresql://app:secret@db.example.com:5432/sales";
    const output = redact(input);
    expect(output).toBe("connecting to postgresql://app:****@db.example.com:5432/sales");
    expect(output).not.toContain("secret");
  });

  it("masks raw occurrences of the password outside a URI", () => {
    const redact = createRedactor({ password: "s3cr3t-P@ss" });
    const input = "authentication failed for password s3cr3t-P@ss given by user";
    const output = redact(input);
    expect(output).not.toContain("s3cr3t-P@ss");
    expect(output).toContain("****");
  });

  it("masks URL-encoded passwords found in connection strings", () => {
    const encodedPassword = "p%40ss%2Fword";
    const connectionString = `postgresql://app:${encodedPassword}@db.example.com/sales`;
    const redact = createRedactor({ connectionStrings: [connectionString] });

    const maskedUri = redact(connectionString);
    expect(maskedUri).toBe("postgresql://app:****@db.example.com/sales");

    const decodedOccurrence = "the raw password was p@ss/word in the log";
    const maskedDecoded = redact(decodedOccurrence);
    expect(maskedDecoded).not.toContain("p@ss/word");
  });

  it("masks passwords containing regex-special characters", () => {
    const password = "a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o";
    const redact = createRedactor({ password });
    const input = `password is ${password} end`;
    const output = redact(input);
    expect(output).not.toContain(password);
    expect(output).toContain("****");
  });

  it("masks multiple distinct secrets in the same text", () => {
    const redact = createRedactor({
      password: "mainpass",
      connectionStrings: ["postgresql://u1:other-pass@host/db"],
    });
    const input = "mainpass and other-pass should both disappear";
    const output = redact(input);
    expect(output).not.toContain("mainpass");
    expect(output).not.toContain("other-pass");
  });

  it("leaves text without secrets unchanged", () => {
    const redact = createRedactor({ password: "secret" });
    const input = "connected to host as user app";
    expect(redact(input)).toBe(input);
  });

  it("handles empty secrets gracefully", () => {
    const redact = createRedactor({});
    const input = "postgresql://app:whatever@host/db";
    expect(redact(input)).toBe("postgresql://app:****@host/db");
  });
});
