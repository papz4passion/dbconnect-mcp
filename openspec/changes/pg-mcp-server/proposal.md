# Proposal

## Why

AI assistants need a dependable way to inspect and query PostgreSQL databases, but today that usually means installing `psql`, running a proxy, or chaining through another MCP server. We want a single self-contained MCP server, started from the command line with `npx`, that speaks to any PostgreSQL host directly and is safe by default.

## What Changes

- Introduce `dbconnect-mcp`, a TypeScript/Node command-line program built on the official MCP TypeScript SDK that serves MCP over stdio.
- Connect to PostgreSQL through a bundled native driver (`pg` / node-postgres). No dependency on `psql`, a proxy, a sidecar, or any other server.
- Accept any host, local or remote, configured by connection string, CLI flags, or environment variables, with a defined precedence. Support password authentication and SSL/TLS modes (`disable` through `verify-full`, plus custom CA/cert/key).
- Expose MCP tools: `test_connection`, `list_schemas`, `list_tables`, `describe_table` (columns), and `query`.
- Run queries read-only by default; allow writes only when the server is started with an explicit opt-in flag (`--allow-write`).
- Classify failures (network/DNS, timeout, authentication, SSL, server unavailable, database missing, permission, query error) into clear, actionable messages, and never include passwords or full connection strings in tool output or logs.
- Route all database access through an engine adapter interface. Only the PostgreSQL adapter ships in this change; MySQL, SQLite, and others can be added later without changing the tool surface.
- Supersedes the earlier `local-pg-cli-validation` change, which assumed a local `psql` binary and a VS Code plugin host. That change should be removed or archived without implementation.

## Capabilities

### New Capabilities

- `mcp-server`: The CLI entry point and MCP stdio server lifecycle: startup, tool registration, help/version output, graceful shutdown.
- `connection-config`: How connection settings are supplied and resolved (connection string, flags, env vars, precedence), SSL/TLS options, and credential redaction.
- `database-connectivity`: The engine adapter contract, the PostgreSQL adapter, connection pooling, the `test_connection` tool, and connection-error classification.
- `schema-introspection`: MCP tools for listing schemas, tables/views, and describing table columns.
- `query-execution`: The `query` tool: read-only enforcement by default, write opt-in, parameter binding, row limits, timeouts, and result formatting.

### Modified Capabilities

- None (no existing specs in `openspec/specs/`).

## Impact

- New Node/TypeScript project at the repository root (`package.json`, `src/`, `tsconfig.json`, tests), published as an npm package with a `bin` entry for `npx`.
- New runtime dependencies: `@modelcontextprotocol/sdk`, `pg`, and a schema validation library (`zod`, which the MCP SDK already uses).
- Dev dependencies for building and testing, including a disposable PostgreSQL for integration tests (Docker/Testcontainers in CI).
- No existing code is affected; the repository currently contains only OpenSpec tooling.
