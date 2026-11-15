export interface LyricLine {
  time: number; // in seconds
  text: string;
}

/**
 * Parses LRC format text ([mm:ss.xx] or [mm:ss.xxx]) into sorted LyricLine array
 */
export function parseLRC(lrcText: string): LyricLine[] {
  if (!lrcText || typeof lrcText !== "string") return [];

  const lines = lrcText.split("\n");
  const result: LyricLine[] = [];
  const timeRegex = /\[(\d{2,}):(\d{2})(?:\.(\d{2,3}))?\]/g;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Reset regex index
    timeRegex.lastIndex = 0;
    const matches: { time: number }[] = [];
    let match: RegExpExecArray | null;

    while ((match = timeRegex.exec(trimmed)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      let ms = 0;
      if (match[3]) {
        ms = match[3].length === 2 ? parseInt(match[3], 10) * 10 : parseInt(match[3], 10);
      }
      const timeInSec = minutes * 60 + seconds + ms / 1000;
      matches.push({ time: timeInSec });
    }

    if (matches.length > 0) {
      // Strip all time tags to get text
      const cleanText = trimmed.replace(/\[\d{2,}:\d{2}(?:\.\d{2,3})?\]/g, "").trim();
      for (const m of matches) {
        result.push({
          time: m.time,
          text: cleanText,
        });
      }
    }
  }

  // Sort ascending by timestamp
  result.sort((a, b) => a.time - b.time);
  return result;
}

/**
 * Fetches synced lyrics from our internal API route /api/lyrics (which queries LRCLIB)
 */
export async function fetchSyncedLyrics(
  title: string,
  artist: string,
  durationSec?: number,
  album?: string
): Promise<{ lines: LyricLine[]; plainText: string | null; instrumental: boolean }> {
  try {
    const params = new URLSearchParams({
      title: title.trim(),
      artist: artist.trim(),
    });
    if (album && album.trim()) params.append("album", album.trim());
    if (durationSec && durationSec > 0) {
      params.append("duration", Math.round(durationSec).toString());
    }

    const res = await fetch(`/api/lyrics?${params.toString()}`);
    if (!res.ok) {
      return { lines: [], plainText: null, instrumental: false };
    }

    const data = await res.json();
    if (data.syncedLyrics) {
      const lines = parseLRC(data.syncedLyrics);
      return { lines, plainText: data.plainLyrics || null, instrumental: data.instrumental || false };
    }

    if (data.plainLyrics) {
      return { lines: [], plainText: data.plainLyrics, instrumental: data.instrumental || false };
    }

    return { lines: [], plainText: null, instrumental: data.instrumental || false };
  } catch (error) {
    console.error("fetchSyncedLyrics error:", error);
    return { lines: [], plainText: null, instrumental: false };
  }
}
