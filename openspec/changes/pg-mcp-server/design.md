# Design

## Context

The repository is greenfield: apart from OpenSpec tooling, it has no source, build, or test setup. Motivation and scope are in `proposal.md`, and behavior contracts are in `specs/` (`mcp-server`, `connection-config`, `database-connectivity`, `schema-introspection`, `query-execution`). This document covers how to build it.

Hard constraints from the specs that shape the design:
- No external client binaries or intermediary servers (`database-connectivity`: Direct native connection).
- Stdout is reserved for MCP frames (`mcp-server`: Stdio MCP transport).
- Read-only must be guaranteed by the database, not by guessing from SQL text (`query-execution`: Read-only by default).
- Credentials never leave the process in any output (`connection-config`: Credential redaction).

## Goals / Non-Goals

**Goals:**
- A small, dependency-light TypeScript codebase whose PostgreSQL specifics sit behind one adapter, so a second engine can be added without touching tool code.
- Safety guarantees that hold even for SQL we cannot parse (CTE writes, functions with side effects, multi-statement strings).
- Tests runnable on a laptop and in CI against a real PostgreSQL, covering SSL and SCRAM.

**Non-Goals:**
- HTTP/SSE or Streamable HTTP transports (stdio only for now).
- Multiple named connections or switching databases at runtime; one server process serves one connection target.
- Auth methods beyond password and TLS client certificates (no GSSAPI/Kerberos, SSPI, cloud IAM tokens, or SSH tunnelling).
- `.pgpass` / `pg_service.conf` lookup.
- MCP resources and prompts; only tools are exposed.
- `pg-native` / libpq bindings.

## Decisions

### D1. Runtime and packaging: Node ≥ 20 LTS, TypeScript, ESM, published with a `bin`
- Package `dbconnect-mcp` with `"bin": { "dbconnect-mcp": "dist/cli.js" }`, a `#!/usr/bin/env node` shebang, `"type": "module"`, `"engines": { "node": ">=20" }`, and `files: ["dist"]`.
- Compile with `tsc` to `dist/`. No bundler is needed; the dependency count is small and `npx` installs dependencies normally.
- *Alternatives:* Bun/Deno single binaries make distribution easier but leave the `npx` workflow MCP clients expect. A bundler (tsup/esbuild) adds a build step for no real gain at this size.

### D2. MCP layer: official `@modelcontextprotocol/sdk` with `McpServer` + `StdioServerTransport`
- Register tools with `zod` input schemas, which the SDK turns into JSON Schema and validates before handlers run (covers "Invalid tool arguments").
- Each tool returns `structuredContent` (typed object) **and** a `text` content block holding the same JSON, for clients without structured-output support. Failures return `isError: true` with `{ category, message, hint, sqlstate? }`.
- The `query` tool description is built at startup from the `--allow-write` flag (spec: "Tool description reflects mode").

### D3. Driver: `pg` (node-postgres), pure-JS mode
- `pg` speaks the wire protocol in-process, supports SCRAM-SHA-256 and MD5, TLS through Node's `tls`, pooling (`pg.Pool`), and extended-protocol queries. Together these satisfy "Direct native connection" with no native compilation.
- *Alternative:* `postgres` (porsager/postgres.js) is fast and modern, but `pg` is more widely deployed, has `pg-cursor` for bounded reads, and has well-known error objects (`code` = SQLSTATE).

### D4. CLI parsing: `node:util` `parseArgs` in `strict` mode
- No dependency. `strict: true` raises unknown-flag errors directly ("Unknown flag" scenario), and positional arguments are allowed for the connection string.
- `--help` and `--version` are handled before any configuration is resolved.
- *Alternative:* `commander`/`yargs` give nicer help but add a dependency for roughly 15 flags.

### D5. Configuration resolution is explicit; never let `pg` read the environment itself
- Build one `ResolvedConfig` by layering: defaults → `PG*` env → connection string (positional | `--connection-string` | `DATABASE_URL`) → discrete flags. Each layer overrides only the keys it sets (spec: "Source precedence").
- Parse URIs with `pg-connection-string`, then **remove `sslmode` and the `ssl*` params and interpret them ourselves**. Recent `pg-connection-string` versions map `sslmode=require` to full verification unless `uselibpqcompat` is set; libpq semantics (D6) are the contract here.
- Pass a complete config object to `pg.Pool` so `pg`'s implicit `PG*` handling never applies. The process then has a single source of truth.
- The engine is chosen by URI scheme, or defaults to PostgreSQL when only discrete flags or `PG*` vars are present (D8).

