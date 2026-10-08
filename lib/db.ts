import pg from "pg";
import { env } from "./env";

type Global = typeof globalThis & { __mqPool?: pg.Pool };

export function pool(): pg.Pool {
  const g = globalThis as Global;
  if (!g.__mqPool) {
    const url = env.databaseUrl;
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    g.__mqPool = new pg.Pool({
      connectionString: url,
      max: 5,
      ssl: local ? undefined : { rejectUnauthorized: false },
    });
  }
  return g.__mqPool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values: unknown[] = []) {
  return pool().query<T>(text, values);
}

export async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values: unknown[] = []) {
  const r = await query<T>(text, values);
  return r.rows[0] as T | undefined;
}

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("begin");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
