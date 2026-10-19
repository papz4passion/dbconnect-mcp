import { describe, expect, it } from "vitest";
import { toolError, toolSuccess } from "../../src/tool-result.js";
import { DbError } from "../../src/errors.js";

describe("tool-result", () => {
  it("builds a success result with structuredContent and a matching text block", () => {
    const result = toolSuccess({ foo: "bar", count: 2 });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ foo: "bar", count: 2 });
    expect(result.content).toHaveLength(1);
    expect(result.content?.[0]).toEqual({ type: "text", text: JSON.stringify({ foo: "bar", count: 2 }) });
  });

  it("builds an error result from a DbError with category/message/hint/sqlstate", () => {
    const err = new DbError({ category: "auth", message: "bad credentials", sqlstate: "28P01" });
    const result = toolError(err);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      category: "auth",
      message: "bad credentials",
      sqlstate: "28P01",
    });
    expect(result.structuredContent?.hint).toBeTypeOf("string");
  });

  it("builds an error result from a plain Error with category unknown", () => {
    const result = toolError(new Error("boom"));
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ category: "unknown", message: "boom" });
  });

  it("never includes a stack trace in the error payload", () => {
    const err = new Error("boom");
    const result = toolError(err);
    const text = result.content?.[0];
    expect(text && "text" in text ? text.text : "").not.toContain("at ");
  });
});
