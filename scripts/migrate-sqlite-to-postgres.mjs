// One-time import of the old local SQLite database (music.db) into Postgres.
//
//   npm run db:import-sqlite              # reads ./music.db
//   npm run db:import-sqlite -- path/to/other.db
//
// Safe to re-run: rows that already exist are skipped, and a user's listening
// history is only imported if they have none in Postgres yet. Reads the
// SQLite file only; it is never modified.

import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { withTransaction } from "../src/lib/db.ts";

const file = path.resolve(process.argv[2] || "music.db");
if (!fs.existsSync(file)) {
  console.error(`SQLite file not found: ${file}`);
  process.exit(1);
}

const sqlite = new DatabaseSync(file, { readOnly: true });
const all = (sql) => {
  try {
    return sqlite.prepare(sql).all();
  } catch {
    return []; // table missing in older files
  }
};
// SQLite stores CURRENT_TIMESTAMP as UTC text without a zone.
const ts = (v) => (v ? `${String(v).replace(" ", "T")}Z` : null);

const counts = {};
const bump = (name, n = 1) => (counts[name] = (counts[name] || 0) + n);

await withTransaction(async (tx) => {
  for (const r of all("SELECT id, username, avatar, created_at FROM users")) {
    const res = await tx.query(
      `INSERT INTO users (id, username, avatar, created_at) VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()))
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [r.id, r.username, r.avatar, ts(r.created_at)],
    );
    bump("users", res.length);
  }

  for (const r of all("SELECT * FROM liked_songs ORDER BY id")) {
    const res = await tx.query(
      `INSERT INTO liked_songs (user_id, song_id, title, artist, album, cover_url, duration, youtube_id, added_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, COALESCE($9::timestamptz, now()))
       ON CONFLICT (user_id, song_id) DO NOTHING RETURNING id`,
      [r.user_id, r.song_id, r.title, r.artist, r.album, r.cover_url, r.duration ?? 0, r.youtube_id, ts(r.added_at)],
    );
    bump("liked_songs", res.length);
  }

  for (const r of all("SELECT * FROM playlists")) {
    const res = await tx.query(
      `INSERT INTO playlists (id, user_id, name, description, cover_url, created_at)
       VALUES ($1,$2,$3,$4,$5, COALESCE($6::timestamptz, now()))
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [r.id, r.user_id, r.name, r.description, r.cover_url, ts(r.created_at)],
    );
    bump("playlists", res.length);
  }

  for (const r of all("SELECT * FROM playlist_songs ORDER BY id")) {
    const res = await tx.query(
      `INSERT INTO playlist_songs (playlist_id, song_id, title, artist, album, cover_url, duration, youtube_id, added_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, COALESCE($9::timestamptz, now()))
       ON CONFLICT (playlist_id, song_id) DO NOTHING RETURNING id`,
      [r.playlist_id, r.song_id, r.title, r.artist, r.album, r.cover_url, r.duration ?? 0, r.youtube_id, ts(r.added_at)],
    );
    bump("playlist_songs", res.length);
  }

  const haveHistory = new Set(
    (await tx.query("SELECT DISTINCT user_id FROM listening_history")).map((r) => r.user_id),
  );
  for (const r of all("SELECT * FROM listening_history ORDER BY id")) {
    if (haveHistory.has(r.user_id)) continue;
    await tx.query(
      `INSERT INTO listening_history (user_id, song_id, title, artist, album, cover_url, duration, youtube_id, played_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, COALESCE($9::timestamptz, now()))`,
      [r.user_id, r.song_id, r.title, r.artist, r.album ?? null, r.cover_url, r.duration ?? 0, r.youtube_id ?? null, ts(r.played_at)],
    );
    bump("listening_history");
  }

  for (const r of all("SELECT * FROM yt_cache")) {
    const res = await tx.query(
      `INSERT INTO yt_cache (query, youtube_id, title, duration) VALUES ($1,$2,$3,$4)
       ON CONFLICT (query) DO NOTHING RETURNING query`,
      [r.query, r.youtube_id, r.title, r.duration ?? 0],
    );
    bump("yt_cache", res.length);
  }
});

console.log(`Imported from ${file}:`);
for (const [table, n] of Object.entries(counts)) console.log(`  ${table.padEnd(18)} ${n}`);
process.exit(0);
