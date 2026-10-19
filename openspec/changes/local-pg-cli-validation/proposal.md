# Proposal

## Why

The plugin needs a reliable local-first connection path that validates the PostgreSQL client tooling before it attempts a database connection. Without that guardrail, users can hit confusing startup failures or silent misconfiguration when `psql` is missing, mislocated, or unable to reach the target server.

## What Changes

- Add a local VS Code MCP plugin flow that checks for the PostgreSQL CLI on the user’s machine before enabling database operations.
- Validate the configured connection target through a lightweight CLI-based probe that confirms the tool is installed and reachable.
- Surface clear, actionable errors for missing CLI tooling, invalid connectivity, and failed authentication without exposing internal stack details.
- Use the GitHub-backed repository feature set as the baseline for the plugin’s core MCP behavior while keeping validation local to the developer environment.
- Keep the change scoped to environment validation and connection readiness; no broad data-access or non-local connection behavior is introduced in this proposal.

## Capabilities

### New Capabilities

- `local-postgres/cli-validation`: validates that the local PostgreSQL CLI is available and usable, and reports whether the configured server is reachable before the plugin attempts runtime DB interactions.

### Modified Capabilities

- None

## Impact

- VS Code MCP plugin startup and configuration flow
- Local developer runtime checks for PostgreSQL tooling
- Connection-health error reporting and remediation guidance
- Baseline repo feature integration from the GitHub-backed source of truth for MCP capabilities
