declare module "pg-cursor" {
  import type { Submittable, FieldDef } from "pg";

  interface CursorResultLike {
    fields: FieldDef[];
    command: string | null;
    rowCount: number | null;
    rows: Record<string, unknown>[];
  }

  interface CursorConfig {
    queryMode?: "extended";
    rowMode?: "array";
  }

  class Cursor<Row = Record<string, unknown>> implements Submittable {
    constructor(text: string, values?: unknown[], config?: CursorConfig);
    submit(connection: unknown): void;
    read(
      rowCount: number,
      callback: (err: Error | undefined, rows: Row[], result: CursorResultLike) => void,
    ): void;
    read(rowCount: number): Promise<Row[]>;
    close(callback: (err?: Error) => void): void;
    close(): Promise<void>;
  }

  export default Cursor;
}
