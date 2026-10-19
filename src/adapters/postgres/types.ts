import pg from "pg";

const { types: pgTypes } = pg;
const { builtins } = pgTypes;

function identity(value: string): string {
  return value;
}

// The server already sends bytea in `\x...` hex-text form (PostgreSQL >= 9.0);
// returning it unparsed avoids pg's default conversion to a Buffer, which
// does not round-trip losslessly through JSON.
const byteaAsHexText = identity;

const OVERRIDE_PARSERS = new Map<number, (value: string) => unknown>([
  [builtins.INT8, identity],
  [builtins.NUMERIC, identity],
  [builtins.MONEY, identity],
  [builtins.DATE, identity],
  [builtins.TIME, identity],
  [builtins.TIMETZ, identity],
  [builtins.TIMESTAMP, identity],
  [builtins.TIMESTAMPTZ, identity],
  [builtins.INTERVAL, identity],
  [builtins.BYTEA, byteaAsHexText],
]);

export const LOSSLESS_TEXT_OIDS: readonly number[] = [...OVERRIDE_PARSERS.keys()].filter(
  (oid) => oid !== builtins.BYTEA,
);

/**
 * Builds a per-pool `types` config (design D12): overrides are scoped to this
 * pool's clients via pg's `types.getTypeParser` hook, never by mutating the
 * global `pg.types` registry.
 */
export function createPoolTypesConfig(): pg.CustomTypesConfig {
  return {
    getTypeParser(oid: number, format?: string) {
      const override = OVERRIDE_PARSERS.get(oid);
      if (override && (format === undefined || format === "text")) {
        return override as ReturnType<typeof pgTypes.getTypeParser>;
      }
      return pgTypes.getTypeParser(oid, format as "text" | "binary" | undefined);
    },
  };
}
