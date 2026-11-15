import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

const dbPath = path.join(process.cwd(), "music.db");

let dbInstance: any | null = null;

export function getDb(): any {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(dbPath);
    initTables(dbInstance);
  }
  return dbInstance;
}

function initTables(db: any) {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      avatar TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Liked songs
  db.exec(`
    CREATE TABLE IF NOT EXISTS liked_songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      song_id TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      album TEXT,
      cover_url TEXT,
      duration INTEGER DEFAULT 0,
      youtube_id TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, song_id)
    );
  `);

  // Custom playlists
  db.exec(`
    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      cover_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Playlist items
  db.exec(`
    CREATE TABLE IF NOT EXISTS playlist_songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id TEXT NOT NULL,
      song_id TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      album TEXT,
      cover_url TEXT,
      duration INTEGER DEFAULT 0,
      youtube_id TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(playlist_id, song_id)
    );
  `);

  // Listening History
  db.exec(`
    CREATE TABLE IF NOT EXISTS listening_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      song_id TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      cover_url TEXT,
      played_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // YouTube search cache for instant repeat playback
  db.exec(`
    CREATE TABLE IF NOT EXISTS yt_cache (
      query TEXT PRIMARY KEY,
      youtube_id TEXT NOT NULL,
      title TEXT,
      duration INTEGER,
      cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
