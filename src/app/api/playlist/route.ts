import { NextRequest, NextResponse } from "next/server";
import { getYouTubeThumbnailUrl } from "@/lib/artwork";

interface PlaylistTrack {
  videoId: string;
  title: string;
  artist: string;
  album: string;
  thumbnail: string;
  duration: number;
}

type JsonObject = Record<string, unknown>;

const BROWSE_URL = "https://music.youtube.com/youtubei/v1/browse";
const MAX_TRACKS = 500;
const MAX_CONTINUATION_PAGES = 10;

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

function asObject(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null ? (value as JsonObject) : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function runsText(value: unknown): string {
  return asArray(asObject(value)?.runs)
    .map((run) => asString(asObject(run)?.text))
    .join("")
    .trim();
}

function parseDuration(text: string): number {
  if (!text) return 0;
  const parts = text.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

function lastThumbnailUrl(value: unknown, videoId?: string): string {
  const renderer = asObject(value);
  const thumbnailRenderer = asObject(renderer?.musicThumbnailRenderer);
  const thumbnails = asArray(asObject(thumbnailRenderer?.thumbnail)?.thumbnails) as {
    url?: string;
  }[];
  return getYouTubeThumbnailUrl(thumbnails, videoId);
}

function normalizePlaylistId(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith("VL") ? trimmed.slice(2) : trimmed;
}

function continuationToken(value: unknown): string {
  for (const continuation of asArray(value)) {
    const next =
      asObject(asObject(continuation)?.nextContinuationData) ||
      asObject(asObject(continuation)?.nextRadioContinuationData);
    const token = asString(next?.continuation);
    if (token) return token;
  }
  return "";
}

function parsePlaylistTrack(value: unknown): PlaylistTrack | null {
  const item = asObject(asObject(value)?.musicResponsiveListItemRenderer);
  if (!item) return null;

  const flexColumns = asArray(item.flexColumns).map((column) =>
    runsText(asObject(asObject(column)?.musicResponsiveListItemFlexColumnRenderer)?.text),
  );
  const title = flexColumns[0] || "";
  if (!title) return null;

  const overlayContent = asObject(
    asObject(asObject(item.overlay)?.musicItemThumbnailOverlayRenderer)?.content,
  );
  const overlayPlayButton = asObject(asObject(overlayContent)?.musicPlayButtonRenderer);

  const videoId =
    asString(asObject(item.playlistItemData)?.videoId) ||
    asString(asObject(asObject(item.navigationEndpoint)?.watchEndpoint)?.videoId) ||
    asString(asObject(asObject(overlayPlayButton?.playNavigationEndpoint)?.watchEndpoint)?.videoId);

  if (!videoId) return null;

  const fixedTexts = asArray(item.fixedColumns).map((column) =>
    runsText(asObject(asObject(column)?.musicResponsiveListItemFixedColumnRenderer)?.text),
  );
  const durationText = fixedTexts.find((text) => /^\d{1,2}(:\d{2}){1,2}$/.test(text)) || "";

  return {
    videoId,
    title,
    artist: flexColumns[1] || "Unknown Artist",
    album: flexColumns[2] || "",
    thumbnail: lastThumbnailUrl(item.thumbnail, videoId),
    duration: parseDuration(durationText),
  };
}

function playlistHeaderOf(data: unknown): {
  title: string;
  author: string;
  thumbnail: string;
  trackCount: number;
} {
  const root = asObject(data);
  const contents = asObject(root?.contents);
  const twoColumn = asObject(contents?.twoColumnBrowseResultsRenderer);
  const tabs = asArray(twoColumn?.tabs);
  const tabContent = asObject(asObject(tabs[0])?.tabRenderer)?.content;
  const sections = asArray(asObject(tabContent)?.sectionListRenderer ? asObject(asObject(tabContent)?.sectionListRenderer)?.contents : []);
  const base = asObject(sections[0]);
  const editableHeader = asObject(base?.musicEditablePlaylistDetailHeaderRenderer);
  const detailHeader = asObject(asObject(editableHeader?.header)?.musicDetailHeaderRenderer);
  const responsiveHeader =
    asObject(base?.musicResponsiveHeaderRenderer) ??
    asObject(asObject(editableHeader?.header)?.musicResponsiveHeaderRenderer);
  const musicHeader = asObject(asObject(root?.header)?.musicHeaderRenderer);

  const header = responsiveHeader || musicHeader;
  const title =
    runsText(asObject(header?.title)) ||
    runsText(asObject(detailHeader?.title)) ||
    runsText(musicHeader?.title);

  const authorRuns = runsText(asObject(header?.straplineTextOne));
  const facepile = asObject(asObject(header?.facepile)?.avatarStackViewModel);
  const facepileText =
    asString(asObject(facepile?.text)?.content) ||
    asString(asObject(asObject(facepile?.rendererContext)?.accessibilityContext)?.label);
  const detailAuthor = runsText(asObject(detailHeader?.subtitle));
  const author = authorRuns || facepileText || detailAuthor;

  const thumbnail =
    lastThumbnailUrl(header?.thumbnail) ||
    lastThumbnailUrl(detailHeader?.thumbnail) ||
    lastThumbnailUrl(musicHeader?.thumbnail);

  const secondSubtitle = runsText(asObject(header?.secondSubtitle));
  const countMatch = secondSubtitle.match(/(\d[\d,]*)\s+(?:tracks?|songs?)/i);
  const trackCount = countMatch ? Number(countMatch[1].replace(/,/g, "")) : 0;

  return {
    title,
    author: author || "Unknown",
    thumbnail,
    trackCount,
  };
}

function playlistShelfOf(data: unknown): { items: unknown[]; continuation: string | null } {
  const root = asObject(data);
  const contents = asObject(root?.contents);
  const secondary = asObject(asObject(contents?.twoColumnBrowseResultsRenderer)?.secondaryContents);
  const sections = asArray(asObject(secondary?.sectionListRenderer)?.contents);
  const first = asObject(sections[0]);
  const shelf =
    asObject(first?.musicPlaylistShelfRenderer) || asObject(first?.musicShelfRenderer);

  return { items: asArray(shelf?.contents), continuation: continuationToken(shelf?.continuations) };
}

function continuationOf(data: unknown): { items: unknown[]; continuation: string | null } {
  const root = asObject(data);
  const shelfContinuation = asObject(asObject(root?.continuationContents)?.musicPlaylistShelfContinuation);
  const items = asArray(shelfContinuation?.contents);
  if (items.length > 0) {
    return {
      items,
      continuation: continuationToken(shelfContinuation?.continuations),
    };
  }

  for (const action of asArray(root?.onResponseReceivedActions)) {
    const append = asObject(asObject(action)?.appendContinuationItemsAction);
    const appendItems = asArray(append?.continuationItems);
    if (appendItems.length > 0) {
      let token: string | null = null;
      for (const item of appendItems) {
        const command = asObject(
          asObject(asObject(item)?.continuationItemRenderer)?.continuationEndpoint,
        );
        const commandToken = asString(asObject(command?.continuationCommand)?.token);
        if (commandToken) {
          token = commandToken;
          break;
        }
      }
      return { items: appendItems, continuation: token };
    }
  }

  return { items: [], continuation: null };
}

async function browse(payload: Record<string, unknown>): Promise<unknown | null> {
  const response = await fetch(BROWSE_URL, {
    method: "POST",
    headers: REQUEST_HEADERS,
    cache: "no-store",
    body: JSON.stringify({ context: REQUEST_CONTEXT, ...payload }),
  });

  if (!response.ok) return null;
  return response.json();
}

export async function GET(req: NextRequest) {
  let rawId = "";
  try {
    const { searchParams } = new URL(req.url);
    rawId = searchParams.get("id") || "";
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

  const playlistId = normalizePlaylistId(rawId);

  if (!playlistId) {
    return NextResponse.json({ error: "Playlist id is required" }, { status: 400 });
  }

  if (!/^[A-Za-z0-9_-]{10,120}$/.test(playlistId)) {
    return NextResponse.json({ error: "Invalid playlist id" }, { status: 400 });
  }

  try {
    const data = await browse({ browseId: `VL${playlistId}` });
    if (!data) {
      return NextResponse.json({ error: "Failed to fetch playlist" }, { status: 502 });
    }

    const header = playlistHeaderOf(data);
    const shelf = playlistShelfOf(data);

    const tracks: PlaylistTrack[] = [];
    const seen = new Set<string>();

    const addItems = (items: unknown[]) => {
      for (const item of items) {
        const track = parsePlaylistTrack(item);
        if (!track || seen.has(track.videoId)) continue;
        seen.add(track.videoId);
        tracks.push(track);
        if (tracks.length >= MAX_TRACKS) break;
      }
    };

    addItems(shelf.items);

    let continuation = shelf.continuation;
    const seenContinuations = new Set<string>();
    let pages = 0;

    while (
      continuation &&
      tracks.length < MAX_TRACKS &&
      pages < MAX_CONTINUATION_PAGES &&
      !seenContinuations.has(continuation)
    ) {
      seenContinuations.add(continuation);
      pages += 1;

      const page = await browse({ continuation });
      if (!page) break;

      const next = continuationOf(page);
      if (next.items.length > 0) addItems(next.items);
      continuation = next.continuation;
    }

    if (!header.title && tracks.length === 0) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: playlistId,
      title: header.title || "Playlist",
      author: header.author,
      thumbnail: header.thumbnail,
      trackCount: header.trackCount || tracks.length,
      tracks,
    });
  } catch (error) {
    console.error("API /playlist error:", error);
    return NextResponse.json({ error: "Failed to load playlist" }, { status: 500 });
  }
}
