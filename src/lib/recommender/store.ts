import { query, queryOne, type Queryable } from "@/lib/db";
import { albumKey, artistKey } from "./similar";
import type { KeyStats, LongTermJson, MoodJson, SongStats, TrackFeature } from "./types";
import { emptyLongTerm } from "./types";

const DAY_MS = 86_400_000;

/** Default runner, so pure read helpers can also take a transaction. */
const defaultDb: Queryable = {
  query: (sql, params) => query(sql, params),
  queryOne: (sql, params) => queryOne(sql, params),
};

export interface TrackLike {
  id: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  duration?: number;
  youtubeId?: string;
  genre?: string;
  language?: string;
}

/** Builds catalog metadata from anything shaped like a Track. */
export function toFeature(track: TrackLike): TrackFeature {
  const youtubeId =
    track.youtubeId && /^[A-Za-z0-9_-]{11}$/.test(track.youtubeId)
      ? track.youtubeId
      : /^[A-Za-z0-9_-]{11}$/.test(track.id)
        ? track.id
        : null;

  return {
    songId: track.id,
    youtubeId,
    title: track.title ?? "",
    artist: track.artist ?? "",
    artistKey: artistKey(track.artist ?? ""),
    album: track.album ?? "",
    albumKey: albumKey(track.album ?? ""),
    coverUrl: track.coverUrl ?? "",
    genre: track.genre && track.genre.trim() ? track.genre.trim() : null,
    language: track.language && track.language.trim() ? track.language.trim() : null,
    duration: Number.isFinite(track.duration) ? Math.max(0, Math.round(track.duration ?? 0)) : 0,
  };
}

interface SongStatsRow {
  song_id: string;
  plays: number;
  quality_sum: number;
  completions: number;
  fast_skips: number;
  late_skips: number;
  replays: number;
  likes: number;
  playlist_adds: number;
  last_played_at: number | null;
  times_recommended: number;
  times_recommended_ignored: number;
  last_recommended_at: number | null;
}

interface KeyStatsRow {
  stat_key: string;
  plays: number;
  quality_sum: number;
  completions: number;
  fast_skips: number;
  late_skips: number;
  likes: number;
  playlist_adds: number;
  last_played_at: number | null;
  times_recommended: number;
  times_recommended_ignored: number;
  last_recommended_at: number | null;
}

export interface ProfileRow {
  long_term_json: string;
  mood_json: string;
  long_term_count: number;
  signal_version: number;
  session_id: string | null;
  session_started_at: number | null;
  last_rebuild_at: number | null;
  last_rebuild_day: string | null;
}

export interface SlateRow {
  payload: string;
  signal_version: number;
  built_at: number;
  session_id: string | null;
  built_day: string | null;
}

export async function loadSongStats(userId: string): Promise<SongStats[]> {
  const rows = await query<SongStatsRow>(
    `SELECT song_id, plays, quality_sum, completions, fast_skips, late_skips, replays, likes,
            playlist_adds, last_played_at, times_recommended, times_recommended_ignored, last_recommended_at
       FROM song_stats WHERE user_id = $1`,
    [userId],
  );
  return rows.map((row) => ({
    songId: row.song_id,
    plays: row.plays ?? 0,
    qualitySum: row.quality_sum ?? 0,
    completions: row.completions ?? 0,
    fastSkips: row.fast_skips ?? 0,
    lateSkips: row.late_skips ?? 0,
    replays: row.replays ?? 0,
    likes: row.likes ?? 0,
    playlistAdds: row.playlist_adds ?? 0,
    lastPlayedAt: row.last_played_at ?? null,
    timesRecommended: row.times_recommended ?? 0,
    timesRecommendedIgnored: row.times_recommended_ignored ?? 0,
    lastRecommendedAt: row.last_recommended_at ?? null,
  }));
}

async function loadKeyStats(
  table: "artist_stats" | "album_stats",
  keyColumn: "artist_key" | "album_key",
  userId: string,
): Promise<KeyStats[]> {
  const rows = await query<KeyStatsRow>(
    `SELECT ${keyColumn} AS stat_key, plays, quality_sum, completions, fast_skips, late_skips,
            likes, playlist_adds, last_played_at, times_recommended, times_recommended_ignored, last_recommended_at
       FROM ${table} WHERE user_id = $1`,
    [userId],
  );
  return rows.map((row) => ({
    key: row.stat_key,
    plays: row.plays ?? 0,
    qualitySum: row.quality_sum ?? 0,
    completions: row.completions ?? 0,
    fastSkips: row.fast_skips ?? 0,
    lateSkips: row.late_skips ?? 0,
    likes: row.likes ?? 0,
    playlistAdds: row.playlist_adds ?? 0,
    lastPlayedAt: row.last_played_at ?? null,
    timesRecommended: row.times_recommended ?? 0,
    timesRecommendedIgnored: row.times_recommended_ignored ?? 0,
  }));
}

