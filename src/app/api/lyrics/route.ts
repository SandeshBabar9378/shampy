import { NextRequest, NextResponse } from "next/server";

interface LrclibResult {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  instrumental?: boolean;
  duration?: number;
  trackName?: string;
  artistName?: string;
}

interface KugouCandidate {
  id: string;
  accesskey: string;
  singer?: string;
  song?: string;
  duration?: number; // in milliseconds
  score?: number;
}



interface KugouSearchResponse {
  status: number;
  candidates?: KugouCandidate[];
}

interface KugouDownloadResponse {
  status: number;
  content?: string; // base64 encoded LRC
  fmt?: string;
}

interface CachedLyricsResult {
  syncedLyrics: string | null;
  plainLyrics: string | null;
  instrumental: boolean;
  expiresAt: number;
}

// In-memory cache per song: title + artist + duration
const lyricsCache = new Map<string, CachedLyricsResult>();

// Mutex / in-flight map to prevent parallel lookups for the same song
const inFlightRequests = new Map<string, Promise<NextResponse>>();

const LRCLIB_HEADERS: Record<string, string> = {
  "User-Agent": "Shubhu Music Player v1.0.0 (https://github.com/MetrolistGroup/Metrolist)",
};

const KUGOU_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s*\|.*$/g, " ")
    .replace(/\([^)]*(?:official|video|audio|remix|lyrics|visualizer)[^)]*\)/gi, " ")
    .replace(/\[[^\]]*(?:official|video|audio|remix|lyrics|visualizer)[^\]]*\]/gi, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripFeat(title: string): string {
  return title
    .replace(/\s*(?:feat\.?|ft\.?|featuring)\s.*$/i, " ")
    .replace(/\s+-\s+.*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanArtist(artist: string): string {
  return artist
    .replace(/\s*-\s*Topic\s*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface TitleArtistCandidate {
  title: string;
  artist: string;
  kind: "original" | "cleaned" | "cleaned_no_feat" | "cleaned_plus_artist" | "title_only";
}

function buildCandidates(rawTitle: string, rawArtist: string): TitleArtistCandidate[] {
  const originalTitle = rawTitle.trim();
  const cArtist = cleanArtist(rawArtist);
  const cTitle = cleanTitle(rawTitle);
  const cTitleNoFeat = stripFeat(cTitle);

  const list: TitleArtistCandidate[] = [];

  // 1. original
  if (originalTitle) {
    list.push({ title: originalTitle, artist: cArtist, kind: "original" });
  }

  // 2. cleaned
  if (cTitle && cTitle.toLowerCase() !== originalTitle.toLowerCase()) {
    list.push({ title: cTitle, artist: cArtist, kind: "cleaned" });
  }

  // Cleaned without feat for the second try
  if (cTitleNoFeat && cTitleNoFeat.toLowerCase() !== cTitle.toLowerCase()) {
    list.push({ title: cTitleNoFeat, artist: cArtist, kind: "cleaned_no_feat" });
  }

  // 3. cleaned plus artist only (search queries: title + artist)
  const baseTitleForArtist = cTitleNoFeat || cTitle || originalTitle;
  if (baseTitleForArtist && cArtist) {
    list.push({ title: baseTitleForArtist, artist: cArtist, kind: "cleaned_plus_artist" });
  }

  // 4. title only
  if (baseTitleForArtist) {
    list.push({ title: baseTitleForArtist, artist: "", kind: "title_only" });
  }

  // Deduplicate
  const seen = new Set<string>();
  const uniqueList: TitleArtistCandidate[] = [];
  for (const item of list) {
    const key = `${item.title.toLowerCase()}|${item.artist.toLowerCase()}|${item.kind}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueList.push(item);
    }
  }

  return uniqueList;
}

function matchesDuration(resultDurationSec: number | undefined, targetDurationSec: number): boolean {
  if (targetDurationSec <= 0) return true;
  if (typeof resultDurationSec !== "number" || resultDurationSec <= 0) return false;
  return Math.abs(resultDurationSec - targetDurationSec) <= 3;
}

function jsonFor(result: { syncedLyrics?: string | null; plainLyrics?: string | null; instrumental?: boolean } | null) {
  return {
    syncedLyrics: result?.syncedLyrics || null,
    plainLyrics: result?.plainLyrics || null,
    instrumental: result?.instrumental || false,
  };
}

async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T | null> {
  try {
    const response = await fetch(url, { headers, cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Searches and downloads synced LRC from Kugou
 */
async function fetchKugouLyrics(query: string, targetDurationSec: number): Promise<string | null> {
  try {
    const searchUrl = `http://lyrics.kugou.com/search?ver=1&man=yes&client=mobi&keyword=${encodeURIComponent(query)}`;
    const searchData = await fetchJson<KugouSearchResponse>(searchUrl, KUGOU_HEADERS);

    if (!searchData || searchData.status !== 200 || !Array.isArray(searchData.candidates) || searchData.candidates.length === 0) {
      return null;
    }

    // Filter candidates within ~3 seconds if duration is provided
    let candidate = searchData.candidates[0];
    if (targetDurationSec > 0) {
      const match = searchData.candidates.find((c) => {
        if (!c.duration) return false;
        const durSec = c.duration / 1000;
        return Math.abs(durSec - targetDurationSec) <= 3;
      });
      if (match) candidate = match;
    }

    if (!candidate.id || !candidate.accesskey) return null;

    const downloadUrl = `http://lyrics.kugou.com/download?ver=1&client=pc&id=${candidate.id}&accesskey=${candidate.accesskey}&fmt=lrc&charset=utf8`;
    const downloadData = await fetchJson<KugouDownloadResponse>(downloadUrl, KUGOU_HEADERS);

    if (!downloadData || downloadData.status !== 200 || !downloadData.content) {
      return null;
    }

    const decoded = Buffer.from(downloadData.content, "base64").toString("utf8");
    if (decoded && decoded.includes("[") && decoded.includes("]")) {
      return decoded;
    }

    return null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  let title = "";
  let artist = "";
  let album = "";
  let duration = "";
  try {
    const { searchParams } = new URL(req.url);
    title = searchParams.get("title") || "";
    artist = searchParams.get("artist") || "";
    album = searchParams.get("album") || "";
    duration = searchParams.get("duration") || "";
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      "digest" in e &&
      (e as { digest: string }).digest === "NEXT_PRERENDER_INTERRUPTED"
    ) {
      throw e;
    }
  }

  const cleanT = title.trim();
  const cleanA = artist.trim();
  const targetDuration = Number(duration) > 0 ? Math.round(Number(duration)) : 0;

  if (!cleanT && !cleanA) {
    return NextResponse.json({ error: "title or artist is required" }, { status: 400 });
  }

  // Cache key per song: title + artist + duration
  const cacheKey = `${cleanT.toLowerCase()}|${cleanA.toLowerCase()}|${targetDuration}`;

  // Check cache
  const cached = lyricsCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(jsonFor(cached));
  }

  // Check in-flight requests to avoid parallel requests for the same song
  const inFlight = inFlightRequests.get(cacheKey);
  if (inFlight) {
    return await inFlight;
  }

  const lookupPromise = (async () => {
    let tries = 0;
    let plainFallback: LrclibResult | null = null;
    const candidates = buildCandidates(cleanT, cleanA);

    // a. LRCLIB exact match (/api/get)
    for (const cand of candidates) {
      if (cand.kind === "title_only") continue;
      tries += 1;
      await sleep(300); // 300ms delay between LRCLIB calls
      const params = new URLSearchParams({
        track_name: cand.title,
        artist_name: cand.artist,
      });
      if (album.trim()) params.append("album_name", album.trim());
      if (targetDuration > 0) params.append("duration", targetDuration.toString());

      const data = await fetchJson<LrclibResult>(
        `https://lrclib.net/api/get?${params.toString()}`,
        LRCLIB_HEADERS
      );

      if (data?.syncedLyrics) {
        console.log(`[lyrics] source=lrclib-get synced=true tries=${tries}`);
        const result = jsonFor(data);
        lyricsCache.set(cacheKey, { ...result, expiresAt: now + 7 * 24 * 60 * 60 * 1000 });
        return NextResponse.json(result);
      }
      if (data?.plainLyrics && !plainFallback) {
        plainFallback = data;
      }
    }

    // b. LRCLIB search (/api/search)
    for (const cand of candidates) {
      tries += 1;
      await sleep(300); // 300ms delay between LRCLIB calls
      const query = cand.artist ? `${cand.title} ${cand.artist}`.trim() : cand.title.trim();
      const results = await fetchJson<LrclibResult[]>(
        `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`,
        LRCLIB_HEADERS
      );

      if (Array.isArray(results) && results.length > 0) {
        const synced = results.filter((r) => Boolean(r.syncedLyrics));
        const plain = results.filter((r) => Boolean(r.plainLyrics));

        // Prefer result with synced lyrics within ~3 seconds
        const chosenSynced =
          synced.find((r) => matchesDuration(r.duration, targetDuration)) ||
          (targetDuration > 0 ? undefined : synced[0]);

        if (chosenSynced) {
          console.log(`[lyrics] source=lrclib-search synced=true tries=${tries}`);
          const result = jsonFor(chosenSynced);
          lyricsCache.set(cacheKey, { ...result, expiresAt: now + 7 * 24 * 60 * 60 * 1000 });
          return NextResponse.json(result);
        }

        const chosenPlain =
          plain.find((r) => matchesDuration(r.duration, targetDuration)) ||
          (targetDuration > 0 ? undefined : plain[0]);

        if (chosenPlain && !plainFallback) {
          plainFallback = chosenPlain;
        }
      }
    }

    // c. Kugou synced lyrics
    for (const cand of candidates) {
      tries += 1;
      const query = cand.artist ? `${cand.title} ${cand.artist}`.trim() : cand.title.trim();
      const kugouLrc = await fetchKugouLyrics(query, targetDuration);
      if (kugouLrc) {
        console.log(`[lyrics] source=kugou synced=true tries=${tries}`);
        const result = { syncedLyrics: kugouLrc, plainLyrics: null, instrumental: false };
        lyricsCache.set(cacheKey, { ...result, expiresAt: now + 7 * 24 * 60 * 60 * 1000 });
        return NextResponse.json(result);
      }
    }

    // d. LRCLIB plainLyrics fallback
    if (plainFallback?.plainLyrics) {
      console.log(`[lyrics] source=plain synced=false tries=${tries}`);
      const result = jsonFor(plainFallback);
      lyricsCache.set(cacheKey, { ...result, expiresAt: now + 7 * 24 * 60 * 60 * 1000 });
      return NextResponse.json(result);
    }

    // Not found: cache for 1 hour
    console.log(`[lyrics] source=none synced=false tries=${tries}`);
    const emptyResult = jsonFor(null);
    lyricsCache.set(cacheKey, { ...emptyResult, expiresAt: now + 60 * 60 * 1000 });
    return NextResponse.json(emptyResult);
  })();

  inFlightRequests.set(cacheKey, lookupPromise);
  try {
    return await lookupPromise;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

