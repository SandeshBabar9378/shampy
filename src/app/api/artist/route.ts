import { NextRequest, NextResponse } from "next/server";
import { isCommunityPlaylist } from "@/lib/playlistUtils";

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

interface ArtistTrack {
  videoId: string;
  title: string;
  artist: string;
  album: string;
  thumbnail: string;
  duration: number;
}

export interface ArtistRelease {
  browseId: string;
  title: string;
  year: string;
  type: string;
  thumbnail: string;
}

export interface FeaturedPlaylist {
  browseId: string;
  title: string;
  subtitle: string;
  author?: string;
  thumbnail: string;
  isCommunity?: boolean;
}

export interface SimilarArtist {
  browseId: string;
  name: string;
  thumbnail: string;
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

function parseTrackItem(item: unknown): ArtistTrack | null {
  const renderer = asObject(asObject(item)?.musicResponsiveListItemRenderer);
  if (!renderer) return null;

  const flexColumns = asArray(renderer.flexColumns).map((col) =>
    runsText(
      asObject(asObject(col)?.musicResponsiveListItemFlexColumnRenderer)?.text,
    ),
  );
  const title = flexColumns[0] || "";
  if (!title) return null;

  const overlayContent = asObject(
    asObject(asObject(renderer.overlay)?.musicItemThumbnailOverlayRenderer)
      ?.content,
  );
  const overlayPlayButton = asObject(
    asObject(overlayContent)?.musicPlayButtonRenderer,
  );

  const videoId =
    asString(asObject(renderer.playlistItemData)?.videoId) ||
    asString(
      asObject(asObject(renderer.navigationEndpoint)?.watchEndpoint)?.videoId,
    ) ||
    asString(
      asObject(
        asObject(overlayPlayButton?.playNavigationEndpoint)?.watchEndpoint,
      )?.videoId,
    );

  if (!videoId) return null;

  const fixedTexts = asArray(renderer.fixedColumns).map((col) =>
    runsText(
      asObject(asObject(col)?.musicResponsiveListItemFixedColumnRenderer)?.text,
    ),
  );
  const durationText =
    fixedTexts.find((t) => /^\d{1,2}(:\d{2}){1,2}$/.test(t)) || "";

  return {
    videoId,
    title,
    artist: flexColumns[1] || "Unknown Artist",
    album: flexColumns[3] || flexColumns[2] || "",
    thumbnail: lastThumbnailUrl(renderer.thumbnail),
    duration: parseDuration(durationText),
  };
}

function parseTwoRowItem(raw: unknown): {
  browseId: string;
  title: string;
  subtitle: string;
  thumbnail: string;
  runs: string[];
} | null {
  const item = asObject(asObject(raw)?.musicTwoRowItemRenderer);
  if (!item) return null;

  const titleObj = asObject(item.title);
  const title = runsText(titleObj);
  if (!title) return null;

  const navEndpoint =
    asObject(item.navigationEndpoint) ||
    asObject(asArray(titleObj?.runs)[0] ? asObject(asArray(titleObj?.runs)[0])?.navigationEndpoint : undefined);

  const browseEndpoint = asObject(navEndpoint?.browseEndpoint);
  const browseId = asString(browseEndpoint?.browseId);
  if (!browseId) return null;

  const subtitleObj = asObject(item.subtitle);
  const subtitle = runsText(subtitleObj);
  const runs = asArray(subtitleObj?.runs).map((r) => asString(asObject(r)?.text).trim()).filter(Boolean);

  const thumbnail =
    lastThumbnailUrl(item.thumbnailRenderer) ||
    lastThumbnailUrl(item.thumbnail);

  return { browseId, title, subtitle, thumbnail, runs };
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
    return NextResponse.json({ error: "Artist id is required" }, { status: 400 });
  }
  if (!/^[A-Za-z0-9_-]{10,120}$/.test(id)) {
    return NextResponse.json({ error: "Invalid artist id" }, { status: 400 });
  }