export function loadArtistStats(userId: string): Promise<KeyStats[]> {
  return loadKeyStats("artist_stats", "artist_key", userId);
}

export function loadAlbumStats(userId: string): Promise<KeyStats[]> {
  return loadKeyStats("album_stats", "album_key", userId);
}

interface FeatureRow {
  song_id: string;
  youtube_id: string | null;
  title: string;
  artist: string;
  artist_key: string;
  album: string;
  album_key: string;
  cover_url: string | null;
  genre: string | null;
  language: string | null;
  duration: number;
}

function rowToFeature(row: FeatureRow): TrackFeature {
  return {
    songId: row.song_id,
    youtubeId: row.youtube_id,
    title: row.title,
    artist: row.artist,
    artistKey: row.artist_key,
    album: row.album,
    albumKey: row.album_key,
    coverUrl: row.cover_url ?? "",
    genre: row.genre,
    language: row.language,
    duration: row.duration ?? 0,
  };
}

export async function loadFeatures(songIds: string[]): Promise<Map<string, TrackFeature>> {
  const result = new Map<string, TrackFeature>();
  if (songIds.length === 0) return result;

  const rows = await query<FeatureRow>(
    `SELECT song_id, youtube_id, title, artist, artist_key, album, album_key, cover_url, genre, language, duration
       FROM track_features WHERE song_id = ANY($1)`,
    [songIds],
  );
  for (const row of rows) result.set(row.song_id, rowToFeature(row));
  return result;
}

const FEATURE_COLUMNS =
  "song_id, youtube_id, title, artist, artist_key, album, album_key, cover_url, genre, language, duration";

export async function upsertFeatures(features: TrackFeature[], source: string): Promise<void> {
  const unique = new Map<string, TrackFeature>();
  for (const feature of features) if (feature.songId) unique.set(feature.songId, feature);
  const rows = [...unique.values()];
  if (rows.length === 0) return;

  const chunkSize = 40;
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const params: unknown[] = [];
    const values = chunk.map((feature, index) => {
      const base = index * 12;
      params.push(
        feature.songId,
        feature.youtubeId,
        feature.title,
        feature.artist,
        feature.artistKey,
        feature.album,
        feature.albumKey,
        feature.coverUrl || null,
        feature.genre,
        feature.language,
        feature.duration,
        source,
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12})`;
    });

    await query(
      `INSERT INTO track_features (${FEATURE_COLUMNS}, source)
       VALUES ${values.join(", ")}
       ON CONFLICT (song_id) DO UPDATE SET
         youtube_id = COALESCE(EXCLUDED.youtube_id, track_features.youtube_id),
         title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE track_features.title END,
         artist = CASE WHEN EXCLUDED.artist <> '' THEN EXCLUDED.artist ELSE track_features.artist END,
         artist_key = CASE WHEN EXCLUDED.artist_key <> '' THEN EXCLUDED.artist_key ELSE track_features.artist_key END,
         album = CASE WHEN EXCLUDED.album <> '' THEN EXCLUDED.album ELSE track_features.album END,
         album_key = CASE WHEN EXCLUDED.album_key <> '' THEN EXCLUDED.album_key ELSE track_features.album_key END,
         cover_url = COALESCE(EXCLUDED.cover_url, track_features.cover_url),
         genre = COALESCE(EXCLUDED.genre, track_features.genre),
         language = COALESCE(EXCLUDED.language, track_features.language),
         duration = CASE WHEN EXCLUDED.duration > 0 THEN EXCLUDED.duration ELSE track_features.duration END,
         updated_at = now()`,
      params,
    );
  }
}

export async function ensureUserProfile(userId: string): Promise<ProfileRow> {
  await query("INSERT INTO user_profile (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [userId]);
  const row = await queryOne<ProfileRow>(
    `SELECT long_term_json, mood_json, long_term_count, signal_version, session_id,
            session_started_at, last_rebuild_at, last_rebuild_day
       FROM user_profile WHERE user_id = $1`,
    [userId],
  );
  return row ?? emptyProfileRow();
}

function emptyProfileRow(): ProfileRow {
  return {
    long_term_json: "{}",
    mood_json: "{}",
    long_term_count: 0,
    signal_version: 0,
    session_id: null,
    session_started_at: null,
    last_rebuild_at: null,
    last_rebuild_day: null,
  };
}

/**
 * Row-locks the profile inside a transaction. Concurrent activity requests for
 * the same user serialize here, so two events can never read the same JSON and
 * overwrite each other's merge (a lost update).
 */
export async function lockUserProfile(db: Queryable, userId: string): Promise<ProfileRow> {
  await db.query("INSERT INTO user_profile (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [userId]);
  const row = await db.queryOne<ProfileRow>(
    `SELECT long_term_json, mood_json, long_term_count, signal_version, session_id,
            session_started_at, last_rebuild_at, last_rebuild_day
       FROM user_profile WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );
  return row ?? emptyProfileRow();
}

