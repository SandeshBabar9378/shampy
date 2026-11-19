import { Pool, types, type PoolClient } from "pg";

// Hosted Postgres (Neon, Supabase, or any other). Set DATABASE_URL, e.g.
//   postgresql://user:password@host/dbname?sslmode=require
// BIGINT (int8) comes back from pg as a string by default; every int8 column
// here (ids, epoch-ms timestamps) fits in a JS number.
types.setTypeParser(20, (v) => parseInt(v, 10));

/**
 * Bump this whenever SCHEMA_SQL changes. It is recorded in schema_migrations
 * and is also part of the in-process init cache key, so a hot reload that
 * ships new DDL re-runs the (idempotent) migration instead of trusting the
 * promise a previous module instance left behind.
 */
export const SCHEMA_VERSION = "2026-11-19-recommender-1";

// Arbitrary but stable int32 key: serializes concurrent initializers.
const MIGRATION_LOCK_KEY = 2_026_111_901;

const SCHEMA_MIGRATIONS_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

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

  -- ── Recommendation engine ────────────────────────────────────────────────
  -- Raw listening events. Kept for co-listen pairs, the 30-day negative
  -- window and debugging; swept after 180 days. The aggregates below are what
  -- keep long-term taste alive once these are gone.
  CREATE TABLE IF NOT EXISTS listening_events (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    song_id TEXT NOT NULL,
    event TEXT NOT NULL,
    position_seconds INTEGER NOT NULL DEFAULT 0,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    completion REAL,
    quality REAL,
    negative BOOLEAN NOT NULL DEFAULT false,
    instance_id TEXT,
    session_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_listening_events_user ON listening_events (user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_listening_events_song ON listening_events (user_id, song_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_listening_events_created ON listening_events (created_at);
  -- One row per (user, play instance, kind), so a re-mounted provider or a
  -- retried request can never double count.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_listening_events_instance
    ON listening_events (user_id, instance_id, event) WHERE instance_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS song_stats (
    user_id TEXT NOT NULL,
    song_id TEXT NOT NULL,
    plays INTEGER NOT NULL DEFAULT 0,
    quality_sum DOUBLE PRECISION NOT NULL DEFAULT 0,
    completions INTEGER NOT NULL DEFAULT 0,
    fast_skips INTEGER NOT NULL DEFAULT 0,
    late_skips INTEGER NOT NULL DEFAULT 0,
    replays INTEGER NOT NULL DEFAULT 0,
    likes INTEGER NOT NULL DEFAULT 0,
    playlist_adds INTEGER NOT NULL DEFAULT 0,
    last_played_at BIGINT,
    times_recommended INTEGER NOT NULL DEFAULT 0,
    times_recommended_ignored INTEGER NOT NULL DEFAULT 0,
    last_recommended_at BIGINT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, song_id)
  );

  CREATE TABLE IF NOT EXISTS artist_stats (
    user_id TEXT NOT NULL,
    artist_key TEXT NOT NULL,
    plays INTEGER NOT NULL DEFAULT 0,
    quality_sum DOUBLE PRECISION NOT NULL DEFAULT 0,
    completions INTEGER NOT NULL DEFAULT 0,
    fast_skips INTEGER NOT NULL DEFAULT 0,
    late_skips INTEGER NOT NULL DEFAULT 0,
    replays INTEGER NOT NULL DEFAULT 0,
    likes INTEGER NOT NULL DEFAULT 0,
    playlist_adds INTEGER NOT NULL DEFAULT 0,
    last_played_at BIGINT,
    times_recommended INTEGER NOT NULL DEFAULT 0,
    times_recommended_ignored INTEGER NOT NULL DEFAULT 0,
    last_recommended_at BIGINT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, artist_key)
  );

  CREATE TABLE IF NOT EXISTS album_stats (
    user_id TEXT NOT NULL,
    album_key TEXT NOT NULL,
    plays INTEGER NOT NULL DEFAULT 0,
    quality_sum DOUBLE PRECISION NOT NULL DEFAULT 0,
    completions INTEGER NOT NULL DEFAULT 0,
    fast_skips INTEGER NOT NULL DEFAULT 0,
    late_skips INTEGER NOT NULL DEFAULT 0,
    replays INTEGER NOT NULL DEFAULT 0,
    likes INTEGER NOT NULL DEFAULT 0,
    playlist_adds INTEGER NOT NULL DEFAULT 0,
    last_played_at BIGINT,
    times_recommended INTEGER NOT NULL DEFAULT 0,
    times_recommended_ignored INTEGER NOT NULL DEFAULT 0,
    last_recommended_at BIGINT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, album_key)
  );

  -- Catalog metadata. Global by design: it describes a song, not a listener.
  -- genre/language stay NULL unless a real source provided them, and the
  -- scoring renormalizes the terms it cannot evaluate.
  CREATE TABLE IF NOT EXISTS track_features (
    song_id TEXT PRIMARY KEY,
    youtube_id TEXT,
    title TEXT NOT NULL DEFAULT '',
    artist TEXT NOT NULL DEFAULT '',
    artist_key TEXT NOT NULL DEFAULT '',
    album TEXT NOT NULL DEFAULT '',
    album_key TEXT NOT NULL DEFAULT '',
    cover_url TEXT,
    genre TEXT,
    language TEXT,
    duration INTEGER NOT NULL DEFAULT 0,
    source TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS user_profile (
    user_id TEXT PRIMARY KEY,
    long_term_json TEXT NOT NULL DEFAULT '{}',
    mood_json TEXT NOT NULL DEFAULT '{}',
    long_term_count INTEGER NOT NULL DEFAULT 0,
    signal_version INTEGER NOT NULL DEFAULT 0,
    session_id TEXT,
    session_started_at BIGINT,
    last_rebuild_at BIGINT,
    last_rebuild_day TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Last slate served for each section, so Home stays stable inside a session.
  CREATE TABLE IF NOT EXISTS recommendation_slate (
    user_id TEXT NOT NULL,
    section TEXT NOT NULL,
    payload TEXT NOT NULL,
    signal_version INTEGER NOT NULL DEFAULT 0,
    built_at BIGINT NOT NULL,
    session_id TEXT,
    built_day TEXT,
    PRIMARY KEY (user_id, section)
  );
`;

interface DbState {
  pool: Pool | null;
  ready: Promise<void> | null;
  /** SCHEMA_VERSION the cached `ready` promise was built for. */
  version: string | null;
}

// Survive Next.js dev hot reloads without leaking connection pools.
const g = globalThis as unknown as { __shubhuDb?: DbState };
const state: DbState = (g.__shubhuDb ??= { pool: null, ready: null, version: null });

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

/**
 * Applies the full, idempotent schema on the *same* pool the app queries.
 *
 * Running the DDL here (instead of on DATABASE_URL_UNPOOLED) is deliberate:
 * a pooled/unpooled pair can point at different Neon branches, and a migration
 * that lands on the wrong database is exactly how tables go missing while the
 * app keeps returning HTTP 200 fallbacks.
 *
 * The transaction + advisory lock make concurrent cold starts safe: one
 * initializer runs the DDL, the rest wait, then everyone uses the schema.
 * Failures are re-thrown, never swallowed.
 */
async function migrate(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [MIGRATION_LOCK_KEY]);
    await client.query(SCHEMA_MIGRATIONS_SQL);
    await client.query(SCHEMA_SQL);
    await client.query(
      "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING",
      [SCHEMA_VERSION],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Explicit entry point for scripts and tests. Runs the idempotent DDL against
 * the configured database even if this process already initialized it.
 */
export async function migrateDatabase(): Promise<void> {
  if (!state.pool) state.pool = createPool();
  await migrate(state.pool);
}

async function ready(): Promise<Pool> {
  if (!state.pool) state.pool = createPool();
  // Re-run when there is no promise yet, or when a hot reload shipped a newer
  // SCHEMA_VERSION. Without the version check, a process that started before a
  // DDL change would keep using the old schema forever.
  if (!state.ready || state.version !== SCHEMA_VERSION) {
    const pool = state.pool;
    state.version = SCHEMA_VERSION;
    state.ready = migrate(pool).then(
      () => undefined,
      (err) => {
        state.ready = null; // retry on the next request
        state.version = null;
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
