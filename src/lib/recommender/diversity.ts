import { BUCKET_MIX, BUCKETS, REFRESH, SELECTION, type Bucket } from "./config";
import type { BuiltProfile } from "./profile";
import { scoreCandidate } from "./score";
import { SimilarityCache, clamp01, daysAgo } from "./similar";
import type { NegativeEvidence, SongStats, TrackFeature } from "./types";

export interface RankableCandidate {
  feature: TrackFeature;
  stats: SongStats | null;
  negative: NegativeEvidence;
}

export interface RankedPick {
  feature: TrackFeature;
  stats: SongStats | null;
  bucket: Bucket;
  score: number;
}

export interface RankOptions {
  candidates: RankableCandidate[];
  profile: BuiltProfile;
  seed?: TrackFeature | null;
  now: number;
  limit: number;
  coListen?: (a: string, b: string) => number | null;
  exclude?: (songId: string) => boolean;
}

export interface RankResult {
  picks: RankedPick[];
  buckets: Record<Bucket, number>;
}

/**
 * familiar: played before, not in the last week.
 * related: at most 2 plays and tied to a known artist/genre.
 * experimental: unseen artist outside the top genres.
 */
export function candidateBucket(
  feature: TrackFeature,
  stats: SongStats | null,
  profile: BuiltProfile,
  now: number,
): Bucket {
  const plays = stats?.plays ?? 0;
  const recentlyPlayed = daysAgo(now, stats?.lastPlayedAt ?? null) < REFRESH.recentPlayDays;

  if (plays > 0 && !recentlyPlayed) return "familiar";

  const artistPlays = profile.artists.get(feature.artistKey)?.plays ?? 0;
  const genre = feature.genre ? feature.genre.trim().toLowerCase() : null;
  const inTopGenres = genre !== null && profile.topGenres.includes(genre);
  const tagAffinity = genre !== null && (profile.longTermTags.get(`genre:${genre}`) ?? 0) > 0;

  if (plays <= 2 && (artistPlays > 0 || inTopGenres || tagAffinity)) return "related";
  if (artistPlays === 0 && !inTopGenres) return "experimental";
  return "related";
}

/** Selection-time quotas: 65% familiar / 25% related / 10% experimental. */
export function bucketQuotas(limit: number): Record<Bucket, number> {
  const familiar = Math.round(limit * BUCKET_MIX.familiar);
  const related = Math.round(limit * BUCKET_MIX.related);
  return {
    familiar,
    related,
    experimental: Math.max(0, limit - familiar - related),
  };
}

/**
 * Greedy MMR selection with hard diversity caps.
 * Quotas decide which buckets may be picked; they never alter a score.
 */
export function rankCandidates(options: RankOptions): RankResult {
  const limit = Math.max(0, Math.floor(options.limit));
  const exclude = options.exclude ?? (() => false);
  const coListen = options.coListen ?? (() => null);
  const cache = new SimilarityCache();
  const quotas = bucketQuotas(limit);
  const buckets: Record<Bucket, number> = { familiar: 0, related: 0, experimental: 0 };

  const seen = new Set<string>();
  const seenVideos = new Set<string>();
  const pool: RankableCandidate[] = [];
  for (const candidate of options.candidates) {
    const id = candidate.feature.songId;
    if (!id || seen.has(id) || exclude(id)) continue;
    // The same recording can arrive with a catalog id and with its raw
    // YouTube id; never offer it twice.
    const videoId = candidate.feature.youtubeId;
    if (videoId) {
      if (seenVideos.has(videoId)) continue;
      seenVideos.add(videoId);
    }
    seen.add(id);
    pool.push(candidate);
  }

  const picks: RankedPick[] = [];
  const remaining = [...pool];

  const hardCapsAllow = (feature: TrackFeature): boolean => {
    const window = picks.slice(-SELECTION.window);
    if (feature.artistKey) {
      const sameArtist = window.filter((pick) => pick.feature.artistKey === feature.artistKey).length;
      if (sameArtist >= SELECTION.perArtistCap) return false;
    }
    if (feature.genre) {
      const genre = feature.genre.trim().toLowerCase();
      const sameGenre = window.filter(
        (pick) => pick.feature.genre?.trim().toLowerCase() === genre,
      ).length;
      if (sameGenre >= SELECTION.perGenreCap) return false;
    }
    return true;
  };

  const maxSimilarityToPicks = (feature: TrackFeature): number => {
    let max = 0;
    for (const pick of picks) {
      const value = cache.similarity(feature, pick.feature, coListen(feature.songId, pick.feature.songId));
      if (value > max) max = value;
    }
    return max;
  };

  const bestPick = (respectQuota: boolean): { index: number; pick: RankedPick } | null => {
    const eligible: { index: number; bucket: Bucket; score: number; maxSim: number }[] = [];

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      if (!hardCapsAllow(candidate.feature)) continue;
      const bucket = candidateBucket(candidate.feature, candidate.stats, options.profile, options.now);
      if (respectQuota && buckets[bucket] >= quotas[bucket]) continue;

      const sameArtistInSlate = picks.some(
        (pick) => pick.feature.artistKey === candidate.feature.artistKey && candidate.feature.artistKey !== "",
      );
      const { score } = scoreCandidate({
        stats: candidate.stats,
        feature: candidate.feature,
        profile: options.profile,
        seed: options.seed ?? null,
        coListen: coListen(candidate.feature.songId, options.seed?.songId ?? ""),
        sameArtistInSlate,
        negative: candidate.negative,
        now: options.now,
      });

      eligible.push({ index, bucket, score, maxSim: maxSimilarityToPicks(candidate.feature) });
    }

    if (eligible.length === 0) return null;

    // Never fill a slot with a net-negative candidate. If every remaining
    // option is negative, stop: the caller serves its safer fallback instead.
    const positive = eligible.filter((row) => row.score > 0);
    if (positive.length === 0) return null;
    const pool = positive;

    const maxScore = Math.max(...pool.map((row) => row.score));
    let bestIndex = -1;
    let bestValue = Number.NEGATIVE_INFINITY;
    let bestBucket: Bucket = "related";
    let bestScore = 0;
    let bestSongId = "";

    for (const row of pool) {
      const normalized = maxScore > 0 ? clamp01(row.score / maxScore) : 0;
      const value = SELECTION.selfWeight * normalized - SELECTION.diversityWeight * row.maxSim;
      const candidate = remaining[row.index];
      const isBetter =
        bestIndex === -1 ||
        value > bestValue ||
        (value === bestValue && candidate.feature.songId < bestSongId);
      if (isBetter) {
        bestIndex = row.index;
        bestValue = value;
        bestBucket = row.bucket;
        bestScore = row.score;
        bestSongId = candidate.feature.songId;
      }
    }

    if (bestIndex === -1) return null;
    const chosen = remaining[bestIndex];
    return {
      index: bestIndex,
      pick: {
        feature: chosen.feature,
        stats: chosen.stats,
        bucket: bestBucket,
        score: bestScore,
      },
    };
  };

  while (picks.length < limit && remaining.length > 0) {
    const chosen = bestPick(true) ?? bestPick(false);
    if (!chosen) break;
    picks.push(chosen.pick);
    buckets[chosen.pick.bucket] += 1;
    remaining.splice(chosen.index, 1);
  }

  return { picks, buckets };
}

export function bucketOrder(): readonly Bucket[] {
  return BUCKETS;
}