function parseJson<T>(raw: string, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<T> | null;
    if (!parsed || typeof parsed !== "object") return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function parseMood(raw: string): MoodJson {
  return parseJson<MoodJson>(raw, {});
}

export function parseLongTerm(raw: string): LongTermJson {
  const parsed = parseJson<Partial<LongTermJson>>(raw, {});
  if (parsed.artists && parsed.albums && parsed.tags) {
    return {
      artists: parsed.artists,
      albums: parsed.albums,
      tags: parsed.tags,
      topGenres: Array.isArray(parsed.topGenres) ? parsed.topGenres : [],
      plays: typeof parsed.plays === "number" ? parsed.plays : 0,
    };
  }
  return emptyLongTerm();
}

export interface ProfileUpdate {
  mood?: MoodJson;
  longTerm?: LongTermJson;
  longTermCount?: number;
  signalVersion?: number;
  sessionId?: string | null;
  sessionStartedAt?: number | null;
  lastRebuildAt?: number | null;
  lastRebuildDay?: string | null;
}

export async function saveUserProfile(
  userId: string,
  update: ProfileUpdate,
  db: Queryable = defaultDb,
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [userId];

  const push = (column: string, value: unknown) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };

  if (update.mood !== undefined) push("mood_json", JSON.stringify(update.mood));
  if (update.longTerm !== undefined) push("long_term_json", JSON.stringify(update.longTerm));
  if (update.longTermCount !== undefined) push("long_term_count", update.longTermCount);
  if (update.signalVersion !== undefined) push("signal_version", update.signalVersion);
  if (update.sessionId !== undefined) push("session_id", update.sessionId);
  if (update.sessionStartedAt !== undefined) push("session_started_at", update.sessionStartedAt);
  if (update.lastRebuildAt !== undefined) push("last_rebuild_at", update.lastRebuildAt);
  if (update.lastRebuildDay !== undefined) push("last_rebuild_day", update.lastRebuildDay);
  if (sets.length === 0) return;

  await db.query(
    `UPDATE user_profile SET ${sets.join(", ")}, updated_at = now() WHERE user_id = $1`,
    params,
  );
}

export async function loadSlate(userId: string, section: string): Promise<SlateRow | null> {
  const row = await queryOne<SlateRow>(
    `SELECT payload, signal_version, built_at, session_id, built_day
       FROM recommendation_slate WHERE user_id = $1 AND section = $2`,
    [userId, section],
  );
  return row ?? null;
}

export async function saveSlate(
  userId: string,
  section: string,
  payload: string,
  signalVersion: number,
  builtAt: number,
  sessionId: string | null,
  builtDay: string,
): Promise<void> {
  await query(
    `INSERT INTO recommendation_slate (user_id, section, payload, signal_version, built_at, session_id, built_day)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, section) DO UPDATE SET
       payload = EXCLUDED.payload,
       signal_version = EXCLUDED.signal_version,
       built_at = EXCLUDED.built_at,
       session_id = EXCLUDED.session_id,
       built_day = EXCLUDED.built_day`,
    [userId, section, payload, signalVersion, builtAt, sessionId, builtDay],
  );
}

export interface NegativeRow {
  song_id: string;
  fast_skips: number;
  completions: number;
}

