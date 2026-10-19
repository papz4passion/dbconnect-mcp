# Design

## Overview

This change introduces a local validation layer for the VS Code MCP plugin before it attempts any PostgreSQL connection or command execution. The design keeps validation close to the user environment so the plugin can detect missing tools, misconfigured paths, and unreachable servers before a user sees a generic runtime error.

## Architecture

### 1. CLI detector

A small discovery component resolves the PostgreSQL CLI location from a configured path or the system `PATH`.

- Checks for the canonical client binary used by the project.
- Resolves a concrete executable path and stores the selected binary for later use.
- Reports whether the CLI is missing, inaccessible, or present but unusable.

### 2. Runtime validator

A validation service runs a non-invasive CLI probe to confirm the client loads successfully.

- Executes a minimal command that returns version or connection metadata when available.
- Converts the result into a normalized validation status: ready, missing, invalid, or unreachable.
- Provides structured error text for the UI and logs, while keeping the raw command output available for debugging.

### 3. Connection readiness gate

The plugin uses the validation result as a gating check before it opens a full database session or serves tool calls that rely on a live connection.

- If validation fails, the system stops before attempting any higher-cost operation.
- If validation succeeds, the system retains the validated environment for the active session.
- The plugin surfaces a retry or remediation prompt instead of silently continuing.

### 4. Error handling and UX

The user-facing experience centers on actionable message quality.

- Missing CLI: explain which executable is required and how to install it.
- Invalid CLI: explain that the binary is present but not usable on this machine.
- Unreachable database: differentiate connectivity, host, and authentication failures.
- Retry logic: allow the user to rerun validation after updating local configuration.

## Security and Operational Considerations

- Validation must remain local and never require remote execution for the base check.
- The feature should avoid exposing credentials in logs or status text.
- The plugin should treat CLI discovery as a local machine concern rather than a repository-global assumption.

## Dependencies and Baseline

- GitHub-backed repository feature set provides the baseline MCP capability model.
- The design intentionally keeps validation decoupled from higher-level query execution so the local environment can fail fast without affecting unrelated MCP features.

## Non-Goals

- This change does not define a new remote connection protocol.
- This change does not attempt to manage database installation or server provisioning.
- This change does not broaden the plugin beyond local PostgreSQL CLI validation and readiness gating.
