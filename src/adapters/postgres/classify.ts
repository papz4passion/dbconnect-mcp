import type { ErrorCategory } from "../../errors.js";
import { DbError } from "../../errors.js";
import type { Redactor } from "../../redact.js";
import { identityRedactor } from "../../redact.js";

const DNS_CODES = new Set(["ENOTFOUND", "EAI_AGAIN"]);
const NETWORK_CODES = new Set(["ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "ECONNRESET"]);
const TIMEOUT_CODES = new Set(["ETIMEDOUT"]);

const TLS_ERROR_PATTERNS = [
  /ERR_TLS_/i,
  /CERT_/i,
  /DEPTH_ZERO_SELF_SIGNED_CERT/i,
  /UNABLE_TO_VERIFY_LEAF_SIGNATURE/i,
  /server does not support SSL/i,
];

const SQLSTATE_CATEGORY: Record<string, ErrorCategory> = {
  "28P01": "auth",
  "28000": "auth",
  "3D000": "database_not_found",
  "57P01": "server_unavailable",
  "57P02": "server_unavailable",
  "57P03": "server_unavailable",
  "42501": "permission",
  "25006": "read_only",
  "57014": "timeout",
};

interface NodeErrnoLike {
  code?: string;
  message?: string;
}

interface PgErrorLike {
  code?: string;
  message?: string;
  detail?: string;
  hint?: string;
  position?: string;
}

function isTlsError(message: string): boolean {
  return TLS_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function classifyConnectionError(err: unknown, redact: Redactor = identityRedactor): DbError {
  if (err instanceof DbError) return err;

  const e = err as (NodeErrnoLike & PgErrorLike) | undefined;
  const message = redact(e?.message ?? String(err));
  const code = e?.code;

  if (code && SQLSTATE_CATEGORY[code]) {
    const category = SQLSTATE_CATEGORY[code];
    return new DbError({
      category,
      message,
      sqlstate: code,
      detail: e?.detail ? redact(e.detail) : undefined,
      position: e?.position,
      cause: err,
    });
  }

  if (code && isTlsError(code)) {
    return new DbError({ category: "ssl", message, cause: err });
  }
  if (isTlsError(message)) {
    return new DbError({ category: "ssl", message, cause: err });
  }

  if (code && DNS_CODES.has(code)) {
    return new DbError({ category: "dns", message, cause: err });
  }
  if (code && NETWORK_CODES.has(code)) {
    return new DbError({ category: "network", message, cause: err });
  }
  if (code && TIMEOUT_CODES.has(code)) {
    return new DbError({ category: "timeout", message, cause: err });
  }
  if (/timeout/i.test(message) && /connect/i.test(message)) {
    return new DbError({ category: "timeout", message, cause: err });
  }

  if (code && /^[0-9A-Z]{5}$/.test(code)) {
    return new DbError({
      category: "query",
      message,
      sqlstate: code,
      detail: e?.detail ? redact(e.detail) : undefined,
      position: e?.position,
      cause: err,
    });
  }

  return new DbError({ category: "unknown", message, cause: err });
}

export function classifyQueryError(err: unknown, redact: Redactor = identityRedactor): DbError {
  return classifyConnectionError(err, redact);
}
