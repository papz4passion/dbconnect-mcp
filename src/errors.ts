export type ErrorCategory =
  | "dns"
  | "network"
  | "timeout"
  | "auth"
  | "ssl"
  | "server_unavailable"
  | "database_not_found"
  | "permission"
  | "read_only"
  | "query"
  | "unknown";

export interface DbErrorInit {
  category: ErrorCategory;
  message: string;
  hint?: string;
  sqlstate?: string;
  detail?: string;
  position?: string;
  cause?: unknown;
}

const CATEGORY_HINTS: Record<ErrorCategory, string> = {
  dns: "Check that the host name is correct and resolvable from this machine.",
  network:
    "Check the host, port, and any firewall or security group rules blocking the connection.",
  timeout:
    "The operation did not complete in time. Check network connectivity, server load, or increase the relevant timeout.",
  auth: "Check the user name and password.",
  ssl: "Check the sslmode setting, the server's SSL configuration, and any CA/cert/key files.",
  server_unavailable:
    "The database server is starting up, shutting down, or in recovery. Retry shortly.",
  database_not_found: "Check that the database name is correct and exists on the server.",
  permission: "The connected user lacks the privilege required for this operation.",
  read_only:
    "This server is running read-only. Writes require starting the server with --allow-write.",
  query: "Check the SQL statement and parameters for errors.",
  unknown: "An unexpected error occurred. Check the server logs for more detail.",
};

export class DbError extends Error {
  readonly category: ErrorCategory;
  readonly hint: string;
  readonly sqlstate?: string;
  readonly detail?: string;
  readonly position?: string;
  override readonly cause?: unknown;

  constructor(init: DbErrorInit) {
    super(init.message);
    this.name = "DbError";
    this.category = init.category;
    this.hint = init.hint ?? CATEGORY_HINTS[init.category];
    this.sqlstate = init.sqlstate;
    this.detail = init.detail;
    this.position = init.position;
    this.cause = init.cause;
  }

  toToolErrorPayload(): {
    category: ErrorCategory;
    message: string;
    hint: string;
    sqlstate?: string;
    detail?: string;
    position?: string;
  } {
    const payload: {
      category: ErrorCategory;
      message: string;
      hint: string;
      sqlstate?: string;
      detail?: string;
      position?: string;
    } = {
      category: this.category,
      message: this.message,
      hint: this.hint,
    };
    if (this.sqlstate !== undefined) payload.sqlstate = this.sqlstate;
    if (this.detail !== undefined) payload.detail = this.detail;
    if (this.position !== undefined) payload.position = this.position;
    return payload;
  }
}

export function hintForCategory(category: ErrorCategory): string {
  return CATEGORY_HINTS[category];
}

export const ERROR_CATEGORIES: readonly ErrorCategory[] = [
  "dns",
  "network",
  "timeout",
  "auth",
  "ssl",
  "server_unavailable",
  "database_not_found",
  "permission",
  "read_only",
  "query",
  "unknown",
];
