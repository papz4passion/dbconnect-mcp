export interface ConnectionInfo {
  serverVersion: string;
  database: string;
  user: string;
  host: string;
  port: number;
  ssl: boolean;
  latencyMs: number;
}

export interface SchemaInfo {
  name: string;
}

export type TableKind = "table" | "partitioned_table" | "view" | "materialized_view" | "foreign_table";

export interface TableInfo {
  name: string;
  kind: TableKind;
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  default: string | null;
  ordinalPosition: number;
}

export interface TableDescription {
  columns: ColumnInfo[];
  primaryKey: string[];
}

export interface ExecOptions {
  params?: unknown[];
  maxRows: number;
  queryTimeoutMs: number;
}

export interface ResultColumn {
  name: string;
  dataType: string;
}

export interface QueryResult {
  columns: ResultColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
  command: string;
  truncated: boolean;
}

export interface DatabaseAdapter {
  readonly engine: string;
  test(): Promise<ConnectionInfo>;
  listSchemas(opts: { includeSystem: boolean }): Promise<SchemaInfo[]>;
  listTables(schema: string): Promise<TableInfo[]>;
  describeTable(schema: string, table: string): Promise<TableDescription>;
  execute(sql: string, params: unknown[], opts: ExecOptions): Promise<QueryResult>;
  close(): Promise<void>;
}
