/**
 * Every tunable number of the recommendation engine.
 *
 * Keep the numbers here so behaviour can be reviewed and tested without
 * reading the maths in score.ts / diversity.ts.
 */

export const LISTEN_QUALITY = {
  /** Below this fraction of the track counts as a fast skip. */
  fastMax: 0.1,
  /** Between fastMax and midMax counts as a late skip. */
  midMax: 0.5,
  /** Above this fraction a play is treated as near-complete. */
  lateMax: 0.85,
  fast: 0,
  mid: 0.15,
  late: 0.45,
  nearComplete: 1,
  complete: 1.2,
  /** Neutral value when the duration is unknown. */
  unknown: 0.45,
  replayStep: 0.5,
  replayCap: 2,
  maxReplaysCounted: 2,
  /** A play shorter than this is a fast skip even if the track is very short. */
  fastSkipSeconds: 30,
} as const;

export const DECAY = {
  /** Aggregates keep their long-term memory for two months. */
  longHalfLifeDays: 60,
  /** Mood forgets in days, not months. */
  moodHalfLifeDays: 3,
  /** Negative evidence window / decay. */
  negativeHalfLifeDays: 30,
} as const;

export const PROFILE = {
  moodMaxPlays: 50,
  moodMaxDays: 7,
  /** Long-term JSON stays inactive below this many closed plays. */
  longTermMinPlays: 20,
  /** At or below this many plays only similarity is used. */
  similarityOnlyMaxPlays: 5,
} as const;

export const SIMILARITY_WEIGHTS = {
  coListen: 0.45,
  sameArtist: 0.25,
  sameAlbum: 0.15,
  sharedTags: 0.15,
} as const;

export const BUCKET_MIX = {
  familiar: 0.65,
  related: 0.25,
  experimental: 0.1,
} as const;

export const BUCKETS = ["familiar", "related", "experimental"] as const;
export type Bucket = (typeof BUCKETS)[number];

export const SCORE_WEIGHTS = {
  affinityLong: 1.6,
  /** Long-term artist / album / genre-language affinity from long_term_json. */
  profileAffinity: 0.9,
  affinityMood: 2,
  similarity: 1.4,
  completionRate: 0.8,
  replayRate: 0.5,
  playlistAffinity: 0.6,
  discoveryBonus: 0.4,
  repetitionPenalty: 1.2,
  negativeEvidence: 0.9,
} as const;

export const REPETITION_WEIGHTS = {
  playedRecently: 0.5,
  sameArtistInSlate: 0.3,
  recommendedRecently: 0.2,
} as const;

export const NEGATIVE_WEIGHTS = {
  fastSkip: 1,
  completion: 0.5,
} as const;

/** Mood may never own more than this share of the positive score. */
export const MOOD_MAX_SHARE = 0.45;

export const SELECTION = {
  /** Greedy MMR: 0.7 * score - 0.3 * similarity to what is already picked. */
  selfWeight: 0.7,
  diversityWeight: 0.3,
  perArtistCap: 2,
  perGenreCap: 6,
  /** The caps are enforced inside a sliding window of this many picks. */
  window: 20,
  candidateCap: 300,
} as const;

export const QUEUE_WEIGHTS = {
  similarity: 2.2,
  mood: 1,
  longTerm: 0.8,
  profileAffinity: 0.6,
  discovery: 0.5,
  alreadyInQueue: 2,
  playedInLast3: 1.5,
} as const;

export const REFRESH = {
  /** Rebuild a cached section only after this many new signals... */
  signalDelta: 3,
  /** ...spread across at least this many distinct tracks. */
  signalDistinctTracks: 2,
  sessionMinutes: 30,
  /** Recommended this many times without a play -> temporary exclusion. */
  exclusionRecommendations: 3,
  exclusionDays: 14,
  negativeWindowDays: 30,
  /** Negative evidence only applies at or above this raw value. */
  negativeMin: 2,
  recentPlayDays: 7,
} as const;

export const LIMITS = {
  default: 20,
  max: 50,
  queueDefault: 12,
  /** Smart Queue never puts more than this many songs by one artist in a batch. */
  queuePerArtist: 2,
} as const;

/** Raw events are irrelevant after six half-lives; the aggregates keep memory. */
export const EVENT_RETENTION_DAYS = 180;
