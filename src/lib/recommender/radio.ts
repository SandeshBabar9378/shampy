/**
 * Server-side candidate source for the recommender.
 *
 * `/api/next` stays exactly as it is (it is the queue fallback and the Home
 * legacy path); this is a compact reader of the same InnerTube radio response.
 */

export interface RadioTrack {
  videoId: string;
  title: string;
  artist: string;
  album: string;
  thumbnail: string;
  duration: number;
}

interface TextRuns {
  runs?: { text?: string }[];
}

interface RadioRenderer {
  videoId?: string;
  title?: TextRuns;
  longBylineText?: TextRuns;
  lengthText?: TextRuns;
  thumbnail?: { thumbnails?: { url?: string }[] };
}

interface RadioResponse {
  contents?: {
    singleColumnMusicWatchNextResultsRenderer?: {
      tabbedRenderer?: {
        watchNextTabbedResultsRenderer?: {
          tabs?: {
            tabRenderer?: {
              content?: {
                musicQueueRenderer?: {
                  content?: {
                    playlistPanelRenderer?: {
                      contents?: { playlistPanelVideoRenderer?: RadioRenderer }[];
                    };
                  };
                };
              };
            };
          }[];
        };
      };
    };
  };
  continuationContents?: {
    playlistPanelContinuation?: {
      contents?: { playlistPanelVideoRenderer?: RadioRenderer }[];
    };
  };
}

const RADIO_URL = "https://music.youtube.com/youtubei/v1/next";
const CACHE_TTL_MS = 10 * 60_000;
const MAX_CACHE_ENTRIES = 200;

const REQUEST_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://music.youtube.com/",
  Origin: "https://music.youtube.com",
};

const REQUEST_CONTEXT = {
  client: {
    clientName: "WEB_REMIX",
    clientVersion: "1.20240101.01.00",
    hl: "en",
    gl: "US",
  },
};

const cache = new Map<string, { at: number; tracks: RadioTrack[] }>();

function runsText(value: TextRuns | undefined): string {
  if (!value?.runs) return "";
  return value.runs.map((run) => run.text ?? "").join("").trim();
}

function parseDuration(text: string): number {
  if (!text) return 0;
  const parts = text.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function parseItems(items: { playlistPanelVideoRenderer?: RadioRenderer }[] | undefined): RadioTrack[] {
  if (!Array.isArray(items)) return [];
  const tracks: RadioTrack[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const renderer = item?.playlistPanelVideoRenderer;
    if (!renderer?.videoId || !/^[A-Za-z0-9_-]{11}$/.test(renderer.videoId)) continue;
    const title = runsText(renderer.title);
    if (!title || seen.has(renderer.videoId)) continue;
    seen.add(renderer.videoId);

    const byline = renderer.longBylineText?.runs
      ?.map((run) => run.text ?? "")
      .filter((text) => text !== " • " && text !== "•")
      .filter((text) => text.trim().length > 0) ?? [];

    const thumbnails = renderer.thumbnail?.thumbnails ?? [];
    const thumbnail = thumbnails[thumbnails.length - 1]?.url ?? thumbnails[0]?.url ?? "";

    tracks.push({
      videoId: renderer.videoId,
      title,
      artist: byline[0] || "Unknown Artist",
      album: byline[1] || "",
      thumbnail,
      duration: parseDuration(runsText(renderer.lengthText)),
    });
  }

  return tracks;
}

/** Radio candidates for a videoId. Failures are empty results, never throws. */
export async function fetchRadioTracks(videoId: string, limit = 25): Promise<RadioTrack[]> {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return [];

  const cached = cache.get(videoId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.tracks.slice(0, limit);

  try {
    const response = await fetch(RADIO_URL, {
      method: "POST",
      headers: REQUEST_HEADERS,
      cache: "no-store",
      body: JSON.stringify({
        context: REQUEST_CONTEXT,
        videoId,
        playlistId: `RDAMVM${videoId}`,
        isAudioOnly: true,
      }),
    });
    if (!response.ok) return [];

    const data = (await response.json()) as RadioResponse;
    const panel =
      data.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer
        ?.watchNextTabbedResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.musicQueueRenderer
        ?.content?.playlistPanelRenderer?.contents ??
      data.continuationContents?.playlistPanelContinuation?.contents;

    const tracks = parseItems(panel);
    if (tracks.length > 0) {
      if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
      cache.set(videoId, { at: Date.now(), tracks });
    }
    return tracks.slice(0, limit);
  } catch (err) {
    console.error("[recommender] radio fetch failed:", err);
    return [];
  }
}
