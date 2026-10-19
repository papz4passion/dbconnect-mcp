import type { Redactor } from "./redact.js";
import { identityRedactor } from "./redact.js";

export type LogLevel = "error" | "warn" | "info" | "debug";

const LEVEL_ORDER: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export interface Logger {
  readonly level: LogLevel;
  error(message: string): void;
  warn(message: string): void;
  info(message: string): void;
  debug(message: string): void;
}

export interface CreateLoggerOptions {
  level?: LogLevel;
  redactor?: Redactor;
  write?: (line: string) => void;
}

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const level = options.level ?? "info";
  const redactor = options.redactor ?? identityRedactor;
  const write = options.write ?? ((line: string) => process.stderr.write(line));

  function emit(msgLevel: LogLevel, message: string): void {
    if (LEVEL_ORDER[msgLevel] > LEVEL_ORDER[level]) return;
    const redacted = redactor(message);
    write(`[${msgLevel}] ${redacted}\n`);
  }

  return {
    level,
    error: (message: string) => emit("error", message),
    warn: (message: string) => emit("warn", message),
    info: (message: string) => emit("info", message),
    debug: (message: string) => emit("debug", message),
  };
}
