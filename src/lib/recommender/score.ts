import {
  DECAY,
  LISTEN_QUALITY,
  MOOD_MAX_SHARE,
  NEGATIVE_WEIGHTS,
  QUEUE_WEIGHTS,
  REFRESH,
  REPETITION_WEIGHTS,
  SCORE_WEIGHTS,
} from "./config";
import type { BuiltProfile } from "./profile";
import { clamp01, daysAgo, decayFactor, trackSimilarity } from "./similar";
import type { NegativeEvidence, SongStats, TrackFeature } from "./types";

export interface ScoreParts {
  affinityLong: number;
  affinityMood: number;
  /** Long-term artist / album / tag affinity (0 when the profile is immature). */
  profileAffinity: number;
  /** Weighted mood term after the 45% cap (what actually entered the score). */
  moodContribution: number;
  similarity: number;
  completionRate: number;
  replayRate: number;
  playlistAffinity: number;
  discoveryBonus: number;
  repetitionPenalty: number;
  negativeEvidence: number;
  positive: number;
  total: number;
}

export function affinityLong(stats: SongStats | null, now: number): number {
  if (!stats || stats.plays <= 0) return 0;
  const averageQuality = stats.qualitySum / stats.plays;
  const recency = decayFactor(now, stats.lastPlayedAt, DECAY.longHalfLifeDays);
  return clamp01((averageQuality / LISTEN_QUALITY.complete) * recency);
}

export function completionRate(stats: SongStats | null): number {
  if (!stats || stats.plays <= 0) return 0;
  return clamp01(stats.completions / Math.max(1, stats.plays));
}

export function replayRate(stats: SongStats | null): number {
  if (!stats || stats.plays <= 0) return 0;
  return clamp01(stats.replays / Math.max(1, stats.plays));
}

export function playlistAffinity(stats: SongStats | null): number {
  if (!stats || stats.plays <= 0) return 0;
  return clamp01((stats.likes + stats.playlistAdds) / Math.max(1, stats.plays));
}

/** Unplayed songs are the discovery pool; more plays means less novelty value. */
export function discoveryBonus(stats: SongStats | null): number {
  const plays = stats?.plays ?? 0;
  return clamp01(1 / (1 + Math.max(0, plays)));
}

/**
 * Long-term taste beyond a single song: how strongly the user likes this
 * artist / album / genre-language tags. Terms whose metadata is missing are
 * dropped and the remaining weights renormalized, exactly like trackSimilarity,
 * so unknown tags never read as a mismatch.
 *
 * `map`s are empty unless the profile reached the "full" stage, so immature
 * profiles contribute nothing here.
 */
export function profileAffinity(feature: TrackFeature, profile: BuiltProfile): number {
  const terms: { weight: number; value: number }[] = [];

  if (feature.artistKey) {
    const value = profile.longTermArtists.get(feature.artistKey);
    if (value !== undefined) terms.push({ weight: 0.5, value });
  }
  if (feature.albumKey) {
    const value = profile.longTermAlbums.get(feature.albumKey);
    if (value !== undefined) terms.push({ weight: 0.25, value });
  }

  const tagValues: number[] = [];
  if (feature.genre) {
    const value = profile.longTermTags.get(`genre:${feature.genre.trim().toLowerCase()}`);
    if (value !== undefined) tagValues.push(value);
  }
  if (feature.language) {
    const value = profile.longTermTags.get(`lang:${feature.language.trim().toLowerCase()}`);
    if (value !== undefined) tagValues.push(value);
  }
  if (tagValues.length > 0) {
    terms.push({
      weight: 0.25,
      value: tagValues.reduce((sum, value) => sum + value, 0) / tagValues.length,
    });
  }

  const totalWeight = terms.reduce((sum, term) => sum + term.weight, 0);
  if (totalWeight <= 0) return 0;
  return clamp01(terms.reduce((sum, term) => sum + term.weight * term.value, 0) / totalWeight);
}

export function repetitionPenaltyInput(input: {
  stats: SongStats | null;
  sameArtistInSlate: boolean;
  now: number;
}): number {
  const playedRecently =
    input.stats && daysAgo(input.now, input.stats.lastPlayedAt) < REFRESH.recentPlayDays ? 1 : 0;
  const recommendedRecently =
    input.stats &&
    input.stats.timesRecommended > 0 &&
    daysAgo(input.now, input.stats.lastRecommendedAt) < REFRESH.recentPlayDays
      ? 1
      : 0;
  return (
    REPETITION_WEIGHTS.playedRecently * playedRecently +
    REPETITION_WEIGHTS.sameArtistInSlate * (input.sameArtistInSlate ? 1 : 0) +
    REPETITION_WEIGHTS.recommendedRecently * recommendedRecently
  );
}

