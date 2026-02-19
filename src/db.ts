import pg from "pg";

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DASHBOARD_DATABASE_URL,
      max: 10,
    });
  }
  return pool;
}

// --- Generic query helpers ---

export async function botQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const { rows } = await getPool().query<T>(sql, params);
  return rows;
}

export async function botQueryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await botQuery<T>(sql, params);
  return rows[0] ?? null;
}

/** Dashboard tables (public schema, read-only for bot) */
export async function dashQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const { rows } = await getPool().query<T>(sql, params);
  return rows;
}

export async function dashQueryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await dashQuery<T>(sql, params);
  return rows[0] ?? null;
}

// --- Bot-specific helpers (replacing Supabase ORM) ---

export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  const row = await botQueryOne<{ value: unknown }>(
    "SELECT value FROM bot.settings WHERE key = $1",
    [key],
  );
  return (row?.value as T) ?? null;
}

export async function upsertSetting(key: string, value: unknown): Promise<void> {
  await botQuery(
    `INSERT INTO bot.settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
    [key, JSON.stringify(value)],
  );
}

export async function insertIdempotencyKey(key: string, draftId?: string | null): Promise<boolean> {
  try {
    await botQuery(
      "INSERT INTO bot.idempotency_keys (key, draft_id, created_at) VALUES ($1, $2, NOW())",
      [key, draftId ?? null],
    );
    return true;
  } catch (e: unknown) {
    if (e instanceof Error && "code" in e && (e as any).code === "23505") return false;
    return false;
  }
}

/** Run bot schema migrations on startup */
export async function runMigrations(migrationsDir: string): Promise<void> {
  const fs = await import("node:fs");
  const path = await import("node:path");

  const client = await getPool().connect();
  try {
    // Ensure bot schema exists
    await client.query("CREATE SCHEMA IF NOT EXISTS bot");
    await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");

    // Track applied migrations
    await client.query(`
      CREATE TABLE IF NOT EXISTS bot.schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT NOW()
      )
    `);

    const applied = await client.query("SELECT filename FROM bot.schema_migrations");
    const appliedSet = new Set(applied.rows.map((r) => r.filename));

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      if (appliedSet.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
      console.log(`[migrate] Applying ${file}...`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO bot.schema_migrations (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`[migrate] Applied ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    client.release();
  }
}

export async function shutdown(): Promise<void> {
  await pool?.end();
  pool = null;
}
