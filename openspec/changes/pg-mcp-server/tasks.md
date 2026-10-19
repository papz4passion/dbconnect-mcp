# Tasks

## 1. Project scaffolding

- [x] 1.1 Create `package.json` (`name: dbconnect-mcp`, `type: module`, `engines.node >=20`, `bin.dbconnect-mcp: dist/cli.js`, `files: ["dist"]`, scripts `build`/`test`/`test:unit`/`test:integration`/`test:e2e`/`lint`), `tsconfig.json` (ES2022, NodeNext, strict, `outDir: dist`), and `.gitignore`; verify `npm install` and `npm run build` succeed on an empty `src/cli.ts`
- [x] 1.2 Add runtime deps `@modelcontextprotocol/sdk`, `pg`, `pg-cursor`, `pg-connection-string`, `zod` and dev deps `typescript`, `@types/node`, `@types/pg`, `vitest`, `@testcontainers/postgresql`; verify `npm ls` shows no missing peers
- [x] 1.3 Create the `src/` and `test/{unit,integration,e2e}` layout from design D14 with vitest configs separating the three tiers; verify `npm run test:unit` runs (zero tests) and exits 0
- [x] 1.4 Add a GitHub Actions workflow running build + all test tiers on Ubuntu with Node 20 and 22; verify the workflow file passes `actionlint` (or a dry run on a branch)

## 2. Errors and redaction core

- [x] 2.1 Implement `src/errors.ts` with `DbError` and the category set (`dns`, `network`, `timeout`, `auth`, `ssl`, `server_unavailable`, `database_not_found`, `permission`, `read_only`, `query`, `unknown`) plus a fixed remediation hint per category; verify unit tests assert every category has a non-empty hint
- [x] 2.2 Implement `src/redact.ts` (design D10): masks `scheme://user:pass@` URIs and every occurrence of known secrets; verify unit tests cover URI masking, raw password occurrences, URL-encoded passwords, and passwords with regex-special characters
- [x] 2.3 Implement a stderr logger with `--log-level` (`error|warn|info|debug`) that routes every message through `redact`; verify a unit test that logging a string containing the password writes only the masked form to stderr and nothing to stdout

## 3. Connection configuration

- [x] 3.1 Implement CLI parsing in `src/cli.ts` with `node:util` `parseArgs` (strict) for all flags in `connection-config` and `query-execution` specs plus `--help`, `--version`, `--log-level`, `--pool-max`, `--connect-timeout`; verify unit tests for unknown-flag error, `--help` listing every flag and env var, and `--version` printing the package version with exit 0
- [x] 3.2 Implement `src/config/resolve.ts` layering defaults → `PG*` env → connection string (positional | `--connection-string` | `DATABASE_URL`) → discrete flags, with `sslmode`/`ssl*` stripped from the URI and handled separately (design D5); verify unit tests for every "Source precedence", "Default port", "Two connection strings supplied", "Malformed connection string", and "No connection target supplied" scenario
- [x] 3.3 Implement `--password-file` reading (one trailing newline trimmed) and its precedence with other password sources; verify unit tests including a missing-file error that does not leak file contents
- [x] 3.4 Implement `src/config/ssl.ts` mapping `disable|prefer|require|verify-ca|verify-full` plus `sslrootcert`/`sslcert`/`sslkey` to TLS options per design D6; verify unit tests for each mode's resulting options and for rejecting an invalid `sslmode` value
- [x] 3.5 Write the README "Configuration" section (connection string, flags, env vars, precedence, SSL modes, password file) and verify every documented example parses with `resolve` in a unit test

## 4. Adapter contract and PostgreSQL connectivity

- [x] 4.1 Define the `DatabaseAdapter` contract and scheme registry (design D8); verify unit tests that `postgres://`/`postgresql://` select PostgreSQL, flag-only config defaults to PostgreSQL, and `mysql://` fails with the supported-engine list
- [x] 4.2 Implement the PostgreSQL adapter's lazy `pg.Pool` creation (`max = --pool-max`, `connectionTimeoutMillis`, per-pool type parsers, full explicit config so `pg` never reads env) and `close()`; verify an integration test that startup creates no connection until first use and that `close()` ends all clients
- [x] 4.3 Implement the `prefer` SSL fallback (try TLS, retry once without, cache the decision); verify integration tests against an SSL and a non-SSL container
- [x] 4.4 Implement `classify.ts` mapping Node errno, TLS errors, and SQLSTATEs to categories per design D9, with all messages passed through `redact`; verify unit tests per mapping row and integration tests for wrong password (`auth`), missing database (`database_not_found`), closed port (`network`), unresolvable host (`dns`), blackholed address (`timeout`), and `verify-full` hostname mismatch (`ssl`)
- [x] 4.5 Implement `adapter.test()` returning server version, database, user, host, port, SSL in use, and latency; verify an integration test against a SCRAM-SHA-256 container asserts all fields and that the password is absent
- [x] 4.6 Verify pool recovery: an integration test terminates the backend (`pg_terminate_backend`) between calls and asserts the next call succeeds

## 5. MCP server and `test_connection` tool

