# dbconnect-mcp

A self-contained [Model Context Protocol](https://modelcontextprotocol.io) server for PostgreSQL, started from the command line with `npx`. It speaks directly to any reachable PostgreSQL host over the wire protocol — no `psql`, proxy, or sidecar required — and is read-only by default.

## Configuration

Connection settings can come from a connection string, discrete flags, or standard PostgreSQL environment variables. Settings are resolved in this order of precedence (highest wins), each layer overriding only the keys it sets:

1. **Explicit discrete flags** (`--host`, `--port`, `--user`, `--password`, `--database`, `--sslmode`, ...)
2. **Connection string** (positional argument, `--connection-string`, or `DATABASE_URL`)
3. **`PG*` environment variables**
4. **Built-in defaults** (`host=localhost`, `port=5432`, `user=postgres`, `database=postgres`, `sslmode=prefer`)

### Connection string

```
dbconnect-mcp postgresql://app:secret@db.example.com:5432/sales?sslmode=require
dbconnect-mcp --connection-string postgresql://app:secret@db.example.com:5432/sales
DATABASE_URL=postgresql://app:secret@db.example.com:5432/sales dbconnect-mcp
```

The URI scheme must be `postgres://` or `postgresql://`. Only one connection-string source may be given — supplying both a positional string and `--connection-string` is an error.

### Discrete flags

| Flag | Description | Default |
|---|---|---|
| `--host <host>` | Hostname, IP address, or Unix socket directory | `localhost` |
| `--port <port>` | TCP port | `5432` |
| `--user <user>` | Database user | `postgres` |
| `--password <password>` | Database password | — |
| `--password-file <path>` | Read the password from a file (one trailing newline trimmed) | — |
| `--database <name>` | Database name | `postgres` |
| `--sslmode <mode>` | `disable`, `prefer`, `require`, `verify-ca`, `verify-full` | `prefer` |
| `--sslrootcert <path>` | CA bundle | — |
| `--sslcert <path>` | Client certificate | — |
| `--sslkey <path>` | Client key | — |
| `--allow-write` | Allow write/DDL statements in `query` | off (read-only) |
| `--pool-max <n>` | Max pooled connections | `5` |
| `--connect-timeout <seconds>` | Connection timeout | `10` |
| `--query-timeout <seconds>` | Statement timeout | `30` |
| `--max-rows <n>` | Maximum rows returned per query | `1000` |
| `--log-level <level>` | `error`, `warn`, `info`, `debug` | `info` |

```
dbconnect-mcp --host 10.0.0.5 --port 6543 --user report --database analytics
```

### Environment variables

Standard PostgreSQL environment variables are read as a fallback layer: `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGSSLMODE`, `PGSSLROOTCERT`, `PGSSLCERT`, `PGSSLKEY`, plus `DATABASE_URL` for a connection string.

```
PGHOST=10.0.0.5 PGUSER=report PGPASSWORD=secret dbconnect-mcp --database analytics
```

Only settings this process resolves are ever passed to the driver — `pg` never reads the environment on its own.

### SSL/TLS modes

| `sslmode` | Behavior |
|---|---|
| `disable` | No TLS |
| `prefer` (default) | Try TLS without verifying the server certificate; fall back to plaintext if the server refuses TLS |
| `require` | Require TLS, without verifying the server certificate (unless a root CA is supplied) |
| `verify-ca` | Require TLS and verify the certificate against `--sslrootcert`, without checking the hostname |
| `verify-full` | Require TLS, verify the certificate against `--sslrootcert`, and check the hostname |

`--sslcert` / `--sslkey` provide a client certificate for TLS client-certificate authentication.

### Password file

```
dbconnect-mcp --host db.example.com --user app --password-file /run/secrets/pg
```

The file's contents are read as-is except for a single trailing newline, which is trimmed. A missing file is reported as a configuration error without revealing any file contents.

## Quick start

```
npx dbconnect-mcp postgresql://app:secret@localhost:5432/mydb
```

Only Node.js and network access to the database are required — no `psql` or other PostgreSQL client tools.

### MCP client configuration

**Claude Code** (`.mcp.json` or `claude mcp add`):

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "dbconnect-mcp", "postgresql://app:secret@localhost:5432/mydb"]
    }
  }
}
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "dbconnect-mcp", "--host", "localhost", "--user", "app", "--database", "mydb"],
      "env": {
        "PGPASSWORD": "secret"
      }
    }
  }
}
```

**VS Code** (`.vscode/mcp.json`):

```json
{
  "servers": {
    "postgres": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "dbconnect-mcp", "postgresql://app:secret@localhost:5432/mydb"]
    }
  }
}
```

## Tools

### `test_connection`

Opens or checks out a connection, runs a trivial round-trip, and reports success with server version, database, user, host, port, SSL state, and latency in milliseconds. On failure, returns a tool error with a failure `category` and a remediation `hint`.

### `list_schemas`

Lists schemas visible to the connected user.

- Args: `{ include_system?: boolean }` (default `false`)
- System schemas (`pg_catalog`, `information_schema`, `pg_toast*`, `pg_temp*`) are excluded unless `include_system: true`.

```json
{ "schemas": [{ "name": "public" }, { "name": "sales" }] }
```

### `list_tables`

Lists tables, views, materialized views, and foreign tables in a schema.

- Args: `{ schema?: string }` (default `"public"`)
- Each entry has `name` and `kind` (`table`, `partitioned_table`, `view`, `materialized_view`, `foreign_table`).

```json
{ "tables": [{ "name": "orders", "kind": "table" }, { "name": "order_totals", "kind": "view" }] }
```

Returns an error if the schema does not exist.

### `describe_table`

Describes a table's columns and primary key.

- Args: `{ table: string, schema?: string }` (default schema `"public"`)
- Returns each column's `name`, `dataType`, `nullable`, `default`, and `ordinalPosition`, plus `primaryKey: string[]`.

```json
{
  "columns": [
    { "name": "id", "dataType": "integer", "nullable": false, "default": "nextval('users_id_seq'::regclass)", "ordinalPosition": 1 },
    { "name": "email", "dataType": "text", "nullable": false, "default": null, "ordinalPosition": 2 }
  ],
  "primaryKey": ["id"]
}
```

Returns an error if the table does not exist or is not visible to the connected user. Schema and table names are matched as exact data values (bound parameters), never interpolated into SQL, so names with quotes, spaces, or mixed case work safely.

### `query`

Executes one SQL statement with optional bound parameters.

- Args: `{ sql: string, params?: unknown[], max_rows?: number }`
- `params` are bound to `$1`, `$2`, … placeholders.
- `max_rows` lowers the row cap for this call; it cannot exceed `--max-rows`.

**Read-only by default.** Every call runs inside `BEGIN READ ONLY` with an unconditional `ROLLBACK`, so the database itself rejects writes, DDL, and any attempt to disguise a write in a CTE or function — no SQL parsing or keyword allow-listing is used for this guarantee. Transaction-control statements (`BEGIN`, `COMMIT`, `ROLLBACK`, `SET TRANSACTION`, etc.) are rejected before execution because they would otherwise end the wrapping transaction.

**Write mode** (`--allow-write`): each call runs in its own transaction, committed on success and rolled back on failure. The tool's description states whether writes are enabled.

For defense in depth beyond this server's own guarantees, **connect as a database role that only has read privileges** when write access is not needed.

```json
{ "sql": "select id, email from users where id = $1", "params": [42] }
```

```json
{
  "columns": [{ "name": "id", "dataType": "int4" }, { "name": "email", "dataType": "text" }],
  "rows": [{ "id": 42, "email": "a@example.com" }],
  "rowCount": 1,
  "command": "SELECT",
  "truncated": false
}
```

Large integers, `numeric`, `timestamptz`, and `bytea` values are returned as lossless strings rather than native JSON numbers, since JSON cannot represent them exactly. Query errors include the PostgreSQL SQLSTATE, message, and detail/hint/position when available.

## License

MIT
