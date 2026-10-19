# Spec Delta

## Purpose

Defines how users supply connection settings for any local or remote database host, how competing sources are resolved, how SSL/TLS is configured, and how credentials are kept out of output.

## ADDED Requirements

### Requirement: Connection string input
The system SHALL accept a PostgreSQL connection URI (`postgres://` or `postgresql://`) as a positional argument, via `--connection-string`, or via the `DATABASE_URL` environment variable. The URI MUST support user, password, host, port, database, and query parameters including `sslmode`.

#### Scenario: Remote host via connection string
- **WHEN** the server is started with `postgresql://app:secret@db.example.com:5432/sales?sslmode=require`
- **THEN** it connects to host `db.example.com`, port `5432`, database `sales`, as user `app`, with SSL required

#### Scenario: Malformed connection string
- **WHEN** the connection string cannot be parsed
- **THEN** startup fails with an error identifying the string as malformed, without echoing the password

### Requirement: Discrete flag input
The system SHALL accept connection settings as individual flags: `--host`, `--port`, `--user`, `--password`, `--database`, and `--sslmode`. Host MAY be a hostname, an IPv4 or IPv6 address, or a Unix socket directory.

#### Scenario: Connect with flags only
- **WHEN** the server is started with `--host 10.0.0.5 --port 6543 --user report --database analytics`
- **THEN** it connects to `10.0.0.5:6543`, database `analytics`, as user `report`

#### Scenario: Default port
- **WHEN** no port is supplied by any source
- **THEN** the system uses port `5432`

### Requirement: Standard PostgreSQL environment variables
The system SHALL read `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGSSLMODE`, `PGSSLROOTCERT`, `PGSSLCERT`, and `PGSSLKEY` as connection settings.

#### Scenario: Password from environment only
- **WHEN** the host is given by flag and the password only by `PGPASSWORD`
- **THEN** the system authenticates using the `PGPASSWORD` value

### Requirement: Source precedence
The system SHALL resolve each setting by precedence: explicit discrete flags, then the connection string (positional, `--connection-string`, or `DATABASE_URL`), then `PG*` environment variables, then built-in defaults. A higher-precedence source overrides only the settings it specifies.

#### Scenario: Flag overrides connection string
- **WHEN** the connection string specifies database `sales` and `--database staging` is also given
- **THEN** the system connects to database `staging` and keeps every other setting from the connection string

#### Scenario: Two connection strings supplied
- **WHEN** both a positional connection string and `--connection-string` are given
- **THEN** startup fails with a conflicting-options error

### Requirement: Password authentication
The system SHALL support password-based authentication, including the SCRAM-SHA-256 and MD5 methods PostgreSQL servers negotiate. A password MAY be supplied by connection string, `--password`, `PGPASSWORD`, or a file referenced by `--password-file`.

#### Scenario: Password from file
- **WHEN** the server is started with `--password-file /run/secrets/pg`
- **THEN** it reads the password from that file, trimming one trailing newline, and uses it to authenticate

#### Scenario: SCRAM server
- **WHEN** the server requires `scram-sha-256` authentication and a correct password is supplied
- **THEN** authentication succeeds

### Requirement: SSL/TLS modes
The system SHALL support `sslmode` values `disable`, `prefer`, `require`, `verify-ca`, and `verify-full` with PostgreSQL's meanings, defaulting to `prefer`. It MUST accept a CA bundle (`--sslrootcert`), client cert (`--sslcert`), and client key (`--sslkey`).

#### Scenario: verify-full against a mismatched hostname
- **WHEN** `sslmode=verify-full` is set and the server certificate does not match the host
- **THEN** the connection is refused and reported as an SSL failure

#### Scenario: Custom CA
- **WHEN** `sslmode=verify-ca` and `--sslrootcert` points to the CA that signed the server certificate
- **THEN** the TLS connection succeeds

#### Scenario: Server does not support SSL under require
- **WHEN** `sslmode=require` is set and the server does not offer SSL
- **THEN** the connection fails and is reported as an SSL failure, not a generic network error

### Requirement: Credential redaction
The system MUST NOT write a password, a password file's contents, or an unredacted connection string to stdout, stderr, logs, tool results, or error messages. When it shows connection details, it MUST mask the password (e.g. `postgresql://app:****@db.example.com:5432/sales`).

#### Scenario: Error message after failed authentication
- **WHEN** authentication fails for a connection string containing a password
- **THEN** the error text names the user, host, and database but contains no part of the password

#### Scenario: Connection summary in tool output
- **WHEN** `test_connection` returns connection details
- **THEN** the details include host, port, database, user, and SSL state, and the password is absent or masked
