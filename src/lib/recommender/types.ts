/** Plain data types shared by the pure recommender modules (no DB, no React). */

export interface TrackFeature {
  songId: string;
  youtubeId: string | null;
  title: string;
  artist: string;
  artistKey: string;
  album: string;
  albumKey: string;
  coverUrl: string;
  /** Only ever filled from a real source; null means "unknown", not "none". */
  genre: string | null;
  language: string | null;
  duration: number;
}

export interface SongStats {
  songId: string;
  plays: number;
  qualitySum: number;
  completions: number;
  fastSkips: number;
  lateSkips: number;
  replays: number;
  likes: number;
  playlistAdds: number;
  lastPlayedAt: number | null;
  timesRecommended: number;
  timesRecommendedIgnored: number;
  lastRecommendedAt: number | null;
}

/** artist_stats / album_stats rows: the same counters keyed by a name key. */
export interface KeyStats {
  key: string;
  plays: number;
  qualitySum: number;
  completions: number;
  fastSkips: number;
  lateSkips: number;
  likes: number;
  playlistAdds: number;
  lastPlayedAt: number | null;
  timesRecommended: number;
  timesRecommendedIgnored: number;
}

/** One song's recent listening weight. `q` is the sum of play qualities. */
export interface MoodEntry {
  q: number;
  n: number;
  /** Epoch ms of the most recent play. */
  t: number;
}

export type MoodJson = Record<string, MoodEntry>;

export interface AffinityEntry {
  q: number;
  n: number;
  t: number;
}

/** Long-term taste is stored separately from mood, and only from 20 plays on. */
export interface LongTermJson {
  artists: Record<string, AffinityEntry>;
  albums: Record<string, AffinityEntry>;
  tags: Record<string, AffinityEntry>;
  topGenres: string[];
  plays: number;
}

export function emptyLongTerm(): LongTermJson {
  return { artists: {}, albums: {}, tags: {}, topGenres: [], plays: 0 };
}

export type PlayEventKind =
  | "play"
  | "complete"
  | "skip"
  | "like"
  | "unlike"
  | "playlist_add";

export interface PlayClassification {
  quality: number;
  /** Fraction of the track that was heard; null when the duration is unknown. */
  pct: number | null;
  isFastSkip: boolean;
  isLateSkip: boolean;
  isComplete: boolean;
  /** Unknown durations are excluded from completion-rate denominators. */
  countsForCompletion: boolean;
}

export interface NegativeEvidence {
  fastSkips: number;
  completions: number;
}