- [x] 5.1 Implement `src/server.ts` creating `McpServer` + `StdioServerTransport`, and a shared tool-result helper returning `structuredContent` plus a JSON `text` block, or `isError: true` with `{category, message, hint, sqlstate?}` (design D2); verify unit tests for both result shapes
- [x] 5.2 Register the `test_connection` tool wired to `adapter.test()`; verify an e2e test that spawns `dist/cli.js` with the SDK `StdioClientTransport`, completes initialize, and gets a successful result against a container
- [x] 5.3 Implement startup/shutdown in `cli.ts`: fail fast with non-zero exit on config errors, stay up when the DB is unreachable, and close the pool and exit 0 on stdin close, SIGINT, or SIGTERM; verify e2e tests for "Database down at startup", "Client disconnects", and that stdout contains only valid JSON-RPC frames during a run with `--log-level debug`
- [x] 5.4 Verify the "Launch on a machine without PostgreSQL client tools" scenario: run the e2e suite with `PATH` stripped of any `psql` and assert success; add the README "Quick start" section with `npx` usage and MCP client config snippets (Claude Code, Claude Desktop, VS Code)

## 6. Schema introspection tools

- [x] 6.1 Implement `introspect.ts` `listSchemas` using `pg_namespace` + `has_schema_privilege` with system-schema filtering (design D11) and register `list_schemas` with an `include_system` arg; verify integration tests for "Default listing" and "Including system schemas"
- [x] 6.2 Implement `listTables` (`relkind` r/p/v/m/f mapped to kind names, default schema `public`, not-found error) and register `list_tables`; verify integration tests for "Tables and views in a schema" and "Schema does not exist"
- [x] 6.3 Implement `describeTable` (columns with type, nullability, default, ordinal; primary key columns) and register `describe_table`; verify integration tests for "Describe an existing table" and "Table not found"
- [x] 6.4 Verify identifier safety and privilege filtering: integration tests with a mixed-case/quoted table name (`Sales."Order ""Items"""`), an injection attempt as a table name, and a restricted role with no USAGE on schema `hr`
- [x] 6.5 Document the three introspection tools (args, output shape, examples) in the README "Tools" section and verify the examples match the e2e `tools/list` schemas

## 7. Query execution tool

- [x] 7.1 Implement the transaction-control pre-check (first keyword after stripping whitespace and `--`/`/* */` comments, list per design D7); verify unit tests for each rejected keyword, comment-prefixed variants, and that `select`/`with`/`explain` pass
- [x] 7.2 Implement read-only execution: `BEGIN READ ONLY` → `SET LOCAL statement_timeout` → statement in `queryMode: 'extended'` → unconditional `ROLLBACK`, with `25006` → `read_only` and the multi-command error → single-statement message; verify integration tests for "Insert in default mode", "Write disguised in a CTE", "Multiple statements rejected", "Transaction control rejected", and that a user `SET search_path` does not persist to the next call
- [x] 7.3 Implement write mode behind `--allow-write`: `BEGIN` → statement → `COMMIT`/`ROLLBACK`, `RESET ALL` on release, and a mode-dependent `query` tool description; verify integration tests for "Update with writes enabled", "Failed write rolls back", and an e2e check of "Tool description reflects mode"
- [x] 7.4 Implement bounded reads with `pg-cursor` (`max_rows + 1`, per-call `max_rows` capped by `--max-rows`, `truncated` flag), with a plain extended-query fallback for statements without row descriptions; verify integration tests for "Result exceeds limit", "Per-call limit above server cap", and command tag/rowCount on `UPDATE` without `RETURNING`
- [x] 7.5 Implement result formatting (columns with type names via cached `pg_type` lookup, rows keyed by column, `rowCount`, `command`) and lossless type parsers per design D12; verify integration tests for "Select result", "Large integers", plus `numeric`, `timestamptz`, `bytea`, and `jsonb` values
- [x] 7.6 Implement statement timeout (`--query-timeout`, server-side `statement_timeout` + client `query_timeout` backstop); verify an integration test for "Long-running query" asserting category `timeout` and that the backend is no longer running the statement
- [x] 7.7 Implement query error reporting with SQLSTATE, message, detail, hint, and position; verify integration tests for "Syntax error" (`42601` with position) and "Missing table" (`42P01`)
- [x] 7.8 Document the `query` tool and the read-only/write model in the README, including the recommendation to use a read-only database role, and verify the documented examples run in an e2e test

## 8. End-to-end verification and release readiness

- [x] 8.1 Run a full e2e scenario through the SDK client against a remote-style container (non-localhost hostname via Docker network alias, `sslmode=verify-full`, SCRAM): `test_connection` → `list_schemas` → `list_tables` → `describe_table` → `query`; verify all succeed and that a grep of captured stdout/stderr for the password finds nothing
- [x] 8.2 Verify `npm pack` contents (only `dist`, `package.json`, `README`, `LICENSE`) and that `npx ./dbconnect-mcp-*.tgz --help` works from a clean temp directory
- [x] 8.3 Run `openspec validate pg-mcp-server --strict` and confirm it passes

## Workflow follow-up

- Remove or archive the superseded `local-pg-cli-validation` change before starting `/opsx:apply` on this one.
- Resolve the npm package name (unscoped `dbconnect-mcp` vs. scoped) before the first publish.
- Archive this change with `/opsx:archive` after implementation and review are complete.
