// Applies and verifies the Postgres schema used by the app.
//
//   npm run db:migrate
//
// Safe to run at any time, and as many times as you like: every statement is
// idempotent, migrations run in a transaction under an advisory lock, and no
// existing row is ever dropped or rewritten. Exits non-zero on any failure.
import { migrateDatabase, query, SCHEMA_VERSION } from "../src/lib/db.ts";

const REQUIRED_TABLES = [
  "listening_events",
  "song_stats",
  "artist_stats",
  "album_stats",
  "track_features",
  "user_profile",
  "recommendation_slate",
  "downloads",
];

const REQUIRED_INDEXES = [
  "idx_listening_events_user",
  "idx_listening_events_song",
  "idx_listening_events_created",
  "idx_listening_events_instance",
];

const PRESERVED_TABLES = [
  "users",
  "liked_songs",
  "playlists",
  "playlist_songs",
  "listening_history",
  "downloads",
];

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

try {
  console.log(`schema version: ${SCHEMA_VERSION}`);

  // Run twice to prove idempotency in the same process.
  await migrateDatabase();
  await migrateDatabase();
  console.log("migration: executed twice without error (idempotent)");

  const db = await query(
    "SELECT current_database() AS db, current_schema() AS schema, current_setting('search_path') AS search_path",
  );
  console.log(`target: ${db[0].db}.${db[0].schema} (search_path: ${db[0].search_path})`);

  const versionRow = await query("SELECT version, applied_at FROM schema_migrations WHERE version = $1", [
    SCHEMA_VERSION,
  ]);
  if (versionRow.length === 0) fail(`schema_migrations has no row for ${SCHEMA_VERSION}`);
  else console.log(`schema_migrations: recorded ${versionRow[0].version} at ${versionRow[0].applied_at.toISOString()}`);

  const tables = await query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1)",
    [REQUIRED_TABLES],
  );
  const present = new Set(tables.map((r) => r.table_name));
  for (const table of REQUIRED_TABLES) {
    if (present.has(table)) console.log(`table: ${table} OK`);
    else fail(`missing table ${table}`);
  }

  const indexes = await query(
    "SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND indexname = ANY($1)",
    [REQUIRED_INDEXES],
  );
  const presentIndexes = new Set(indexes.map((r) => r.indexname));
  for (const index of REQUIRED_INDEXES) {
    if (presentIndexes.has(index)) console.log(`index: ${index} OK`);
    else fail(`missing index ${index}`);
  }

  // Primary keys are the constraints the engine's upserts depend on.
  const constraints = await query(
    `SELECT c.conrelid::regclass::text AS table_name, c.contype
       FROM pg_constraint c
      WHERE c.connamespace = current_schema()::regnamespace
        AND c.conrelid::regclass::text = ANY($1)
        AND c.contype = 'p'`,
    [REQUIRED_TABLES],
  );
  const pkTables = new Set(constraints.map((r) => r.table_name));
  for (const table of REQUIRED_TABLES) {
    if (pkTables.has(table)) console.log(`primary key: ${table} OK`);
    else fail(`missing primary key on ${table}`);
  }

  const instanceUnique = await query(
    `SELECT indexdef FROM pg_indexes
      WHERE schemaname = current_schema() AND indexname = 'idx_listening_events_instance'`,
  );
  if (instanceUnique.length === 0 || !/UNIQUE/i.test(instanceUnique[0].indexdef)) {
    fail("idx_listening_events_instance is not a unique index");
  } else {
    console.log("unique index: listening_events instance dedupe OK");
  }

  const counts = await query(
    `SELECT
       (SELECT count(*) FROM users)::int AS users,
       (SELECT count(*) FROM liked_songs)::int AS liked_songs,
       (SELECT count(*) FROM playlists)::int AS playlists,
       (SELECT count(*) FROM listening_history)::int AS listening_history,
       (SELECT count(*) FROM downloads)::int AS downloads`,
  );
  console.log(`existing data: ${JSON.stringify(counts[0])}`);
} catch (err) {
  console.error("FAIL:", err.code || "", err.message);
  process.exitCode = 1;
} finally {
  // Let the pool drain so the process exits promptly.
  process.exit(process.exitCode || 0);
}
