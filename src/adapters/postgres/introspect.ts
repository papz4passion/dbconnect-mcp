import type { Pool } from "pg";
import { DbError } from "../../errors.js";
import type { ColumnInfo, SchemaInfo, TableDescription, TableInfo, TableKind } from "../types.js";
import { extendedQuery } from "./query-config.js";

const SYSTEM_SCHEMA_PATTERN = /^(pg_catalog|information_schema|pg_toast|pg_temp)/;

const RELKIND_TO_TABLE_KIND: Record<string, TableKind> = {
  r: "table",
  p: "partitioned_table",
  v: "view",
  m: "materialized_view",
  f: "foreign_table",
};

export async function listSchemas(
  pool: Pool,
  opts: { includeSystem: boolean },
): Promise<SchemaInfo[]> {
  const result = await pool.query<{ nspname: string }>(
    extendedQuery(`
      select nspname
      from pg_catalog.pg_namespace
      where has_schema_privilege(oid, 'USAGE')
      order by nspname
    `),
  );

  const rows = result.rows.filter((row) =>
    opts.includeSystem ? true : !SYSTEM_SCHEMA_PATTERN.test(row.nspname),
  );
  return rows.map((row) => ({ name: row.nspname }));
}

async function schemaExists(pool: Pool, schema: string): Promise<boolean> {
  const result = await pool.query<{ oid: number }>(
    extendedQuery(`select oid from pg_catalog.pg_namespace where nspname = $1`, [schema]),
  );
  return result.rows.length > 0;
}

export async function listTables(pool: Pool, schema: string): Promise<TableInfo[]> {
  if (!(await schemaExists(pool, schema))) {
    throw new DbError({
      category: "query",
      message: `Schema "${schema}" was not found.`,
      hint: "Check the schema name with list_schemas.",
    });
  }

  const result = await pool.query<{ relname: string; relkind: string }>(
    extendedQuery(
      `
      select c.relname, c.relkind
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1
        and c.relkind in ('r','p','v','m','f')
        and (has_table_privilege(c.oid, 'SELECT') or has_schema_privilege(n.oid, 'USAGE'))
      order by c.relname
    `,
      [schema],
    ),
  );

  return result.rows.map((row) => ({
    name: row.relname,
    kind: RELKIND_TO_TABLE_KIND[row.relkind] ?? "table",
  }));
}

interface AttributeRow {
  attname: string;
  data_type: string;
  attnotnull: boolean;
  attnum: number;
  default_expr: string | null;
}

export async function describeTable(
  pool: Pool,
  schema: string,
  table: string,
): Promise<TableDescription> {
  const classResult = await pool.query<{ oid: number }>(
    extendedQuery(
      `
      select c.oid
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1
        and c.relname = $2
        and c.relkind in ('r','p','v','m','f')
        and (has_table_privilege(c.oid, 'SELECT') or has_schema_privilege(n.oid, 'USAGE'))
    `,
      [schema, table],
    ),
  );

  const classRow = classResult.rows[0];
  if (!classRow) {
    throw new DbError({
      category: "query",
      message: `Table "${schema}.${table}" was not found.`,
      hint: "Check the schema and table name with list_tables.",
    });
  }
  const tableOid = classRow.oid;

  const attrResult = await pool.query<AttributeRow>(
    extendedQuery(
      `
      select
        a.attname,
        format_type(a.atttypid, a.atttypmod) as data_type,
        a.attnotnull,
        a.attnum,
        pg_get_expr(d.adbin, d.adrelid) as default_expr
      from pg_catalog.pg_attribute a
      left join pg_catalog.pg_attrdef d
        on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = $1
        and a.attnum > 0
        and not a.attisdropped
      order by a.attnum
    `,
      [tableOid],
    ),
  );

  const columns: ColumnInfo[] = attrResult.rows.map((row) => ({
    name: row.attname,
    dataType: row.data_type,
    nullable: !row.attnotnull,
    default: row.default_expr,
    ordinalPosition: row.attnum,
  }));

  const pkResult = await pool.query<{ attname: string }>(
    extendedQuery(
      `
      select a.attname
      from pg_catalog.pg_index i
      join pg_catalog.pg_attribute a
        on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where i.indrelid = $1
        and i.indisprimary
      order by array_position(i.indkey, a.attnum)
    `,
      [tableOid],
    ),
  );

  return {
    columns,
    primaryKey: pkResult.rows.map((row) => row.attname),
  };
}
