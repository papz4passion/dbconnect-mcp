# Spec Delta

## Purpose

Defines how the server establishes and maintains direct connections to a database engine through a pluggable adapter, with PostgreSQL as the shipped engine, and how connection failures are classified and reported.

## ADDED Requirements

### Requirement: Direct native connection
The system SHALL connect to PostgreSQL by speaking the PostgreSQL wire protocol itself from within the server process. It MUST NOT spawn external database client processes or route traffic through an intermediary server.

#### Scenario: No child processes for database access
- **WHEN** the server connects to and queries a PostgreSQL host
- **THEN** no external client binary (such as `psql`) is executed

### Requirement: Engine adapter boundary
The system SHALL route all database access through a single engine adapter contract covering connect, test, introspect, execute, and close. The MCP tool surface MUST NOT depend on engine-specific details beyond the selected adapter.

#### Scenario: PostgreSQL selected by URI scheme
- **WHEN** the connection string scheme is `postgres` or `postgresql`
- **THEN** the PostgreSQL adapter is used

#### Scenario: Unsupported engine requested
- **WHEN** the connection string uses a scheme with no shipped adapter (e.g. `mysql://`)
- **THEN** startup fails with an error naming the unsupported engine and listing supported ones

### Requirement: Connection pooling and reuse
The system SHALL reuse a bounded pool of database connections across tool calls instead of opening a connection per call. The pool size MUST be configurable via `--pool-max` (default 5).

#### Scenario: Sequential tool calls reuse connections
- **WHEN** a client makes several tool calls in a row
- **THEN** the server does not open a new database session for each call

#### Scenario: Recover after a dropped connection
- **WHEN** a pooled connection is closed by the server or network between tool calls
- **THEN** the next tool call obtains a fresh connection and succeeds if the database is reachable

### Requirement: Connection timeout
The system SHALL abort connection attempts that do not complete within a configurable timeout (`--connect-timeout` in seconds, default 10) and report them as timeouts.

#### Scenario: Host silently drops packets
- **WHEN** the configured host does not respond within the connect timeout
- **THEN** the attempt is aborted and reported with category `timeout`

### Requirement: Connection test tool
The system SHALL provide a `test_connection` tool that opens or checks out a connection, runs a trivial round-trip, and returns success with server version, current database, current user, redacted host/port, SSL state, and round-trip latency.

#### Scenario: Successful test
- **WHEN** `test_connection` is called and the database is reachable with valid credentials
- **THEN** the result reports success along with server version, database, user, host, port, whether SSL is in use, and latency in milliseconds

#### Scenario: Failed test
- **WHEN** `test_connection` is called and the connection fails
- **THEN** the result is a tool error carrying the failure category and a remediation hint

### Requirement: Connection error classification
The system SHALL classify connection failures into a stable category set: `dns`, `network`, `timeout`, `auth`, `ssl`, `server_unavailable`, `database_not_found`, `permission`, or `unknown`. Each category MUST come with a human-readable message and a remediation hint.

#### Scenario: Unknown host
- **WHEN** the host name cannot be resolved
- **THEN** the error category is `dns` and the hint suggests checking the host name

#### Scenario: Port closed
- **WHEN** the host resolves but refuses the TCP connection
- **THEN** the error category is `network` and the hint suggests checking host, port, and firewall

#### Scenario: Wrong password
- **WHEN** the server rejects the supplied credentials
- **THEN** the error category is `auth` and the hint suggests checking user and password

#### Scenario: Database does not exist
- **WHEN** the server reports the requested database does not exist
- **THEN** the error category is `database_not_found` and the message names the database

#### Scenario: Server starting up or shutting down
- **WHEN** the server responds that it is starting up, shutting down, or in recovery
- **THEN** the error category is `server_unavailable`

#### Scenario: No internal stack traces
- **WHEN** any connection error is returned to the client
- **THEN** the tool result contains the category, message, and hint, but no stack trace
