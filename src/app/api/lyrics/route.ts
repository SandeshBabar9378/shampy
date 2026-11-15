import { NextRequest, NextResponse } from "next/server";

interface LrclibResult {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  instrumental?: boolean;
  duration?: number;
  trackName?: string;
  artistName?: string;
}

const LRCLIB_HEADERS: Record<string, string> = {
  "User-Agent": "Shubhu Music Player v1.0.0 (https://github.com/MetrolistGroup/Metrolist)",
};

function stripBrackets(value: string): string {
  return value
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripFeatAndSuffix(value: string): string {
  return value
    .replace(/\s*(?:feat\.?|ft\.?|featuring)\s.*$/i, " ")
    .replace(/\s*\|.*$/g, " ")
    .replace(/\s+-\s+.*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleVariants(title: string): string[] {
  const variants = [
    title.trim(),
    stripBrackets(title),
    stripFeatAndSuffix(title),
    stripFeatAndSuffix(stripBrackets(title)),
  ];
  return variants.filter((value, index) => value.length > 0 && variants.indexOf(value) === index);
}

function matchesDuration(result: LrclibResult, targetSeconds: number): boolean {
  if (targetSeconds <= 0) return true;
  if (typeof result.duration !== "number" || result.duration <= 0) return false;
  return Math.abs(result.duration - targetSeconds) <= 3;
}

function jsonFor(result: LrclibResult | null) {
  return {
    syncedLyrics: result?.syncedLyrics || null,
    plainLyrics: result?.plainLyrics || null,
    instrumental: result?.instrumental || false,
  };
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, { headers: LRCLIB_HEADERS, cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
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

  try {
    if (!title.trim() && !artist.trim()) {
      return NextResponse.json({ error: "title or artist is required" }, { status: 400 });
    }

    const targetDuration = Number(duration) > 0 ? Math.round(Number(duration)) : 0;
    const variants = titleVariants(title);
    let tries = 0;
    let plainFallback: LrclibResult | null = null;

    // 1. LRCLIB exact match (/api/get) for each title variant.
    for (const variant of variants) {
      tries += 1;
      const params = new URLSearchParams({
        track_name: variant,
        artist_name: artist,
      });
      if (album.trim()) params.append("album_name", album.trim());
      if (targetDuration > 0) params.append("duration", targetDuration.toString());

      const data = (await fetchJson(`https://lrclib.net/api/get?${params.toString()}`)) as
        | LrclibResult
        | null;

      if (data?.syncedLyrics) {
        console.log(`[lyrics] source=lrclib-get synced=true tries=${tries}`);
        return NextResponse.json(jsonFor(data));
      }
      if (data?.plainLyrics && !plainFallback) {
        plainFallback = data;
      }
    }

    // 2. LRCLIB search (/api/search) with cleaned title/artist.
    for (const variant of variants) {
      tries += 1;
      const query = `${variant} ${artist}`.trim();
      const results = (await fetchJson(
        `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`,
      )) as LrclibResult[] | null;

      if (Array.isArray(results) && results.length > 0) {
        const synced = results.filter((result) => Boolean(result.syncedLyrics));
        const plain = results.filter((result) => Boolean(result.plainLyrics));
        const chosenSynced =
          synced.find((result) => matchesDuration(result, targetDuration)) ||
          (targetDuration > 0 ? undefined : synced[0]);

        if (chosenSynced) {
          console.log(`[lyrics] source=lrclib-search synced=true tries=${tries}`);
          return NextResponse.json(jsonFor(chosenSynced));
        }

        const chosenPlain =
          plain.find((result) => matchesDuration(result, targetDuration)) ||
          (targetDuration > 0 ? undefined : plain[0]);

        if (chosenPlain && !plainFallback) {
          plainFallback = chosenPlain;
        }
      }
    }

    if (plainFallback) {
      console.log(`[lyrics] source=lrclib plain-only synced=false tries=${tries}`);
      return NextResponse.json(jsonFor(plainFallback));
    }

    console.log(`[lyrics] source=none synced=false tries=${tries}`);
    return NextResponse.json(jsonFor(null));
  } catch (error) {
    console.error("API /lyrics error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
