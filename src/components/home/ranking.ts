import type { Track } from "@/lib/types";

/** Stable identity across history and API rows for the same recording. */
export function trackKey(track: Track): string {
  return track.youtubeId || track.id;
}

/**
 * Real play-count ranking first (signed-in users), with a small boost for
 * recently played tracks. Guests only have the local history, so recency is
 * their ranking signal. No play count is ever fabricated.
 */
export function rankTopTracks(
  history: Track[],
  recents: Track[],
  mostPlayed: Track[],
  limit = 8,
): Track[] {
  const recentIndex = new Map(recents.map((track, index) => [trackKey(track), index]));
  const historyIndex = new Map(history.map((track, index) => [trackKey(track), index]));
  const seen = new Set<string>();
  const pool = mostPlayed.length > 0 ? mostPlayed : history;

  return pool
    .map((track, index) => {
      const key = trackKey(track);
      const rankScore = mostPlayed.length > 0 ? mostPlayed.length - index : 0;
      const recentRank = recentIndex.get(key);
      const recentBoost = recentRank === undefined ? 0 : (recents.length - recentRank) * 0.15;
      const historyRank = historyIndex.get(key);
      const historyBoost = historyRank === undefined ? 0 : (history.length - historyRank) * 0.02;
      return { track, key, score: rankScore + recentBoost + historyBoost };
    })
    .filter(({ key }) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ track }) => track);
}
