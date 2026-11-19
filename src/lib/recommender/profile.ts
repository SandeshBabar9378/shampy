import { DECAY, LISTEN_QUALITY, PROFILE } from "./config";
import { clamp01, decayFactor } from "./similar";
import type {
  AffinityEntry,
  KeyStats,
  LongTermJson,
  MoodJson,
  PlayClassification,
  SongStats,
  TrackFeature,
} from "./types";

const DAY_MS = 86_400_000;

/**
 * Turns one closed play into a quality value and skip flags.
 * A play shorter than 30 s is a fast skip even when the track is short; an
 * unknown duration is neutral and never counts as a skip.
 */
export function classifyPlay(input: {
  positionSeconds?: number;
  durationSeconds?: number;
  complete?: boolean;
  replays?: number;
}): PlayClassification {
  const duration = Math.max(0, Math.round(input.durationSeconds ?? 0));
  const position = Math.max(0, Math.round(input.positionSeconds ?? 0));
  const replays = Math.max(
    0,
    Math.min(LISTEN_QUALITY.maxReplaysCounted, Math.round(input.replays ?? 0)),
  );
  const replayBonus = LISTEN_QUALITY.replayStep * replays;
  const isComplete = Boolean(input.complete);

  if (duration <= 0) {
    const base = isComplete ? LISTEN_QUALITY.complete : LISTEN_QUALITY.unknown;
    return {
      quality: Math.min(LISTEN_QUALITY.replayCap, base + replayBonus),
      pct: null,
      isFastSkip: false,
      isLateSkip: false,
      isComplete,
      countsForCompletion: false,
    };
  }

  const pct = clamp01(position / duration);

  if (isComplete) {
    return {
      quality: Math.min(LISTEN_QUALITY.replayCap, LISTEN_QUALITY.complete + replayBonus),
      pct,
      isFastSkip: false,
      isLateSkip: false,
      isComplete: true,
      countsForCompletion: true,
    };
  }

  let baseQuality: number;
  if (pct < LISTEN_QUALITY.fastMax) baseQuality = LISTEN_QUALITY.fast;
  else if (pct < LISTEN_QUALITY.midMax) baseQuality = LISTEN_QUALITY.mid;
  else if (pct < LISTEN_QUALITY.lateMax) baseQuality = LISTEN_QUALITY.late;
  else baseQuality = LISTEN_QUALITY.nearComplete;

  const isFastSkip = pct < LISTEN_QUALITY.fastMax || position < LISTEN_QUALITY.fastSkipSeconds;

  return {
    quality: Math.min(LISTEN_QUALITY.replayCap, baseQuality + replayBonus),
    pct,
    isFastSkip,
    isLateSkip: !isFastSkip && pct < LISTEN_QUALITY.midMax,
    isComplete: false,
    countsForCompletion: true,
  };
}

/**
 * Mood profile merge. Only the last 50 plays inside 7 days survive; decay is
 * applied when the profile is read, never here, so a stored value never
 * silently changes meaning.
 */
export function mergeMood(mood: MoodJson, songId: string, quality: number, now: number): MoodJson {
  if (!songId) return mood;
  const previous = mood[songId];
  const next: MoodJson = {
    ...mood,
    [songId]: {
      q: (previous?.q ?? 0) + quality,
      n: (previous?.n ?? 0) + 1,
      t: now,
    },
  };

  const cutoff = now - PROFILE.moodMaxDays * DAY_MS;
  const kept = Object.entries(next)
    .filter(([, entry]) => entry.t >= cutoff)
    .sort((a, b) => b[1].t - a[1].t);

  const trimmed: MoodJson = {};
  let plays = 0;
  for (const [id, entry] of kept) {
    if (plays >= PROFILE.moodMaxPlays) break;
    const room = PROFILE.moodMaxPlays - plays;
    const counted = Math.min(entry.n, room);
    if (counted <= 0) break;
    trimmed[id] = {
      q: entry.q * (counted / entry.n),
      n: counted,
      t: entry.t,
    };
    plays += counted;
  }
  return trimmed;
}

function bumpEntry(
  entries: Record<string, AffinityEntry>,
  key: string,
  quality: number,
  now: number,
): void {
  if (!key) return;
  const previous = entries[key];
  entries[key] = {
    q: (previous?.q ?? 0) + quality,
    n: (previous?.n ?? 0) + 1,
    t: now,
  };
}

