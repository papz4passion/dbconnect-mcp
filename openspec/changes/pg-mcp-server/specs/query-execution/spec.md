# Spec Delta

## Purpose

Defines the `query` MCP tool: how SQL is executed against the connected database, how read-only safety is enforced by default, how writes are opted into, and how results and query errors are returned.

## ADDED Requirements

### Requirement: Query tool
The system SHALL provide a `query` tool that accepts one SQL statement (`sql`) and an optional array of positional parameters (`params`) bound to `$1`, `$2`, … placeholders, and executes it on the connected database.

#### Scenario: Parameterized select
- **WHEN** `query` is called with `sql: "select id, email from users where id = $1"` and `params: [42]`
- **THEN** the statement runs with `42` bound as a parameter and the matching row is returned

#### Scenario: Multiple statements rejected
- **WHEN** `query` is called with `sql` containing more than one statement (e.g. `select 1; select 2`)
- **THEN** the tool returns an error stating that only a single statement is allowed, and nothing is executed

### Requirement: Read-only by default
Unless the server was started with `--allow-write`, the system SHALL execute every `query` call inside a read-only transaction, so the database itself rejects any statement that writes data or changes the schema. The transaction MUST NOT be committed with side effects.

#### Scenario: Insert in default mode
- **WHEN** the server runs without `--allow-write` and `query` is called with an `INSERT`
- **THEN** the tool returns an error with category `read_only` explaining that writes require `--allow-write`, and no row is inserted

#### Scenario: Write disguised in a CTE
- **WHEN** the server runs without `--allow-write` and `query` is called with `with d as (delete from users returning *) select * from d`
- **THEN** the statement is rejected and no row is deleted

#### Scenario: Transaction control rejected
- **WHEN** `query` is called with `COMMIT`, `ROLLBACK`, `BEGIN`, or `SET TRANSACTION` in default mode
- **THEN** the tool returns an error and the read-only guarantee stays in force

### Requirement: Write opt-in
When started with `--allow-write`, the system SHALL let `query` run data-modifying and DDL statements, committing each call as its own transaction. The `query` tool description MUST state whether writes are enabled.

#### Scenario: Update with writes enabled
- **WHEN** the server runs with `--allow-write` and `query` is called with `update users set active = false where id = $1`
- **THEN** the update is committed and the result reports the number of affected rows

#### Scenario: Failed write rolls back
- **WHEN** the server runs with `--allow-write` and a statement fails partway (e.g. constraint violation)
- **THEN** no partial changes from that call persist

#### Scenario: Tool description reflects mode
- **WHEN** a client lists tools
- **THEN** the `query` tool's description says whether it is read-only or write-enabled

### Requirement: Result format
The system SHALL return query results as structured content with the column list (name and data type), rows as objects keyed by column name, the row count, and the command tag. Values that do not round-trip through JSON (bigint, numeric, bytea, timestamps) MUST be serialized losslessly as strings.

#### Scenario: Select result
- **WHEN** a `SELECT` returns two rows with columns `id` (int4) and `created_at` (timestamptz)
- **THEN** the result includes both columns with their types, both rows, `rowCount: 2`, and `command: "SELECT"`

#### Scenario: Large integers
- **WHEN** a result contains an `int8` value of `9007199254740993`
- **THEN** the value is returned as the string `"9007199254740993"` without loss of precision

### Requirement: Row limit
The system SHALL cap returned rows at a configurable maximum (`--max-rows`, default 1000), and the cap MAY be lowered per call via a `max_rows` argument. When rows are truncated, the result MUST say so.

#### Scenario: Result exceeds limit
- **WHEN** a query would return 5000 rows and the limit is 1000
- **THEN** the first 1000 rows are returned and the result includes `truncated: true`

#### Scenario: Per-call limit above server cap
- **WHEN** `max_rows` in the call exceeds `--max-rows`
- **THEN** the server cap applies

### Requirement: Statement timeout
The system SHALL cancel any statement that runs longer than a configurable timeout (`--query-timeout` in seconds, default 30) and report it with category `timeout`.

#### Scenario: Long-running query
- **WHEN** `query` runs `select pg_sleep(60)` with a 30-second timeout
- **THEN** the statement is cancelled on the server and the tool returns a `timeout` error

### Requirement: Query error reporting
The system SHALL return database errors from `query` as tool errors that include the PostgreSQL SQLSTATE code, the server message, and detail/hint/position when provided, with no stack traces or credentials.

#### Scenario: Syntax error
- **WHEN** `query` is called with `selec 1`
- **THEN** the tool returns an error with SQLSTATE `42601`, the server's syntax-error message, and the error position

#### Scenario: Missing table
- **WHEN** `query` references a table that does not exist
- **THEN** the tool returns an error with SQLSTATE `42P01` and the server message naming the table