/**
 * fastSkips (30d) - 0.5 * completions (30d), only once the raw value reaches 2.
 * A single fast skip therefore never lowers a score, and the 30-day window
 * makes an old skip fade out instead of banning the song forever.
 */
export function negativeEvidence(evidence: NegativeEvidence): number {
  const raw =
    NEGATIVE_WEIGHTS.fastSkip * Math.max(0, evidence.fastSkips) -
    NEGATIVE_WEIGHTS.completion * Math.max(0, evidence.completions);
  if (raw < REFRESH.negativeMin) return 0;
  return clamp01(raw / (REFRESH.negativeMin * 2));
}

export interface ScoreInput {
  stats: SongStats | null;
  feature: TrackFeature;
  profile: BuiltProfile;
  seed: TrackFeature | null;
  coListen: number | null;
  sameArtistInSlate: boolean;
  negative: NegativeEvidence;
  now: number;
}

/**
 * Full score. Every term is normalized 0..1 before weighting; the mood term is
 * capped at 45% of the positive score; stage gates keep long-term affinity off
 * until the profile is old enough.
 */
export function scoreCandidate(input: ScoreInput): { score: number; parts: ScoreParts } {
  const stage = input.profile.stage;
  const useMood = stage === "mood" || stage === "full";
  const useLongTerm = stage === "full";

  const longTerm = useLongTerm ? affinityLong(input.stats, input.now) : 0;
  const mood = useMood ? (input.profile.mood.get(input.feature.songId) ?? 0) : 0;
  const profileTerm = useLongTerm ? profileAffinity(input.feature, input.profile) : 0;
  const similarity = input.seed
    ? trackSimilarity(input.seed, input.feature, input.coListen)
    : 0;
  const completion = completionRate(input.stats);
  const replay = replayRate(input.stats);
  const playlist = playlistAffinity(input.stats);
  const discovery = discoveryBonus(input.stats);

  const rest =
    SCORE_WEIGHTS.affinityLong * longTerm +
    SCORE_WEIGHTS.profileAffinity * profileTerm +
    SCORE_WEIGHTS.similarity * similarity +
    SCORE_WEIGHTS.completionRate * completion +
    SCORE_WEIGHTS.replayRate * replay +
    SCORE_WEIGHTS.playlistAffinity * playlist +
    SCORE_WEIGHTS.discoveryBonus * discovery;

  let moodTerm = SCORE_WEIGHTS.affinityMood * mood;
  // Mood may own at most 45% of the *final* positive score, so the cap is
  // solved against the non-mood remainder: mood <= s/(1-s) * rest.
  const moodCap = (MOOD_MAX_SHARE / (1 - MOOD_MAX_SHARE)) * rest;
  if (moodTerm > moodCap) moodTerm = moodCap;

  const positive = rest + moodTerm;
  const repetition = repetitionPenaltyInput({
    stats: input.stats,
    sameArtistInSlate: input.sameArtistInSlate,
    now: input.now,
  });
  const negative = negativeEvidence(input.negative);

  const penalty = SCORE_WEIGHTS.repetitionPenalty * repetition;
  const negativeTerm = SCORE_WEIGHTS.negativeEvidence * negative;

  return {
    score: positive - penalty - negativeTerm,
    parts: {
      affinityLong: longTerm,
      affinityMood: mood,
      profileAffinity: profileTerm,
      moodContribution: moodTerm,
      similarity,
      completionRate: completion,
      replayRate: replay,
      playlistAffinity: playlist,
      discoveryBonus: discovery,
      repetitionPenalty: repetition,
      negativeEvidence: negative,
      positive,
      total: positive - penalty - negativeTerm,
    },
  };
}

export interface QueueScoreInput {
  stats: SongStats | null;
  feature: TrackFeature;
  profile: BuiltProfile;
  seed: TrackFeature | null;
  coListen: number | null;
  inQueue: boolean;
  playedInLast3: boolean;
  now: number;
}

/** Queue selection is current-track-driven; no bucket quotas here. */
export function queueScore(input: QueueScoreInput): number {
  const similarity = input.seed
    ? trackSimilarity(input.seed, input.feature, input.coListen)
    : 0;
  const mood = input.profile.mood.get(input.feature.songId) ?? 0;
  const longTerm = affinityLong(input.stats, input.now);
  const profileTerm = profileAffinity(input.feature, input.profile);

  return (
    QUEUE_WEIGHTS.similarity * similarity +
    QUEUE_WEIGHTS.mood * mood +
    QUEUE_WEIGHTS.longTerm * longTerm +
    QUEUE_WEIGHTS.profileAffinity * profileTerm +
    QUEUE_WEIGHTS.discovery * discoveryBonus(input.stats) -
    QUEUE_WEIGHTS.alreadyInQueue * (input.inQueue ? 1 : 0) -
    QUEUE_WEIGHTS.playedInLast3 * (input.playedInLast3 ? 1 : 0)
  );
}
