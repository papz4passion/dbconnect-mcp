# Spec Delta

## Purpose

Provides MCP tools that let a client discover the structure of the connected database (schemas, tables and views, and column definitions) without writing SQL.

## ADDED Requirements

### Requirement: List schemas
The system SHALL provide a `list_schemas` tool that returns the schemas visible to the connected user. System schemas (`pg_catalog`, `information_schema`, `pg_toast*`, `pg_temp*`) MUST be excluded unless `include_system: true` is passed.

#### Scenario: Default listing
- **WHEN** `list_schemas` is called with no arguments on a database with schemas `public` and `sales`
- **THEN** the result contains `public` and `sales` and no system schemas

#### Scenario: Including system schemas
- **WHEN** `list_schemas` is called with `include_system: true`
- **THEN** the result also includes `pg_catalog` and `information_schema`

### Requirement: List tables
The system SHALL provide a `list_tables` tool that returns tables, views, materialized views, and foreign tables in a given schema (default `public`), each with its name and kind.

#### Scenario: Tables and views in a schema
- **WHEN** `list_tables` is called with `schema: "sales"` and that schema has table `orders` and view `order_totals`
- **THEN** the result lists `orders` with kind `table` and `order_totals` with kind `view`

#### Scenario: Schema does not exist
- **WHEN** `list_tables` is called with a schema that does not exist
- **THEN** the tool returns an error stating the schema was not found

### Requirement: Describe table columns
The system SHALL provide a `describe_table` tool that, given a table name and optional schema (default `public`), returns each column's name, data type, nullability, default, and ordinal position, plus the table's primary key columns.

#### Scenario: Describe an existing table
- **WHEN** `describe_table` is called for `public.users` with columns `id serial primary key` and `email text not null`
- **THEN** the result lists `id` (type `integer`, not nullable, default from its sequence) and `email` (type `text`, not nullable), in ordinal order, and reports `id` as the primary key

#### Scenario: Table not found
- **WHEN** `describe_table` is called for a table that does not exist or is not visible to the user
- **THEN** the tool returns an error stating the table was not found

### Requirement: Safe identifier handling
Introspection tools MUST treat schema and table names as data, never as SQL text, so that any name, including ones with quotes, spaces, or mixed case, is matched exactly and cannot inject SQL.

#### Scenario: Mixed-case and quoted names
- **WHEN** `describe_table` is called with table `Order "Items"` in schema `Sales`
- **THEN** the tool describes exactly that table, or reports not found, without executing any other SQL

### Requirement: Introspection respects database permissions
Introspection results SHALL reflect only objects the connected user can see under the database's own privilege rules; the system MUST NOT escalate privileges to read metadata.

#### Scenario: Restricted user
- **WHEN** the connected user has no USAGE privilege on schema `hr`
- **THEN** `list_schemas` and `list_tables` do not reveal objects inside `hr`
