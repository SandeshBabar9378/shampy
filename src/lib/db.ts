import { Pool, types, type PoolClient } from "pg";

// Hosted Postgres (Neon, Supabase, or any other). Set DATABASE_URL, e.g.
//   postgresql://user:password@host/dbname?sslmode=require
// BIGINT (int8) comes back from pg as a string by default; every int8 column
// here (ids, epoch-ms timestamps) fits in a JS number.
types.setTypeParser(20, (v) => parseInt(v, 10));

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    avatar TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS liked_songs (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    song_id TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,
    cover_url TEXT,
    duration INTEGER DEFAULT 0,
    youtube_id TEXT,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, song_id)
  );
  CREATE INDEX IF NOT EXISTS idx_liked_user ON liked_songs (user_id, id DESC);

  CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    cover_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists (user_id);

  CREATE TABLE IF NOT EXISTS playlist_songs (
    id BIGSERIAL PRIMARY KEY,
    playlist_id TEXT NOT NULL,
    song_id TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,
    cover_url TEXT,
    duration INTEGER DEFAULT 0,
    youtube_id TEXT,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (playlist_id, song_id)
  );

  CREATE TABLE IF NOT EXISTS listening_history (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    song_id TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,
    cover_url TEXT,
    duration INTEGER DEFAULT 0,
    youtube_id TEXT,
    played_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_history_user ON listening_history (user_id, id DESC);

  -- Songs a user has downloaded for offline play. The audio itself lives on
  -- each device; this list is what syncs.
  CREATE TABLE IF NOT EXISTS downloads (
    user_id TEXT NOT NULL,
    song_id TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,
    cover_url TEXT,
    duration INTEGER DEFAULT 0,
    youtube_id TEXT,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, song_id)
  );

  CREATE TABLE IF NOT EXISTS saved_playlists (
    user_id TEXT NOT NULL,
    playlist_id TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT,
    thumbnail TEXT,
    track_count INTEGER DEFAULT 0,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, playlist_id)
  );

  CREATE TABLE IF NOT EXISTS followed_artists (
    user_id TEXT NOT NULL,
    browse_id TEXT NOT NULL,
    name TEXT NOT NULL,
    thumbnail TEXT,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, browse_id)
  );

  -- Email + PIN accounts. Credentials live apart from "users" (the profile
  -- table) so a profile upsert can never touch a PIN hash.
  CREATE TABLE IF NOT EXISTS accounts (
    user_id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    pin_hash TEXT NOT NULL,
    pin_salt TEXT NOT NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Login sessions. Only a hash of the cookie token is stored.
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

  -- Guest identities already folded into an account, so signing in again never
  -- resurrects items the user deleted after the first merge.
  CREATE TABLE IF NOT EXISTS merged_guests (
    guest_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    merged_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Small key/value store (holds the generated PIN-hash secret).
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS yt_cache (
    query TEXT PRIMARY KEY,
    youtube_id TEXT NOT NULL,
    title TEXT,
    duration INTEGER,
    cached_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

interface DbState {
  pool: Pool | null;
  ready: Promise<void> | null;
}

// Survive Next.js dev hot reloads without leaking connection pools.
const g = globalThis as unknown as { __shubhuDb?: DbState };
const state: DbState = (g.__shubhuDb ??= { pool: null, ready: null });

function createPool(connection?: string, max?: number): Pool {
  const raw = connection ?? process.env.DATABASE_URL;
  if (!raw) {
    throw new Error(
      "DATABASE_URL is not set. Add your Neon/Supabase Postgres connection string to .env (see README).",
    );
  }
  const url = new URL(raw);
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  // Managed Postgres requires TLS. Some providers' pooler certificates are not
  // in Node's trust store, so for those encryption is on but verification is
  // opt-in (DATABASE_SSL_VERIFY=1).
  // Neon's certificates are publicly trusted, so verify them there.
  const strict = process.env.DATABASE_SSL_VERIFY === "1" || url.hostname.endsWith(".neon.tech");
  url.searchParams.delete("sslmode");
  return new Pool({
    connectionString: url.toString(),
    ssl: local ? false : { rejectUnauthorized: strict },
    max: max ?? Number(process.env.DATABASE_POOL_MAX || 5),
    idleTimeoutMillis: 20_000,
  });
}

// Table creation is DDL, so (per Neon's guidance) it runs over the direct,
// non-pooled connection when DATABASE_URL_UNPOOLED is available.
async function ensureSchema(pool: Pool): Promise<void> {
  const direct = process.env.DATABASE_URL_UNPOOLED;
  if (!direct) {
    await pool.query(SCHEMA_SQL);
    return;
  }
  const migrationPool = createPool(direct, 1);
  try {
    await migrationPool.query(SCHEMA_SQL);
  } finally {
    await migrationPool.end();
  }
}

async function ready(): Promise<Pool> {
  if (!state.pool) state.pool = createPool();
  if (!state.ready) {
    const pool = state.pool;
    state.ready = ensureSchema(pool).then(
      () => undefined,
      (err) => {
        state.ready = null; // retry on the next request
        throw err;
      },
    );
  }
  await state.ready;
  return state.pool;
}

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
}

function wrap(runner: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }): Queryable {
  const query = async <T,>(sql: string, params: unknown[] = []) => (await runner.query(sql, params)).rows as T[];
  return {
    query,
    queryOne: async <T,>(sql: string, params: unknown[] = []) => (await query<T>(sql, params))[0],
  };
}

/** Run a statement. Placeholders are $1, $2, ... */
export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return wrap(await ready()).query<T>(sql, params);
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  return wrap(await ready()).queryOne<T>(sql, params);
}

/** Run several statements atomically; rolls back if `fn` throws. */
export async function withTransaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
  const pool = await ready();
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(wrap(client));
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
