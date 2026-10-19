import type { PoolClient } from "pg";
import { extendedQuery } from "./query-config.js";

export class PgTypeNameCache {
  private readonly cache = new Map<number, string>();

  async resolve(client: PoolClient, oids: number[]): Promise<Map<number, string>> {
    const unknown = [...new Set(oids)].filter((oid) => !this.cache.has(oid));
    if (unknown.length > 0) {
      const result = await client.query<{ oid: number; typname: string }>(
        extendedQuery(`select oid, typname from pg_catalog.pg_type where oid = any($1::oid[])`, [
          unknown,
        ]),
      );
      for (const row of result.rows) {
        this.cache.set(row.oid, row.typname);
      }
    }

    const resolved = new Map<number, string>();
    for (const oid of oids) {
      resolved.set(oid, this.cache.get(oid) ?? `oid:${oid}`);
    }
    return resolved;
  }
}