  try {
    const data = await browseYT({ browseId: id });
    const ytStatus = data ? 200 : 502;

    if (!data) {
      console.log(`[api/artist] id=${id} ytStatus=502 tracks=0`);
      return NextResponse.json({ error: "Failed to fetch artist" }, { status: 502 });
    }

    const root = asObject(data);

    // Parse header
    const header = asObject(root?.header);
    const immersiveHeader = asObject(header?.musicImmersiveHeaderRenderer);
    const visualHeader = asObject(header?.musicVisualHeaderRenderer);
    const headerRenderer = immersiveHeader || visualHeader;

    const title =
      runsText(headerRenderer?.title) ||
      runsText(asObject(asObject(root?.header)?.musicHeaderRenderer)?.title) ||
      "";
    const thumbnail =
      lastThumbnailUrl(headerRenderer?.thumbnail) ||
      lastThumbnailUrl(
        asObject(asObject(root?.header)?.musicHeaderRenderer)?.thumbnail,
      );

    // Parse sections from singleColumnBrowseResultsRenderer
    const contents = asObject(root?.contents);
    const singleCol = asObject(contents?.singleColumnBrowseResultsRenderer);
    const tabs = asArray(singleCol?.tabs);
    const tabContent = asObject(asObject(tabs[0])?.tabRenderer)?.content;
    const sections = asArray(
      asObject(tabContent)?.sectionListRenderer
        ? asObject(asObject(tabContent)?.sectionListRenderer)?.contents
        : [],
    );

    const tracks: ArtistTrack[] = [];
    const seen = new Set<string>();
    let vlPlaylistId = "";

    const albums: ArtistRelease[] = [];
    const singles: ArtistRelease[] = [];
    const featuredOn: FeaturedPlaylist[] = [];
    const fansAlsoLike: SimilarArtist[] = [];

    for (const section of sections) {
      // 1. MusicShelfRenderer (Songs / Top songs)
      const shelf = asObject(asObject(section)?.musicShelfRenderer);
      if (shelf) {
        const shelfItems = asArray(shelf.contents);
        for (const item of shelfItems) {
          const track = parseTrackItem(item);
          if (track && !seen.has(track.videoId)) {
            seen.add(track.videoId);
            tracks.push(track);
          }
        }

        if (!vlPlaylistId) {
          const bottomEndpoint = asObject(shelf.bottomEndpoint);
          const browseEndpoint = asObject(bottomEndpoint?.browseEndpoint);
          const candidateId = asString(browseEndpoint?.browseId);
          if (candidateId.startsWith("VL")) {
            vlPlaylistId = candidateId.slice(2);
          } else if (candidateId) {
            vlPlaylistId = candidateId;
          }
        }
        continue;
      }

      // 2. MusicCarouselShelfRenderer (Albums, Singles, Featured on, Fans might also like, etc.)
      const carousel = asObject(asObject(section)?.musicCarouselShelfRenderer);
      if (carousel) {
        const carouselHeader = asObject(carousel.header);
        const basicHeader = asObject(carouselHeader?.musicCarouselShelfBasicHeaderRenderer);
        const headerTitle = runsText(basicHeader?.title).toLowerCase();
        const carouselItems = asArray(carousel.contents);

        if (headerTitle.includes("album")) {
          for (const item of carouselItems) {
            const parsed = parseTwoRowItem(item);
            if (!parsed) continue;
            // Year extraction from subtitle
            const yearMatch = parsed.subtitle.match(/\b(19\d\d|20\d\d)\b/);
            const year = yearMatch ? yearMatch[1] : "";
            const isEP = parsed.subtitle.toLowerCase().includes("ep");
            albums.push({
              browseId: parsed.browseId,
              title: parsed.title,
              year,
              type: isEP ? "EP" : "Album",
              thumbnail: parsed.thumbnail,
            });
          }
        } else if (headerTitle.includes("single") || headerTitle.includes("ep")) {
          for (const item of carouselItems) {
            const parsed = parseTwoRowItem(item);
            if (!parsed) continue;
            const yearMatch = parsed.subtitle.match(/\b(19\d\d|20\d\d)\b/);
            const year = yearMatch ? yearMatch[1] : "";
            const isEP = parsed.subtitle.toLowerCase().includes("ep");
            singles.push({
              browseId: parsed.browseId,
              title: parsed.title,
              year,
              type: isEP ? "EP" : "Single",
              thumbnail: parsed.thumbnail,
            });
          }
        } else if (headerTitle.includes("featured on") || headerTitle.includes("playlist")) {
          for (const item of carouselItems) {
            const parsed = parseTwoRowItem(item);
            if (!parsed) continue;
            // Extract author from runs or subtitle
            const author = parsed.runs.length > 1 ? parsed.runs[parsed.runs.length - 1] : parsed.subtitle;
            const isCommunity = isCommunityPlaylist(author, title);
            featuredOn.push({
              browseId: parsed.browseId,
              title: parsed.title,
              subtitle: parsed.subtitle,
              author,
              thumbnail: parsed.thumbnail,
              isCommunity,
            });
          }
        } else if (headerTitle.includes("fans") || headerTitle.includes("similar") || headerTitle.includes("like")) {
          for (const item of carouselItems) {
            const parsed = parseTwoRowItem(item);
            if (!parsed) continue;
            fansAlsoLike.push({
              browseId: parsed.browseId,
              name: parsed.title,
              thumbnail: parsed.thumbnail,
            });
          }
        }
      }
    }

    // If we found a VL playlist, browse it to get all songs
    if (vlPlaylistId) {
      const playlistData = await browseYT({
        browseId: `VL${vlPlaylistId}`,
        params: "ggMCCAI%3D",
      });

      if (playlistData) {
        const pRoot = asObject(playlistData);
        const pContents = asObject(pRoot?.contents);
        const pSingleCol = asObject(pContents?.singleColumnBrowseResultsRenderer);
        const pTabs = asArray(pSingleCol?.tabs);
        const pTabContent = asObject(asObject(pTabs[0])?.tabRenderer)?.content;
        const pSections = asArray(
          asObject(pTabContent)?.sectionListRenderer
            ? asObject(asObject(pTabContent)?.sectionListRenderer)?.contents
            : [],
        );

        for (const section of pSections) {
          const shelf = asObject(asObject(section)?.musicPlaylistShelfRenderer);
          if (!shelf) continue;
          for (const item of asArray(shelf.contents)) {
            const track = parseTrackItem(item);
            if (track && !seen.has(track.videoId)) {
              seen.add(track.videoId);
              tracks.push(track);
            }
          }
        }
      }
    }

    console.log(`[api/artist] id=${id} ytStatus=${ytStatus} tracks=${tracks.length}`);

    return NextResponse.json({
      title: title || "Artist",
      thumbnail,
      tracks,
      albums,
      singles,
      featuredOn,
      fansAlsoLike,
    });
  } catch (error) {
    console.error("[api/artist] error:", error);
    return NextResponse.json({ error: "Failed to load artist" }, { status: 500 });
  }
}