/**
 * Long-term merge. Callers only run this once the user has 20 closed plays,
 * which is what keeps long_term_json byte-identical before that point.
 */
export function mergeLongTerm(
  longTerm: LongTermJson,
  feature: TrackFeature,
  quality: number,
  now: number,
): LongTermJson {
  const next: LongTermJson = {
    artists: { ...longTerm.artists },
    albums: { ...longTerm.albums },
    tags: { ...longTerm.tags },
    topGenres: [...longTerm.topGenres],
    plays: longTerm.plays + 1,
  };

  bumpEntry(next.artists, feature.artistKey, quality, now);
  bumpEntry(next.albums, feature.albumKey, quality, now);
  if (feature.genre && feature.genre.trim()) {
    bumpEntry(next.tags, `genre:${feature.genre.trim().toLowerCase()}`, quality, now);
  }
  if (feature.language && feature.language.trim()) {
    bumpEntry(next.tags, `lang:${feature.language.trim().toLowerCase()}`, quality, now);
  }

  next.topGenres = Object.entries(next.tags)
    .filter(([key]) => key.startsWith("genre:"))
    .map(([key, entry]) => ({
      genre: key.slice("genre:".length),
      weight:
        (entry.q / Math.max(1, entry.n)) * decayFactor(now, entry.t, DECAY.longHalfLifeDays),
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((row) => row.genre);

  return next;
}

export type ColdStartStage = "cold" | "similarity" | "mood" | "full";

export function coldStartStage(plays: number): ColdStartStage {
  if (plays <= 0) return "cold";
  if (plays <= PROFILE.similarityOnlyMaxPlays) return "similarity";
  if (plays < PROFILE.longTermMinPlays) return "mood";
  return "full";
}

export interface BuiltProfile {
  songs: Map<string, SongStats>;
  artists: Map<string, KeyStats>;
  albums: Map<string, KeyStats>;
  /** Decayed, normalized 0..1 mood weight per song. */
  mood: Map<string, number>;
  longTermArtists: Map<string, number>;
  longTermAlbums: Map<string, number>;
  longTermTags: Map<string, number>;
  topGenres: string[];
  plays: number;
  stage: ColdStartStage;
}

function affinityMap(
  entries: Record<string, AffinityEntry>,
  now: number,
  halfLifeDays: number,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const [key, entry] of Object.entries(entries)) {
    const average = entry.q / Math.max(1, entry.n);
    const value = (average / LISTEN_QUALITY.complete) * decayFactor(now, entry.t, halfLifeDays);
    result.set(key, clamp01(value));
  }
  return result;
}

export function buildProfile(input: {
  songs: SongStats[];
  artists: KeyStats[];
  albums: KeyStats[];
  mood: MoodJson;
  longTerm: LongTermJson;
  longTermCount: number;
  now: number;
}): BuiltProfile {
  const stage = coldStartStage(input.longTermCount);

  const mood = new Map<string, number>();
  for (const [songId, entry] of Object.entries(input.mood)) {
    const average = entry.q / Math.max(1, entry.n);
    const value =
      (average / LISTEN_QUALITY.complete) * decayFactor(input.now, entry.t, DECAY.moodHalfLifeDays);
    mood.set(songId, clamp01(value));
  }

  const longTermActive = stage === "full";
  const longTermArtists = longTermActive
    ? affinityMap(input.longTerm.artists, input.now, DECAY.longHalfLifeDays)
    : new Map<string, number>();
  const longTermAlbums = longTermActive
    ? affinityMap(input.longTerm.albums, input.now, DECAY.longHalfLifeDays)
    : new Map<string, number>();
  const longTermTags = longTermActive
    ? affinityMap(input.longTerm.tags, input.now, DECAY.longHalfLifeDays)
    : new Map<string, number>();
  const topGenres = longTermActive ? [...input.longTerm.topGenres] : [];

  return {
    songs: new Map(input.songs.map((song) => [song.songId, song])),
    artists: new Map(input.artists.map((artist) => [artist.key, artist])),
    albums: new Map(input.albums.map((album) => [album.key, album])),
    mood,
    longTermArtists,
    longTermAlbums,
    longTermTags,
    topGenres,
    plays: input.longTermCount,
    stage,
  };
}
