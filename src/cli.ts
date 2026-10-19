#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCliArgs, HELP_TEXT } from "./cli-args.js";
import { hasAnyConnectionTarget, resolveConfig } from "./config/resolve.js";
import { ConfigError } from "./config/types.js";
import { getPackageVersion } from "./version.js";
import { createRedactor } from "./redact.js";
import { createLogger } from "./logger.js";
import { runServer } from "./server.js";

export function main(argv: string[] = process.argv.slice(2)): void {
  let parsedCli: ReturnType<typeof parseCliArgs>;
  try {
    parsedCli = parseCliArgs(argv);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
    return;
  }

  if (parsedCli.help) {
    process.stdout.write(HELP_TEXT);
    process.exitCode = 0;
    return;
  }

  if (parsedCli.version) {
    process.stdout.write(`${getPackageVersion()}\n`);
    process.exitCode = 0;
    return;
  }

  if (parsedCli.twoConnectionStrings) {
    process.stderr.write(
      "Conflicting options: both a positional connection string and --connection-string were given. Supply only one.\n",
    );
    process.exitCode = 1;
    return;
  }

  const env = process.env;

  if (!hasAnyConnectionTarget(parsedCli.flags, env)) {
    process.stderr.write(
      "No connection target supplied. Provide a connection string, --host, or PG* environment variables. Run with --help for details.\n",
    );
    process.exitCode = 1;
    return;
  }

  let config;
  try {
    config = resolveConfig(parsedCli.flags, env);
  } catch (err) {
    const message = err instanceof ConfigError ? err.message : String(err);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
    return;
  }

  const redactor = createRedactor({
    password: config.password,
    connectionStrings: config.connectionStringForRedaction
      ? [config.connectionStringForRedaction]
      : [],
  });
  const logger = createLogger({ level: config.logLevel, redactor });

  runServer(config, logger).catch((err) => {
    logger.error(`Fatal error: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    process.exitCode = 1;
  });
}

function isMainModule(): boolean {
  const invokedPath = process.argv[1];
  if (!invokedPath) return false;
  try {
    const thisFile = fileURLToPath(import.meta.url);
    // npx/npm install the bin as a symlink (e.g. node_modules/.bin/dbconnect-mcp
    // -> ../dbconnect-mcp/dist/cli.js); process.argv[1] is the symlink path,
    // so resolve both sides through the real filesystem path before comparing.
    return realpathSync(invokedPath) === realpathSync(thisFile);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main();
}