/** Negative evidence uses the exact 30-day window, so old skips fall out. */
export async function loadNegativeEvidence(
  userId: string,
  days: number,
): Promise<Map<string, { fastSkips: number; completions: number }>> {
  const since = new Date(Date.now() - days * DAY_MS);
  const rows = await query<NegativeRow>(
    `SELECT song_id,
            COUNT(*) FILTER (WHERE event = 'skip' AND (negative OR completion < 0.1))::int AS fast_skips,
            COUNT(*) FILTER (WHERE event = 'complete')::int AS completions
       FROM listening_events
      WHERE user_id = $1 AND created_at >= $2
      GROUP BY song_id`,
    [userId, since],
  );
  const result = new Map<string, { fastSkips: number; completions: number }>();
  for (const row of rows) {
    result.set(row.song_id, { fastSkips: row.fast_skips ?? 0, completions: row.completions ?? 0 });
  }
  return result;
}

/** Co-listen pairs from shared sessions, normalized to 0..1. */
export async function loadCoListenMap(
  userId: string,
  days: number,
  limit = 500,
): Promise<Map<string, number>> {
  const since = new Date(Date.now() - days * DAY_MS);
  const rows = await query<{ a: string; b: string; shared: number }>(
    `SELECT a.song_id AS a, b.song_id AS b, COUNT(*)::int AS shared
       FROM listening_events a
       JOIN listening_events b
         ON a.user_id = b.user_id
        AND a.session_id = b.session_id
        AND a.song_id < b.song_id
      WHERE a.user_id = $1
        AND a.event = 'play'
        AND b.event = 'play'
        AND a.created_at >= $2
      GROUP BY a.song_id, b.song_id
      ORDER BY shared DESC
      LIMIT ${Math.max(1, Math.min(2000, Math.round(limit)))}`,
    [userId, since],
  );

  const max = rows.reduce((best, row) => Math.max(best, row.shared ?? 0), 0);
  const map = new Map<string, number>();
  if (max <= 0) return map;
  for (const row of rows) {
    const key = row.a < row.b ? `${row.a}|${row.b}` : `${row.b}|${row.a}`;
    map.set(key, Math.min(1, (row.shared ?? 0) / max));
  }
  return map;
}

export function coListenLookup(map: Map<string, number>): (a: string, b: string) => number | null {
  return (a, b) => {
    if (!a || !b) return null;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    return map.get(key) ?? null;
  };
}

/** Songs played in the last N play events, newest first. */
export async function loadPlayedInLast(userId: string, count: number): Promise<string[]> {
  const rows = await query<{ song_id: string }>(
    `SELECT song_id FROM listening_events
      WHERE user_id = $1 AND event = 'play'
      ORDER BY id DESC
      LIMIT ${Math.max(1, Math.min(50, Math.round(count)))}`,
    [userId],
  );
  return rows.map((row) => row.song_id);
}

export async function markRecommended(userId: string, songIds: string[], now: number): Promise<void> {
  if (songIds.length === 0) return;
  await query(
    `UPDATE song_stats
        SET times_recommended = times_recommended + 1,
            last_recommended_at = $2
      WHERE user_id = $1 AND song_id = ANY($3)`,
    [userId, now, songIds],
  );
}

interface StatDelta {
  plays?: number;
  quality?: number;
  completions?: number;
  fastSkips?: number;
  lateSkips?: number;
  replays?: number;
  likes?: number;
  playlistAdds?: number;
  lastPlayedAt?: number | null;
}

export async function applySongStat(
  userId: string,
  songId: string,
  delta: StatDelta,
  db: Queryable = defaultDb,
): Promise<number> {
  const rows = await db.query<{ plays: number }>(
    `INSERT INTO song_stats (user_id, song_id, plays, quality_sum, completions, fast_skips, late_skips, replays, likes, playlist_adds, last_played_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (user_id, song_id) DO UPDATE SET
       plays = song_stats.plays + EXCLUDED.plays,
       quality_sum = song_stats.quality_sum + EXCLUDED.quality_sum,
       completions = song_stats.completions + EXCLUDED.completions,
       fast_skips = song_stats.fast_skips + EXCLUDED.fast_skips,
       late_skips = song_stats.late_skips + EXCLUDED.late_skips,
       replays = song_stats.replays + EXCLUDED.replays,
       likes = GREATEST(song_stats.likes + EXCLUDED.likes, 0),
       playlist_adds = song_stats.playlist_adds + EXCLUDED.playlist_adds,
       last_played_at = GREATEST(COALESCE(song_stats.last_played_at, 0), COALESCE(EXCLUDED.last_played_at, 0)),
       updated_at = now()
     RETURNING plays`,
    [
      userId,
      songId,
      delta.plays ?? 0,
      delta.quality ?? 0,
      delta.completions ?? 0,
      delta.fastSkips ?? 0,
      delta.lateSkips ?? 0,
      delta.replays ?? 0,
      delta.likes ?? 0,
      delta.playlistAdds ?? 0,
      delta.lastPlayedAt ?? null,
    ],
  );
  return rows[0]?.plays ?? 0;
}

