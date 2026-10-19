import type { QueryConfig } from "pg";

/**
 * `pg`'s runtime Query class supports `queryMode: 'extended'` to force the
 * extended query protocol (design D7: the server then refuses to execute
 * more than one command per prepared statement), but @types/pg does not
 * declare this field. This augments QueryConfig for our own call sites only.
 */
export interface ExtendedQueryConfig extends QueryConfig<unknown[]> {
  queryMode?: "extended";
}

export function extendedQuery(text: string, values?: unknown[]): ExtendedQueryConfig {
  const config: ExtendedQueryConfig = { text, queryMode: "extended" };
  if (values !== undefined) config.values = values;
  return config;
}
