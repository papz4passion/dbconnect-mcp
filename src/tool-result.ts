import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { DbError } from "./errors.js";

export function toolSuccess(data: Record<string, unknown>): CallToolResult {
  return {
    structuredContent: data,
    content: [{ type: "text", text: JSON.stringify(data) }],
  };
}

export function toolErrorFromDbError(error: DbError): CallToolResult {
  const payload = error.toToolErrorPayload();
  return {
    isError: true,
    structuredContent: payload,
    content: [{ type: "text", text: JSON.stringify(payload) }],
  };
}

export function toolError(error: unknown): CallToolResult {
  if (error instanceof DbError) {
    return toolErrorFromDbError(error);
  }
  const payload = {
    category: "unknown" as const,
    message: error instanceof Error ? error.message : String(error),
    hint: "An unexpected error occurred.",
  };
  return {
    isError: true,
    structuredContent: payload,
    content: [{ type: "text", text: JSON.stringify(payload) }],
  };
}