export async function applyKeyStat(
  table: "artist_stats" | "album_stats",
  keyColumn: "artist_key" | "album_key",
  userId: string,
  key: string,
  delta: StatDelta,
  db: Queryable = defaultDb,
): Promise<void> {
  if (!key) return;
  await db.query(
    `INSERT INTO ${table} (user_id, ${keyColumn}, plays, quality_sum, completions, fast_skips, late_skips, replays, likes, playlist_adds, last_played_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (user_id, ${keyColumn}) DO UPDATE SET
       plays = ${table}.plays + EXCLUDED.plays,
       quality_sum = ${table}.quality_sum + EXCLUDED.quality_sum,
       completions = ${table}.completions + EXCLUDED.completions,
       fast_skips = ${table}.fast_skips + EXCLUDED.fast_skips,
       late_skips = ${table}.late_skips + EXCLUDED.late_skips,
       replays = ${table}.replays + EXCLUDED.replays,
       likes = GREATEST(${table}.likes + EXCLUDED.likes, 0),
       playlist_adds = ${table}.playlist_adds + EXCLUDED.playlist_adds,
       last_played_at = GREATEST(COALESCE(${table}.last_played_at, 0), COALESCE(EXCLUDED.last_played_at, 0)),
       updated_at = now()`,
    [
      userId,
      key,
      delta.plays ?? 0,
      delta.quality ?? 0,
      delta.completions ?? 0,
      delta.fastSkips ?? 0,
      delta.lateSkips ?? 0,
      delta.replays ?? 0,
      delta.likes ?? 0,
      delta.playlistAdds ?? 0,
      delta.lastPlayedAt ?? null,
    ],
  );
}

/** Liked songs are a strong signal even before a play is recorded. */
export async function loadLikedFeatures(userId: string): Promise<TrackFeature[]> {
  const rows = await query<{
    song_id: string;
    title: string;
    artist: string;
    album: string | null;
    cover_url: string | null;
    duration: number | null;
    youtube_id: string | null;
  }>(
    `SELECT song_id, title, artist, album, cover_url, duration, youtube_id
       FROM liked_songs WHERE user_id = $1`,
    [userId],
  );
  return rows.map((row) => ({
    songId: row.song_id,
    youtubeId: row.youtube_id,
    title: row.title,
    artist: row.artist,
    artistKey: artistKey(row.artist),
    album: row.album ?? "",
    albumKey: albumKey(row.album ?? ""),
    coverUrl: row.cover_url ?? "",
    genre: null,
    language: null,
    duration: row.duration ?? 0,
  }));
}

export interface ListeningEventInput {
  songId: string;
  event: string;
  positionSeconds: number;
  durationSeconds: number;
  completion: number | null;
  quality: number | null;
  negative: boolean;
  instanceId: string | null;
  sessionId: string | null;
}

/**
 * Inserts one raw event and reports whether it was genuinely new.
 *
 * The partial unique index on (user_id, instance_id, event) is the dedupe key.
 * Crucially, callers must only touch aggregates when this returns true; that is
 * what stops a retried request from inflating plays/completions/skips.
 */