### D6. SSL modes mapped to Node TLS options
| sslmode | `ssl` option passed to `pg` |
|---|---|
| `disable` | `false` |
| `prefer` (default) | try `{ rejectUnauthorized: false }`; if the server refuses SSL, retry once with `false` and keep that choice for the pool |
| `require` | `{ rejectUnauthorized: false }` (encrypt, no verification; same as libpq, unless a root cert is given, in which case it behaves like `verify-ca`) |
| `verify-ca` | `{ rejectUnauthorized: true, ca, checkServerIdentity: () => undefined }` |
| `verify-full` | `{ rejectUnauthorized: true, ca, servername: host }` |
- `--sslcert` / `--sslkey` become `cert` / `key`, so TLS client-cert auth works.
- `pg` has no native `prefer`, so the fallback is our own logic, done once at first connect.

### D7. Read-only enforcement by transaction, single-statement by protocol
- Default mode wraps every call as `BEGIN READ ONLY` → `SET LOCAL statement_timeout = <ms>` → user statement → **always `ROLLBACK`**. PostgreSQL rejects writes, DDL, and `nextval()` in a read-only transaction (SQLSTATE `25006`, mapped to category `read_only`). This also catches writes in CTEs and in functions, where text inspection would fail. Because of the unconditional rollback, any session `SET` the user runs is reverted before the connection returns to the pool.
- The user statement always runs with `queryMode: 'extended'`. The extended protocol makes the server refuse multiple statements (`cannot insert multiple commands into a prepared statement`), which we turn into the "only a single statement is allowed" error. No SQL parser is needed.
- One lightweight pre-check rejects transaction-control statements (`BEGIN`, `START`, `COMMIT`, `END`, `ROLLBACK`, `ABORT`, `SAVEPOINT`, `RELEASE`, `PREPARE TRANSACTION`, `COMMIT PREPARED`, `ROLLBACK PREPARED`, `SET TRANSACTION`, `SET SESSION CHARACTERISTICS`). It looks at the first keyword after stripping leading whitespace and comments. These statements would otherwise end our wrapper transaction.
- Write mode (`--allow-write`): `BEGIN` → `SET LOCAL statement_timeout` → statement → `COMMIT` on success, `ROLLBACK` on error. The same transaction-control pre-check applies. The connection is released with `RESET ALL` so committed session settings don't leak to later calls.
- *Alternatives:* (a) Parse SQL and allow-list `SELECT`: brittle, and misses writes in CTEs and functions. (b) `default_transaction_read_only=on` at session level: the user can turn it off with `SET`. (c) Rely on a read-only DB role: good extra defence, recommended in the docs, but outside our control.

### D8. Engine adapter contract
```ts
interface DatabaseAdapter {
  readonly engine: string;                       // "postgresql"
  test(): Promise<ConnectionInfo>;
  listSchemas(opts: { includeSystem: boolean }): Promise<SchemaInfo[]>;
  listTables(schema: string): Promise<TableInfo[]>;
  describeTable(schema: string, table: string): Promise<TableDescription>;
  execute(sql: string, params: unknown[], opts: ExecOptions): Promise<QueryResult>;
  close(): Promise<void>;
}
```
- An adapter registry maps URI schemes (`postgres`, `postgresql`) to factories. Unknown schemes fail at startup with the supported list.
- Adapters throw a common `DbError { category, message, hint, sqlstate?, detail?, position? }`. Tools only ever see `DbError`.
- Lazy connect: the pool is created at startup but makes no connection until the first tool call. This satisfies "Startup without an immediate database connection".

### D9. Error classification table (PostgreSQL adapter)
| Signal | Category |
|---|---|
| `ENOTFOUND`, `EAI_AGAIN` | `dns` |
| `ECONNREFUSED`, `EHOSTUNREACH`, `ENETUNREACH`, `ECONNRESET` | `network` |
| connect timeout from `connectionTimeoutMillis`, `ETIMEDOUT`, SQLSTATE `57014` | `timeout` |
| TLS errors (`ERR_TLS_*`, `CERT_*`, `DEPTH_ZERO_SELF_SIGNED_CERT`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, "server does not support SSL") | `ssl` |
| SQLSTATE `28P01`, `28000` | `auth` |
| SQLSTATE `3D000` | `database_not_found` |
| SQLSTATE `57P01`, `57P02`, `57P03` | `server_unavailable` |
| SQLSTATE `42501` | `permission` |
| SQLSTATE `25006` | `read_only` |
| other SQLSTATE | `query` (with SQLSTATE, message, detail, hint, position) |
| anything else | `unknown` |
- Each category has a fixed remediation hint. Stack traces are logged to stderr only at `--log-level debug`, after redaction.

### D10. Redaction as a single choke point
- One `redact(text)` function, built at startup from the resolved password and any connection URIs, replaces every occurrence of the password and rewrites `scheme://user:pass@` to `scheme://user:****@`.
- All stderr logging and every error message built from a driver error go through it. Tests assert that no output contains the password (spec: "Credential redaction").

