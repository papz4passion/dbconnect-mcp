import pg from "pg";
import type { PoolClient, PoolConfig } from "pg";
import { DbError } from "../../errors.js";
import type { ResolvedConfig } from "../../config/types.js";
import { createRedactor } from "../../redact.js";
import type { Redactor } from "../../redact.js";
import { buildTlsOptions } from "../../config/ssl.js";
import type { PgSslOption } from "../../config/ssl.js";
import type {
  ConnectionInfo,
  DatabaseAdapter,
  ExecOptions,
  QueryResult,
  SchemaInfo,
  TableDescription,
  TableInfo,
} from "../types.js";
import { classifyConnectionError } from "./classify.js";
import { describeTable as describeTableImpl, listSchemas as listSchemasImpl, listTables as listTablesImpl } from "./introspect.js";
import { createPoolTypesConfig } from "./types.js";
import { executeStatement } from "./execute.js";
import { PgTypeNameCache } from "./pg-type-names.js";
import { extendedQuery } from "./query-config.js";

const { Pool } = pg;

function buildBaseClientConfig(config: ResolvedConfig): Omit<PoolConfig, "ssl"> {
  return {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    max: config.poolMax,
    connectionTimeoutMillis: config.connectTimeoutSeconds * 1000,
    query_timeout: config.queryTimeoutSeconds * 1000 + 5000,
    types: createPoolTypesConfig(),
  };
}

async function probeConnect(poolConfig: PoolConfig): Promise<PoolClient> {
  const probePool = new Pool({ ...poolConfig, max: 1 });
  try {
    const client = await probePool.connect();
    return client;
  } finally {
    // the probe pool itself is discarded; the caller owns the live client
    // until it releases it, after which we end this throwaway pool.
    void probePool.end().catch(() => undefined);
  }
}

export class PostgresAdapter implements DatabaseAdapter {
  readonly engine = "postgresql";

  private readonly config: ResolvedConfig;
  private readonly redact: Redactor;
  private readonly typeCache = new PgTypeNameCache();
  private pool: InstanceType<typeof Pool> | null = null;
  private resolvedSsl: PgSslOption | null = null;
  private connecting: Promise<InstanceType<typeof Pool>> | null = null;

  constructor(config: ResolvedConfig) {
    this.config = config;
    this.redact = createRedactor({
      password: config.password,
      connectionStrings: config.connectionStringForRedaction
        ? [config.connectionStringForRedaction]
        : [],
    });
  }

  private async ensurePool(): Promise<InstanceType<typeof Pool>> {
    if (this.pool) return this.pool;
    if (this.connecting) return this.connecting;

    this.connecting = this.createPool();
    try {
      this.pool = await this.connecting;
      return this.pool;
    } finally {
      this.connecting = null;
    }
  }

  private async createPool(): Promise<InstanceType<typeof Pool>> {
    const base = buildBaseClientConfig(this.config);

    if (this.config.sslmode === "prefer") {
      const ssl = await this.resolvePreferSsl(base);
      return new Pool({ ...base, ssl });
    }

    const ssl = buildTlsOptions(this.config.sslmode, this.config, this.config.host);
    return new Pool({ ...base, ssl });
  }

  private async resolvePreferSsl(base: Omit<PoolConfig, "ssl">): Promise<PgSslOption> {
    if (this.resolvedSsl !== null) return this.resolvedSsl;

    const sslOptions = buildTlsOptions("prefer", this.config, this.config.host);
    try {
      const client = await probeConnect({ ...base, ssl: sslOptions });
      client.release();
      this.resolvedSsl = sslOptions;
      return sslOptions;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/server does not support SSL/i.test(message)) {
        this.resolvedSsl = false;
        return false;
      }
      throw err;
    }
  }

  async test(): Promise<ConnectionInfo> {
    const start = Date.now();
    let pool: InstanceType<typeof Pool>;
    try {
      pool = await this.ensurePool();
    } catch (err) {
      throw classifyConnectionError(err, this.redact);
    }

    let client: PoolClient;
    try {
      client = await pool.connect();
    } catch (err) {
      throw classifyConnectionError(err, this.redact);
    }

    try {
      const result = await client.query<{
        server_version: string;
        current_database: string;
        current_user: string;
      }>(
        extendedQuery(
          `select version() as server_version, current_database(), current_user`,
        ),
      );
      const row = result.rows[0] as unknown as {
        server_version: string;
        current_database: string;
        current_user: string;
      };
      const latencyMs = Date.now() - start;
      const sslInUse = Boolean((client as unknown as { connection?: { ssl?: unknown } }).connection?.ssl);

      return {
        serverVersion: row.server_version,
        database: row.current_database,
        user: row.current_user,
        host: this.config.host,
        port: this.config.port,
        ssl: sslInUse,
        latencyMs,
      };
    } catch (err) {
      throw classifyConnectionError(err, this.redact);
    } finally {
      client.release();
    }
  }

  async listSchemas(opts: { includeSystem: boolean }): Promise<SchemaInfo[]> {
    const pool = await this.ensurePoolOrThrow();
    try {
      return await listSchemasImpl(pool, opts);
    } catch (err) {
      throw classifyConnectionError(err, this.redact);
    }
  }

  async listTables(schema: string): Promise<TableInfo[]> {
    const pool = await this.ensurePoolOrThrow();
    try {
      return await listTablesImpl(pool, schema);
    } catch (err) {
      throw classifyConnectionError(err, this.redact);
    }
  }

  async describeTable(schema: string, table: string): Promise<TableDescription> {
    const pool = await this.ensurePoolOrThrow();
    try {
      return await describeTableImpl(pool, schema, table);
    } catch (err) {
      throw classifyConnectionError(err, this.redact);
    }
  }

  async execute(sql: string, params: unknown[], opts: ExecOptions): Promise<QueryResult> {
    const pool = await this.ensurePoolOrThrow();
    const client = await pool.connect().catch((err: unknown) => {
      throw classifyConnectionError(err, this.redact);
    });
    try {
      return await executeStatement(client, sql, params, opts, {
        allowWrite: this.config.allowWrite,
        typeCache: this.typeCache,
        redact: this.redact,
      });
    } finally {
      client.release();
    }
  }

  private async ensurePoolOrThrow(): Promise<InstanceType<typeof Pool>> {
    try {
      return await this.ensurePool();
    } catch (err) {
      throw classifyConnectionError(err, this.redact);
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

export function createPostgresAdapter(config: ResolvedConfig): DatabaseAdapter {
  return new PostgresAdapter(config);
}

export { DbError };