export async function insertListeningEvent(
  db: Queryable,
  userId: string,
  input: ListeningEventInput,
): Promise<boolean> {
  const rows = await db.query<{ id: number }>(
    `INSERT INTO listening_events
       (user_id, song_id, event, position_seconds, duration_seconds, completion, quality, negative, instance_id, session_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      userId,
      input.songId,
      input.event,
      input.positionSeconds,
      input.durationSeconds,
      input.completion,
      input.quality,
      input.negative,
      input.instanceId,
      input.sessionId,
    ],
  );
  return rows.length > 0;
}

/**
 * Counts qualified refresh signals (closed plays and explicit feedback) since
 * a timestamp, plus how many distinct tracks they cover. The recommend route
 * uses both so three events from one song cannot reshuffle Home.
 */
export async function countSignalsSince(
  userId: string,
  sinceMs: number,
): Promise<{ count: number; tracks: number }> {
  const rows = await query<{ count: number; tracks: number }>(
    `SELECT COUNT(*)::int AS count, COUNT(DISTINCT song_id)::int AS tracks
       FROM listening_events
      WHERE user_id = $1
        AND created_at >= to_timestamp($2 / 1000.0)
        AND event IN ('complete', 'skip', 'like', 'unlike', 'playlist_add')`,
    [userId, sinceMs],
  );
  return { count: rows[0]?.count ?? 0, tracks: rows[0]?.tracks ?? 0 };
}

/** Real play counts from the database, newest/heaviest first. */
export async function loadMostPlayed(userId: string, limit: number): Promise<TrackFeature[]> {
  const cap = Math.max(1, Math.min(50, Math.round(limit)));
  const rows = await query<FeatureRow>(
    `SELECT f.song_id, f.youtube_id, f.title, f.artist, f.artist_key, f.album, f.album_key,
            f.cover_url, f.genre, f.language, f.duration
       FROM song_stats s
       JOIN track_features f ON f.song_id = s.song_id
      WHERE s.user_id = $1 AND s.plays > 0
      ORDER BY s.plays DESC, s.last_played_at DESC NULLS LAST
      LIMIT ${cap}`,
    [userId],
  );
  return rows.map(rowToFeature);
}

function parseObject(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Sums q/n, keeps the newest timestamp. Used only by the one-time guest merge. */
function mergeAffinityMap(
  account: unknown,
  guest: unknown,
): Record<string, { q: number; n: number; t: number }> {
  const result: Record<string, { q: number; n: number; t: number }> = {};
  const add = (source: unknown) => {
    if (!source || typeof source !== "object") return;
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      const entry = value as { q?: unknown; n?: unknown; t?: unknown } | null;
      if (!entry || typeof entry !== "object") continue;
      const previous = result[key] ?? { q: 0, n: 0, t: 0 };
      result[key] = {
        q: previous.q + (Number.isFinite(entry.q) ? Number(entry.q) : 0),
        n: previous.n + (Number.isFinite(entry.n) ? Number(entry.n) : 0),
        t: Math.max(previous.t, Number.isFinite(entry.t) ? Number(entry.t) : 0),
      };
    }
  };
  add(account);
  add(guest);
  return result;
}

function topGenresOf(tags: Record<string, { q: number; n: number; t: number }>): string[] {
  return Object.entries(tags)
    .filter(([key]) => key.startsWith("genre:"))
    .map(([key, entry]) => ({ genre: key.slice("genre:".length), value: entry.q / Math.max(1, entry.n) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((row) => row.genre);
}

/**
 * Folds a guest's recommender memory into an account, once (the caller already
 * claimed the guest id in merged_guests). Aggregates are added, raw events are
 * copied without duplicates, and the JSON profiles are summed — never replaced
 * — so an account with stronger history cannot be wiped by a fresh guest.
 */
export async function mergeGuestRecommenderData(
  db: Queryable,
  guestId: string,
  userId: string,
): Promise<void> {
  await db.query(
    `INSERT INTO listening_events
       (user_id, song_id, event, position_seconds, duration_seconds, completion, quality, negative, instance_id, session_id, created_at)
     SELECT $1, song_id, event, position_seconds, duration_seconds, completion, quality, negative, instance_id, session_id, created_at
       FROM listening_events WHERE user_id = $2
     ON CONFLICT DO NOTHING`,
    [userId, guestId],
  );

  const statTables: { table: string; key: string }[] = [
    { table: "song_stats", key: "song_id" },
    { table: "artist_stats", key: "artist_key" },
    { table: "album_stats", key: "album_key" },
  ];

  for (const { table, key } of statTables) {
    await db.query(
      `INSERT INTO ${table}
         (user_id, ${key}, plays, quality_sum, completions, fast_skips, late_skips, replays, likes, playlist_adds, last_played_at, times_recommended, times_recommended_ignored, last_recommended_at)
       SELECT $1, ${key}, plays, quality_sum, completions, fast_skips, late_skips, replays, likes, playlist_adds, last_played_at, times_recommended, times_recommended_ignored, last_recommended_at
         FROM ${table} WHERE user_id = $2
       ON CONFLICT (user_id, ${key}) DO UPDATE SET
         plays = ${table}.plays + EXCLUDED.plays,
         quality_sum = ${table}.quality_sum + EXCLUDED.quality_sum,
         completions = ${table}.completions + EXCLUDED.completions,
         fast_skips = ${table}.fast_skips + EXCLUDED.fast_skips,
         late_skips = ${table}.late_skips + EXCLUDED.late_skips,
         replays = ${table}.replays + EXCLUDED.replays,
         likes = GREATEST(${table}.likes + EXCLUDED.likes, 0),
         playlist_adds = ${table}.playlist_adds + EXCLUDED.playlist_adds,
         last_played_at = GREATEST(COALESCE(${table}.last_played_at, 0), COALESCE(EXCLUDED.last_played_at, 0)),
         times_recommended = ${table}.times_recommended + EXCLUDED.times_recommended,
         times_recommended_ignored = ${table}.times_recommended_ignored + EXCLUDED.times_recommended_ignored,
         last_recommended_at = GREATEST(COALESCE(${table}.last_recommended_at, 0), COALESCE(EXCLUDED.last_recommended_at, 0)),
         updated_at = now()`,
      [userId, guestId],
    );
  }

  const [account, guest] = await Promise.all([
    db.queryOne<ProfileRow>(
      `SELECT long_term_json, mood_json, long_term_count, signal_version, session_id,
              session_started_at, last_rebuild_at, last_rebuild_day
         FROM user_profile WHERE user_id = $1 FOR UPDATE`,
      [userId],
    ),
    db.queryOne<ProfileRow>(
      `SELECT long_term_json, mood_json, long_term_count, signal_version, session_id,
              session_started_at, last_rebuild_at, last_rebuild_day
         FROM user_profile WHERE user_id = $1`,
      [guestId],
    ),
  ]);

  if (guest) {
    const accountLong = parseObject(account?.long_term_json ?? "{}");
    const guestLong = parseObject(guest.long_term_json);
    const accountMood = parseObject(account?.mood_json ?? "{}");
    const guestMood = parseObject(guest.mood_json);

    const artists = mergeAffinityMap(accountLong.artists, guestLong.artists);
    const albums = mergeAffinityMap(accountLong.albums, guestLong.albums);
    const tags = mergeAffinityMap(accountLong.tags, guestLong.tags);
    const accountGenres = Array.isArray(accountLong.topGenres) ? (accountLong.topGenres as string[]) : [];
    const mergedLong: LongTermJson = {
      artists,
      albums,
      tags,
      topGenres: accountGenres.length > 0 ? accountGenres : topGenresOf(tags),
      plays:
        (Number.isFinite(accountLong.plays) ? Number(accountLong.plays) : 0) +
        (Number.isFinite(guestLong.plays) ? Number(guestLong.plays) : 0),
    };
    const mergedMood = mergeAffinityMap(accountMood, guestMood) as MoodJson;

    await db.query(
      `INSERT INTO user_profile
         (user_id, long_term_json, mood_json, long_term_count, signal_version, session_id, session_started_at, last_rebuild_at, last_rebuild_day)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id) DO UPDATE SET
         long_term_json = EXCLUDED.long_term_json,
         mood_json = EXCLUDED.mood_json,
         long_term_count = EXCLUDED.long_term_count,
         signal_version = EXCLUDED.signal_version,
         session_id = EXCLUDED.session_id,
         session_started_at = EXCLUDED.session_started_at,
         last_rebuild_at = EXCLUDED.last_rebuild_at,
         last_rebuild_day = EXCLUDED.last_rebuild_day,
         updated_at = now()`,
      [
        userId,
        JSON.stringify(mergedLong),
        JSON.stringify(mergedMood),
        (account?.long_term_count ?? 0) + (guest.long_term_count ?? 0),
        (account?.signal_version ?? 0) + (guest.signal_version ?? 0),
        account?.session_id ?? guest.session_id,
        account?.session_started_at ?? guest.session_started_at,
        account?.last_rebuild_at ?? guest.last_rebuild_at,
        account?.last_rebuild_day ?? guest.last_rebuild_day,
      ],
    );
  }

  // Guest slates are just a cache of the guest's old identity.
  await db.query("DELETE FROM recommendation_slate WHERE user_id = $1", [guestId]);
}

