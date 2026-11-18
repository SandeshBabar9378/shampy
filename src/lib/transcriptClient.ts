import { buildFallbackTranscripts, isValidTranscriptList } from "@/lib/transcript";

/**
 * Shared client helpers for the Roman transcript feature.
 *
 * These deliberately use the exact same endpoint and cache key as the
 * full-screen (laptop) lyrics view, so a transcript fetched in one place is
 * immediately available in the other. No separate transcription engine.
 */
const cacheKey = (songId: string) => `lyrics-roman-v2_${songId}`;

function readCache(songId: string, lines: string[]): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const cached = localStorage.getItem(cacheKey(songId));
    if (!cached) return null;
    const parsed: unknown = JSON.parse(cached);
    if (isValidTranscriptList(lines, parsed)) return parsed;
    localStorage.removeItem(cacheKey(songId));
  } catch {
    // Ignore malformed or unavailable storage.
  }
  return null;
}

export async function loadTranscripts(
  songId: string,
  lines: string[],
): Promise<{ transcriptions: string[] | null; disabled: boolean }> {
  const cached = readCache(songId, lines);
  if (cached) return { transcriptions: cached, disabled: false };

  try {
    const res = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId, lines }),
    });
    const data: { transcriptions?: unknown; error?: string } | null = res.ok
      ? await res.json()
      : null;

    if (data?.error === "transcription disabled: no API key") {
      return { transcriptions: null, disabled: true };
    }

    if (isValidTranscriptList(lines, data?.transcriptions)) {
      try {
        localStorage.setItem(cacheKey(songId), JSON.stringify(data.transcriptions));
      } catch {
        // Ignore storage quota errors.
      }
      return { transcriptions: data.transcriptions, disabled: false };
    }
  } catch {
    // Fall through to the local Latin fallback below.
  }

  return { transcriptions: buildFallbackTranscripts(lines), disabled: false };
}
