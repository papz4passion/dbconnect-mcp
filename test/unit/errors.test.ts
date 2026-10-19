import { describe, expect, it } from "vitest";
import { DbError, ERROR_CATEGORIES, hintForCategory } from "../../src/errors.js";

describe("errors", () => {
  it("has a non-empty hint for every category", () => {
    for (const category of ERROR_CATEGORIES) {
      const hint = hintForCategory(category);
      expect(hint).toBeTypeOf("string");
      expect(hint.length).toBeGreaterThan(0);
    }
  });

  it("includes the category's hint by default", () => {
    const err = new DbError({ category: "auth", message: "bad password" });
    expect(err.hint).toBe(hintForCategory("auth"));
  });

  it("allows overriding the hint", () => {
    const err = new DbError({ category: "query", message: "oops", hint: "custom hint" });
    expect(err.hint).toBe("custom hint");
  });

  it("serializes a tool error payload without leaking the cause or stack", () => {
    const err = new DbError({
      category: "query",
      message: "syntax error",
      sqlstate: "42601",
      detail: "near token",
      position: "8",
      cause: new Error("internal"),
    });
    const payload = err.toToolErrorPayload();
    expect(payload).toEqual({
      category: "query",
      message: "syntax error",
      hint: hintForCategory("query"),
      sqlstate: "42601",
      detail: "near token",
      position: "8",
    });
    expect(JSON.stringify(payload)).not.toContain("internal");
  });

  it("omits optional fields when not provided", () => {
    const err = new DbError({ category: "dns", message: "cannot resolve host" });
    const payload = err.toToolErrorPayload();
    expect(payload.sqlstate).toBeUndefined();
    expect(payload.detail).toBeUndefined();
    expect(payload.position).toBeUndefined();
  });
});
