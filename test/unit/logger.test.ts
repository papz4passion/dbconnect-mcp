import { describe, expect, it } from "vitest";
import { createLogger } from "../../src/logger.js";
import { createRedactor } from "../../src/redact.js";

describe("logger", () => {
  it("routes messages through the redactor and writes only the masked form", () => {
    const lines: string[] = [];
    const redactor = createRedactor({ password: "topsecret" });
    const logger = createLogger({ level: "debug", redactor, write: (line) => lines.push(line) });

    logger.info("connecting with password topsecret now");

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain("topsecret");
    expect(lines[0]).toContain("****");
  });

  it("writes nothing to stdout", () => {
    const stdoutWrites: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: unknown) => {
      stdoutWrites.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      const redactor = createRedactor({ password: "topsecret" });
      const logger = createLogger({ level: "debug", redactor, write: () => {} });
      logger.info("password topsecret");
    } finally {
      process.stdout.write = originalWrite;
    }

    expect(stdoutWrites).toHaveLength(0);
  });

  it("suppresses messages below the configured level", () => {
    const lines: string[] = [];
    const logger = createLogger({ level: "warn", write: (line) => lines.push(line) });

    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");

    expect(lines).toHaveLength(2);
    expect(lines.join("")).toContain("warn message");
    expect(lines.join("")).toContain("error message");
  });

  it("defaults to info level", () => {
    const lines: string[] = [];
    const logger = createLogger({ write: (line) => lines.push(line) });
    logger.debug("hidden");
    logger.info("shown");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("shown");
  });
});
