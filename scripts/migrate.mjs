// Applies supabase/migrations/*.sql in order, once each. Usage: DATABASE_URL=... node scripts/migrate.mjs
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "supabase", "migrations");

export async function migrate(connectionString) {
  const url = new URL(connectionString);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  for (const k of ["sslmode", "sslrootcert", "supa", "pgbouncer"]) url.searchParams.delete(k);
  const client = new pg.Client({ connectionString: url.toString(), ssl: local ? undefined : { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
    const done = new Set((await client.query("select name from schema_migrations")).rows.map((r) => r.name));
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = await readFile(path.join(dir, f), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (name) values ($1)", [f]);
        await client.query("commit");
        console.log(`applied ${f}`);
      } catch (e) {
        await client.query("rollback");
        throw new Error(`${f}: ${e.message}`);
      }
    }
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Migrations need a direct (non-pooled) connection when available.
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
  if (!url) {
    console.error("DATABASE_URL (or POSTGRES_URL_NON_POOLING) is not set");
    process.exit(1);
  }
  migrate(url).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