### D11. Introspection via `pg_catalog`, filtered by privilege
- `list_schemas`: `pg_namespace` filtered by `has_schema_privilege(oid, 'USAGE')`, with system schemas excluded unless `include_system`.
- `list_tables`: `pg_class` with `relkind IN ('r','p','v','m','f')` in the given namespace, filtered by `has_table_privilege(..., 'SELECT')` or the schema `USAGE` check. Kind is mapped to `table`/`partitioned_table`/`view`/`materialized_view`/`foreign_table`.
- `describe_table`: `pg_attribute` (`attnum > 0 AND NOT attisdropped`) + `format_type()` + `pg_get_expr()` for defaults + `pg_index.indisprimary` for the PK.
- Schema and table names are **bound parameters** compared with `=` against `nspname`/`relname`, so names match exactly and cannot inject SQL (spec: "Safe identifier handling"). No `quote_ident` or string building.
- *Alternative:* `information_schema` is portable but slower, omits materialized views, and shows only objects the user owns or has privileges on in inconsistent ways.

### D12. Bounded results and lossless types
- Rows are read with `pg-cursor` in batches up to `max_rows + 1`. The extra row tells us `truncated: true` without loading unbounded result sets into memory.
- Type parsers are overridden on a per-pool `types` object, not globally: `int8`, `numeric`, `money`, `date`, `timestamp`, `timestamptz`, `interval`, and `time*` are returned as the server's text, and `bytea` as `\x…` hex. `json`/`jsonb` stay parsed. This meets "lossless as strings".
- Column metadata comes from `RowDescription` (`fields[].dataTypeID`), resolved to type names through a small cached `pg_type` lookup.

### D13. Timeouts
- Connect: `connectionTimeoutMillis = --connect-timeout * 1000`.
- Statement: `SET LOCAL statement_timeout` per call (server-side cancel, SQLSTATE `57014`), plus a client-side `query_timeout` a few seconds longer as a backstop for a stuck network.

### D14. Source layout
```
src/
  cli.ts                 # parseArgs, --help/--version, bootstrap, signal handling
  server.ts              # McpServer creation + tool registration
  config/resolve.ts      # layering + validation → ResolvedConfig
  config/ssl.ts          # sslmode → tls options (D6)
  redact.ts              # D10
  errors.ts              # DbError, categories, hints
  adapters/types.ts      # DatabaseAdapter contract (D8)
  adapters/registry.ts
  adapters/postgres/{adapter,classify,introspect,execute,types}.ts
  tools/{test-connection,list-schemas,list-tables,describe-table,query}.ts
test/
  unit/…                 # config, ssl mapping, redaction, classification, tx-control precheck
  integration/…          # Testcontainers PostgreSQL 16: SCRAM, SSL, read-only, timeouts
  e2e/…                  # SDK Client + StdioClientTransport spawning dist/cli.js
```

### D15. Testing
- `vitest` for all tiers. Integration tests use `@testcontainers/postgresql` with a PostgreSQL 16 image set to `scram-sha-256`, plus a second container with a self-signed cert for `require`/`verify-ca`/`verify-full`.
- The e2e suite spawns the built CLI over stdio, so it exercises stdout cleanliness, tool listing, and shutdown on stdin close.
- CI: GitHub Actions on Ubuntu (Docker available), Node 20 and 22.

## Risks / Trade-offs

- [`prefer` fallback opens a second connection attempt on non-SSL servers] → Decide once on first connect and cache the result for the pool.
- [Read-only transactions still allow writes to temp tables and side effects from untrusted extensions such as `dblink`] → Temp tables are session-scoped and discarded. Document that a dedicated read-only database role is recommended for full defence.
- [Transaction-control pre-check is keyword-based] → It only *rejects*; it never decides that SQL is safe. The database's read-only transaction is the actual guarantee.
- [`pg-cursor` may not report the command tag / rowCount the same way for non-row-returning statements] → Integration-test it early. For statements with no `RowDescription`, fall back to a plain extended-mode `client.query`.
- [`pg-connection-string` sslmode behaviour changes between versions] → We strip and own `sslmode` (D5), and the SSL mapping tests guard against regressions.
- [Text-typed timestamps/numerics are less convenient for clients] → Lossless output wins for a database tool; column type names let clients parse.
- [One connection per process] → MCP clients can configure several server entries; multi-connection support can be a later change.

## Migration Plan

- Greenfield, so there is no runtime migration.
- Remove or archive the superseded `local-pg-cli-validation` change before implementation starts, so the two plans don't give conflicting guidance.
- Release: publish `0.1.0` to npm after CI is green. Rollback means deprecating or unpublishing the version, and users can pin an earlier `npx dbconnect-mcp@<version>`.

## Open Questions

- Is the npm package name `dbconnect-mcp` available, or should the package be scoped (e.g. `@<org>/dbconnect-mcp`)? This doesn't affect behaviour, only the install command in the docs.
