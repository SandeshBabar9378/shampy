import { NextRequest, NextResponse } from "next/server";

type JsonObject = Record<string, unknown>;

const BROWSE_URL = "https://music.youtube.com/youtubei/v1/browse";

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

interface AlbumTrack {
  videoId: string;
  title: string;
  artist: string;
  album: string;
  thumbnail: string;
  duration: number;
}

function asObject(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null
    ? (value as JsonObject)
    : undefined;
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
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function lastThumbnailUrl(value: unknown): string {
  const renderer = asObject(value);
  const thumbnailRenderer = asObject(renderer?.musicThumbnailRenderer);
  const thumbnails = asArray(
    asObject(thumbnailRenderer?.thumbnail)?.thumbnails,
  ) as { url?: string }[];
  return (
    asString(thumbnails[thumbnails.length - 1]?.url) ||
    asString(thumbnails[0]?.url)
  );
}

function parseAlbumTrack(item: unknown, albumTitle: string, albumArtist: string): AlbumTrack | null {
  const renderer = asObject(asObject(item)?.musicResponsiveListItemRenderer);
  if (!renderer) return null;

  const flexColumns = asArray(renderer.flexColumns).map((col) =>
    runsText(
      asObject(asObject(col)?.musicResponsiveListItemFlexColumnRenderer)?.text,
    ),
  );
  const title = flexColumns[0] || "";
  if (!title) return null;

  // videoId from navigationEndpoint or overlay
  const navEndpoint = asObject(renderer.navigationEndpoint);
  const watchEndpoint = asObject(navEndpoint?.watchEndpoint);
  const overlayContent = asObject(
    asObject(asObject(renderer.overlay)?.musicItemThumbnailOverlayRenderer)
      ?.content,
  );
  const overlayPlayButton = asObject(
    asObject(overlayContent)?.musicPlayButtonRenderer,
  );

  const videoId =
    asString(watchEndpoint?.videoId) ||
    asString(
      asObject(
        asObject(overlayPlayButton?.playNavigationEndpoint)?.watchEndpoint,
      )?.videoId,
    ) ||
    asString(asObject(renderer.playlistItemData)?.videoId);

  if (!videoId) return null;

  const fixedTexts = asArray(renderer.fixedColumns).map((col) =>
    runsText(
      asObject(asObject(col)?.musicResponsiveListItemFixedColumnRenderer)?.text,
    ),
  );
  const durationText =
    fixedTexts.find((t) => /^\d{1,2}(:\d{2}){1,2}$/.test(t)) || "";

  const trackArtist = flexColumns[1] || albumArtist;

  return {
    videoId,
    title,
    artist: trackArtist,
    album: albumTitle,
    thumbnail: lastThumbnailUrl(renderer.thumbnail),
    duration: parseDuration(durationText),
  };
}

async function browseYT(payload: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(BROWSE_URL, {
    method: "POST",
    headers: REQUEST_HEADERS,
    cache: "no-store",
    body: JSON.stringify({ context: REQUEST_CONTEXT, ...payload }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") || "";

  if (!id) {
    return NextResponse.json({ error: "Album id is required" }, { status: 400 });
  }
  if (!/^[A-Za-z0-9_-]{10,120}$/.test(id)) {
    return NextResponse.json({ error: "Invalid album id" }, { status: 400 });
  }

  try {
    const data = await browseYT({ browseId: id });
    const ytStatus = data ? 200 : 502;

    if (!data) {
      console.log(`[api/album] id=${id} ytStatus=502 tracks=0`);
      return NextResponse.json({ error: "Failed to fetch album" }, { status: 502 });
    }

    const root = asObject(data);
    const contents = asObject(root?.contents);
    const twoCol = asObject(contents?.twoColumnBrowseResultsRenderer);

    // Parse header from primary tabs
    const tabs = asArray(twoCol?.tabs);
    const tabContent = asObject(asObject(tabs[0])?.tabRenderer)?.content;
    const primarySections = asArray(
      asObject(tabContent)?.sectionListRenderer
        ? asObject(asObject(tabContent)?.sectionListRenderer)?.contents
        : [],
    );
    const headerSection = asObject(primarySections[0]);
    const responsiveHeader = asObject(
      headerSection?.musicResponsiveHeaderRenderer,
    );

    const albumTitle =
      runsText(responsiveHeader?.title) || "Album";
    const albumArtist =
      runsText(responsiveHeader?.straplineTextOne) || "Unknown Artist";
    const albumThumbnail =
      lastThumbnailUrl(responsiveHeader?.thumbnail) || "";

    // Parse tracks from secondaryContents
    const secondary = asObject(twoCol?.secondaryContents);
    const secondarySections = asArray(
      asObject(secondary?.sectionListRenderer)?.contents,
    );
    const trackShelf = asObject(asObject(secondarySections[0])?.musicShelfRenderer);
    const trackItems = asArray(trackShelf?.contents);

    const tracks: AlbumTrack[] = [];
    const seen = new Set<string>();

    for (const item of trackItems) {
      const track = parseAlbumTrack(item, albumTitle, albumArtist);
      if (track && !seen.has(track.videoId)) {
        seen.add(track.videoId);
        tracks.push(track);
      }
    }

    console.log(`[api/album] id=${id} ytStatus=${ytStatus} tracks=${tracks.length}`);

    return NextResponse.json({
      title: albumTitle,
      author: albumArtist,
      thumbnail: albumThumbnail,
      tracks,
    });
  } catch (error) {
    console.error("[api/album] error:", error);
    return NextResponse.json({ error: "Failed to load album" }, { status: 500 });
  }
}
