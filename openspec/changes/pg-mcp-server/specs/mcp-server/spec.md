# Spec Delta

## Purpose

Defines the command-line program that starts a self-contained MCP server over stdio, registers the database tools, and manages its own lifecycle without depending on any external server.

## ADDED Requirements

### Requirement: Command-line launch
The system SHALL be runnable as a single command-line program (including via `npx`) that starts an MCP server, needing only Node.js and network access to the database. It MUST NOT require `psql`, a proxy, a sidecar, or another MCP server to be installed or running.

#### Scenario: Launch on a machine without PostgreSQL client tools
- **WHEN** a user runs the server command on a machine that has Node.js but no `psql` or other PostgreSQL client installed
- **THEN** the server starts and is able to connect to a reachable PostgreSQL host

#### Scenario: Launch through an MCP client configuration
- **WHEN** an MCP client (e.g. Claude Code, Claude Desktop, VS Code) is configured to spawn the server command with connection arguments
- **THEN** the client completes the MCP initialize handshake and sees the server's tools

### Requirement: Stdio MCP transport
The system SHALL speak the Model Context Protocol over stdin/stdout. Stdout MUST carry only MCP protocol messages; all diagnostic and log output MUST go to stderr.

#### Scenario: Diagnostics do not corrupt the protocol stream
- **WHEN** the server logs startup information or a connection warning
- **THEN** the message is written to stderr and stdout contains only valid MCP messages

### Requirement: Tool registration
The system SHALL advertise the tools `test_connection`, `list_schemas`, `list_tables`, `describe_table`, and `query`, each with a name, a description, and an input schema.

#### Scenario: Client lists tools
- **WHEN** an MCP client sends `tools/list`
- **THEN** the response contains the five tools, each with a description and a JSON input schema

#### Scenario: Invalid tool arguments
- **WHEN** a client calls a tool with arguments that do not match its input schema
- **THEN** the server returns a tool error that names the invalid argument and does not contact the database

### Requirement: Help and version output
The system SHALL print usage information when invoked with `--help` and its version when invoked with `--version`, then exit with status 0 without starting the MCP server.

#### Scenario: Help flag
- **WHEN** the user runs the command with `--help`
- **THEN** usage text listing every supported flag and environment variable is printed and the process exits with status 0

#### Scenario: Version flag
- **WHEN** the user runs the command with `--version`
- **THEN** the package version is printed and the process exits with status 0

### Requirement: Startup without an immediate database connection
The system SHALL complete the MCP handshake even when the database is unreachable at startup. Connection failures MUST be reported through tool results, not by crashing the server.

#### Scenario: Database down at startup
- **WHEN** the server starts while the configured host is unreachable
- **THEN** the server stays running, lists its tools, and `test_connection` reports the failure category

### Requirement: Invalid configuration fails fast
The system SHALL exit with a non-zero status and a clear stderr message when the configuration is invalid or missing (no connection target given, malformed connection string, unknown flag, conflicting options).

#### Scenario: No connection target supplied
- **WHEN** the server is started with no connection string, no host flag, and no relevant environment variables
- **THEN** it prints an error explaining how to supply a connection and exits with a non-zero status

#### Scenario: Unknown flag
- **WHEN** the server is started with an unrecognized flag
- **THEN** it prints the unknown flag name with a pointer to `--help` and exits with a non-zero status

### Requirement: Graceful shutdown
The system SHALL close all database connections and exit when stdin closes or it receives SIGINT or SIGTERM.

#### Scenario: Client disconnects
- **WHEN** the MCP client closes the server's stdin
- **THEN** the server releases its database connections and exits with status 0
