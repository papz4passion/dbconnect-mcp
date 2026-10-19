import { describe, expect, it } from "vitest";
import { isTransactionControlStatement } from "../../src/adapters/postgres/tx-control.js";

describe("isTransactionControlStatement", () => {
  const rejected = [
    "BEGIN",
    "begin",
    "START TRANSACTION",
    "COMMIT",
    "END",
    "ROLLBACK",
    "ABORT",
    "SAVEPOINT my_savepoint",
    "RELEASE SAVEPOINT my_savepoint",
    "PREPARE TRANSACTION 'foo'",
    "COMMIT PREPARED 'foo'",
    "ROLLBACK PREPARED 'foo'",
    "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE",
    "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY",
  ];

  for (const stmt of rejected) {
    it(`rejects "${stmt}"`, () => {
      expect(isTransactionControlStatement(stmt)).toBe(true);
    });
  }

  it("rejects transaction-control statements prefixed with a line comment", () => {
    expect(isTransactionControlStatement("-- a comment\nBEGIN")).toBe(true);
  });

  it("rejects transaction-control statements prefixed with a block comment", () => {
    expect(isTransactionControlStatement("/* comment */ COMMIT")).toBe(true);
  });

  it("rejects transaction-control statements with leading whitespace and multiple comments", () => {
    expect(isTransactionControlStatement("  -- one\n  /* two */  \n ROLLBACK")).toBe(true);
  });

  const allowed = ["select 1", "SELECT * FROM users", "with d as (select 1) select * from d", "EXPLAIN select 1", "explain analyze select 1"];

  for (const stmt of allowed) {
    it(`allows "${stmt}"`, () => {
      expect(isTransactionControlStatement(stmt)).toBe(false);
    });
  }

  it("allows select/with/explain even with leading comments", () => {
    expect(isTransactionControlStatement("-- note\nselect 1")).toBe(false);
  });

  it("does not reject identifiers that merely start with a keyword prefix", () => {
    expect(isTransactionControlStatement("select * from begin_times")).toBe(false);
  });
});
