import type { PoolClient } from "pg";
import Cursor from "pg-cursor";
import { DbError } from "../../errors.js";
import type { Redactor } from "../../redact.js";
import type { ExecOptions, QueryResult, ResultColumn } from "../types.js";
import { classifyQueryError } from "./classify.js";
import { PgTypeNameCache } from "./pg-type-names.js";
import { extendedQuery } from "./query-config.js";
import { isTransactionControlStatement } from "./tx-control.js";

const MULTI_STATEMENT_ERROR_PATTERN = /cannot insert multiple commands into a prepared statement/i;

interface CursorResult {
  rows: Record<string, unknown>[];
  fields: { name: string; dataTypeID: number }[];
  command: string | null;
  rowCount: number | null;
  truncated: boolean;
}

function readViaCursor(
  client: PoolClient,
  sql: string,
  params: unknown[],
  limit: number,
): Promise<CursorResult> {
  return new Promise((resolve, reject) => {
    const cursor = client.query(new Cursor(sql, params, { queryMode: "extended" }));

    cursor.read(limit + 1, (err, rows, result) => {
      if (err) {
        cursor.close(() => reject(err));
        return;
      }

      const truncated = rows.length > limit;
      const bounded = truncated ? rows.slice(0, limit) : rows;

      cursor.close((closeErr?: Error) => {
        if (closeErr) {
          reject(closeErr);
          return;
        }
        resolve({
          rows: bounded,
          fields: result.fields ?? [],
          command: result.command,
          rowCount: result.rowCount,
          truncated,
        });
      });
    });
  });
}

async function runStatement(
  client: PoolClient,
  sql: string,
  params: unknown[],
  limit: number,
): Promise<CursorResult> {
  const cursorResult = await readViaCursor(client, sql, params, limit);
  if (cursorResult.fields.length > 0) {
    return cursorResult;
  }
  // No RowDescription: the cursor path can misreport the command tag for
  // statements that return no rows (design D15 risk note). Fall back to a
  // plain extended-mode query to get an accurate command/rowCount.
  const plain = await client.query(extendedQuery(sql, params));
  return {
    rows: [],
    fields: [],
    command: plain.command,
    rowCount: plain.rowCount,
    truncated: false,
  };
}

async function formatResult(
  client: PoolClient,
  typeCache: PgTypeNameCache,
  result: CursorResult,
): Promise<QueryResult> {
  const oids = result.fields.map((f) => f.dataTypeID);
  const typeNames = await typeCache.resolve(client, oids);

  const columns: ResultColumn[] = result.fields.map((f) => ({
    name: f.name,
    dataType: typeNames.get(f.dataTypeID) ?? `oid:${f.dataTypeID}`,
  }));

  return {
    columns,
    rows: result.rows,
    rowCount: result.rowCount ?? result.rows.length,
    command: result.command ?? "",
    truncated: result.truncated,
  };
}

export interface ExecuteContext {
  allowWrite: boolean;
  typeCache: PgTypeNameCache;
  redact: Redactor;
}

export async function executeStatement(
  client: PoolClient,
  sql: string,
  params: unknown[],
  opts: ExecOptions,
  ctx: ExecuteContext,
): Promise<QueryResult> {
  if (isTransactionControlStatement(sql)) {
    throw new DbError({
      category: "query",
      message:
        "Transaction control statements (BEGIN, COMMIT, ROLLBACK, SET TRANSACTION, ...) are not allowed; each query call runs in its own managed transaction.",
      hint: "Remove the transaction-control statement; the server manages transactions automatically.",
    });
  }

  const statementTimeoutMs = opts.queryTimeoutMs;

  if (ctx.allowWrite) {
    return executeWrite(client, sql, params, opts.maxRows, statementTimeoutMs, ctx);
  }
  return executeReadOnly(client, sql, params, opts.maxRows, statementTimeoutMs, ctx);
}

async function executeReadOnly(
  client: PoolClient,
  sql: string,
  params: unknown[],
  maxRows: number,
  statementTimeoutMs: number,
  ctx: ExecuteContext,
): Promise<QueryResult> {
  await client.query("BEGIN READ ONLY");
  try {
    await client.query(`SET LOCAL statement_timeout = ${statementTimeoutMs}`);
    const raw = await runStatement(client, sql, params, maxRows);
    const formatted = await formatResult(client, ctx.typeCache, raw);
    await client.query("ROLLBACK");
    return formatted;
  } catch (err) {
    await safeRollback(client);
    throw translateExecuteError(err, ctx.redact);
  }
}

async function executeWrite(
  client: PoolClient,
  sql: string,
  params: unknown[],
  maxRows: number,
  statementTimeoutMs: number,
  ctx: ExecuteContext,
): Promise<QueryResult> {
  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL statement_timeout = ${statementTimeoutMs}`);
    const raw = await runStatement(client, sql, params, maxRows);
    const formatted = await formatResult(client, ctx.typeCache, raw);
    await client.query("COMMIT");
    return formatted;
  } catch (err) {
    await safeRollback(client);
    throw translateExecuteError(err, ctx.redact);
  } finally {
    try {
      await client.query("RESET ALL");
    } catch {
      // best-effort; connection will be discarded by the pool on error anyway
    }
  }
}

async function safeRollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // connection may already be broken; the pool will discard it
  }
}

function translateExecuteError(err: unknown, redact: Redactor): DbError {
  if (err instanceof DbError) return err;

  if (err instanceof Error && MULTI_STATEMENT_ERROR_PATTERN.test(err.message)) {
    return new DbError({
      category: "query",
      message: "Only a single statement is allowed per query call.",
      hint: "Split multiple statements into separate query calls.",
    });
  }

  return classifyQueryError(err, redact);
}
