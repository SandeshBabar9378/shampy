import { SIMILARITY_WEIGHTS } from "./config";
import type { TrackFeature } from "./types";

const DAY_MS = 86_400_000;
/** Same rule as src/lib/videoId.ts, duplicated so this module stays pure. */
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Only playable tracks may ever reach recommendations or the queue. */
export function isPlayableFeature(feature: TrackFeature | null | undefined): feature is TrackFeature {
  return Boolean(feature && feature.youtubeId && VIDEO_ID_RE.test(feature.youtubeId));
}

export function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** 0.5 ^ (daysAgo / halfLife). Null timestamps decay to zero. */
export function decayFactor(now: number, at: number | null, halfLifeDays: number): number {
  if (at === null || !Number.isFinite(at)) return 0;
  const days = Math.max(0, (now - at) / DAY_MS);
  return Math.pow(0.5, days / halfLifeDays);
}

export function daysAgo(now: number, at: number | null): number {
  if (at === null || !Number.isFinite(at)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now - at) / DAY_MS);
}

export function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** "Arijit Singh & Pritam" / "Diljit Dosanjh feat. Sia" -> "arijit singh" / "diljit dosanjh". */
const CREDIT_SPLIT = / & |,| feat\.| ft\.| with /i;

export function artistKey(artist: string): string {
  if (!artist) return "";
  const first = artist.split(CREDIT_SPLIT)[0] ?? "";
  return stripDiacritics(first).toLowerCase().replace(/\s+/g, " ").trim();
}

/** Album keys drop "(Deluxe Edition)" style suffixes so reissues group. */
export function albumKey(album: string): string {
  if (!album) return "";
  const base = album.replace(/[([{][^)\]}]*[)\]}]/g, " ");
  return stripDiacritics(base)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tags only ever come from real metadata; unknown fields contribute nothing. */
export function tagsOf(feature: TrackFeature): string[] {
  const tags: string[] = [];
  if (feature.genre && feature.genre.trim()) tags.push(`genre:${feature.genre.trim().toLowerCase()}`);
  if (feature.language && feature.language.trim()) tags.push(`lang:${feature.language.trim().toLowerCase()}`);
  return tags;
}

/** Jaccard over real tags, or null when either side has none (term is dropped). */
export function sharedTags(a: TrackFeature, b: TrackFeature): number | null {
  const tagsA = tagsOf(a);
  const tagsB = tagsOf(b);
  if (tagsA.length === 0 || tagsB.length === 0) return null;
  const setB = new Set(tagsB);
  let shared = 0;
  for (const tag of tagsA) if (setB.has(tag)) shared += 1;
  const union = new Set([...tagsA, ...tagsB]).size;
  if (union === 0) return null;
  return shared / union;
}

/**
 * Weighted similarity with NULL renormalization: a term whose inputs are
 * unknown is removed and the remaining weights are rescaled to sum to 1, so
 * "we do not know the genre" never reads as "different genre".
 */
export function trackSimilarity(
  seed: TrackFeature,
  candidate: TrackFeature,
  coListen: number | null,
): number {
  const terms: { weight: number; value: number }[] = [];

  if (coListen !== null && Number.isFinite(coListen)) {
    terms.push({ weight: SIMILARITY_WEIGHTS.coListen, value: clamp01(coListen) });
  }
  if (seed.artistKey && candidate.artistKey) {
    terms.push({
      weight: SIMILARITY_WEIGHTS.sameArtist,
      value: seed.artistKey === candidate.artistKey ? 1 : 0,
    });
  }
  if (seed.albumKey && candidate.albumKey) {
    terms.push({
      weight: SIMILARITY_WEIGHTS.sameAlbum,
      value: seed.albumKey === candidate.albumKey ? 1 : 0,
    });
  }
  const tagSimilarity = sharedTags(seed, candidate);
  if (tagSimilarity !== null) {
    terms.push({ weight: SIMILARITY_WEIGHTS.sharedTags, value: tagSimilarity });
  }

  const totalWeight = terms.reduce((sum, term) => sum + term.weight, 0);
  if (totalWeight <= 0) return 0;
  const weighted = terms.reduce((sum, term) => sum + term.weight * term.value, 0);
  return clamp01(weighted / totalWeight);
}

/**
 * Small LRU-ish cache for the expensive double loop in MMR selection.
 * "Cache top pairs per song" in the spec; a bounded map is enough here.
 */
export class SimilarityCache {
  private readonly pairs = new Map<string, number>();

  constructor(private readonly maxEntries = 20_000) {}

  private static key(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  get(a: string, b: string): number | null {
    return this.pairs.get(SimilarityCache.key(a, b)) ?? null;
  }

  set(a: string, b: string, value: number): void {
    if (this.pairs.size >= this.maxEntries) this.pairs.clear();
    this.pairs.set(SimilarityCache.key(a, b), value);
  }

  similarity(seed: TrackFeature, candidate: TrackFeature, coListen: number | null): number {
    const cached = this.get(seed.songId, candidate.songId);
    if (cached !== null) return cached;
    const value = trackSimilarity(seed, candidate, coListen);
    this.set(seed.songId, candidate.songId, value);
    return value;
  }
}
