# Spec: Local Postgres CLI Validation

## Summary

The VS Code MCP plugin must validate that the local PostgreSQL client tooling is installed and usable before it attempts to connect to a database. The system should fail fast with actionable guidance when the CLI is missing, misconfigured, or unable to reach the configured server.

## Scenarios

### Scenario 1: CLI is installed and usable

- Given the developer has a supported PostgreSQL CLI installed on their machine
- When the plugin initializes a local connection flow
- Then it must detect the executable, confirm it is runnable, and continue with connection readiness checks

### Scenario 2: CLI is missing

- Given the PostgreSQL CLI is not installed or not available on the `PATH`
- When the plugin validates the environment
- Then it must stop with a clear, user-facing message that identifies the missing dependency and suggests installation steps

### Scenario 3: Connection target is unreachable

- Given the CLI is installed but the target server cannot be reached
- When validation runs
- Then the plugin must surface a connection error that explains the failure and whether the issue is network, authentication, or server availability

### Scenario 4: User can recover from a broken setup

- Given a validation failure occurs
- When the user corrects the local environment or connection settings
- Then the plugin must allow the user to retry without requiring a full restart of the VS Code session

## Requirements

### Requirement 1: Local CLI discovery

The system shall detect the local PostgreSQL client executable and resolve its path before a database operation is attempted.

- The system must check for the expected CLI binary or configured override.
- The system must return a stable status indicating whether the CLI was found.
- The system must not assume a valid installation when the binary is present but cannot execute.

### Requirement 2: Runtime validation

The system shall validate that the discovered CLI is runnable in the current local environment.

- The system must execute a minimal command that confirms the CLI can start and report its version when supported.
- The system must convert CLI output into a human-readable readiness status.
- The system must distinguish between an unavailable binary and a broken runtime environment.

### Requirement 3: Server readiness checks

The system shall confirm that a configured database target is reachable through the local CLI layer before allowing broader operations to proceed.

- The system must run a lightweight probe against the configured target.
- The system must classify connection failures into actionable states such as missing dependency, network failure, or authentication problem.
- The system must surface a user-facing message that identifies the failing step without leaking unnecessary internal details.

### Requirement 4: Safe fallback and retry behavior

The system shall allow the user to recover from validation errors without leaving the plugin in a broken state.

- The system must preserve a clear validation result for each connection attempt.
- The system must expose retry guidance or recheck actions when the environment is corrected.
- The system must avoid continuing to use a partially configured connection state after a validation failure.

### Requirement 5: GitHub-backed feature alignment

The system shall use the repository’s GitHub-backed base features as the compatibility baseline for the local plugin behavior, while keeping validation logic specific to the developer’s local machine.

- The system must align with the repository’s MCP capability model.
- The system must not require remote-only execution for basic local CLI validation.
- The system must keep local connection validation and remote feature usage clearly separated.
