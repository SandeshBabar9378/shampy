import { NextRequest, NextResponse } from "next/server";
import { isCommunityPlaylist } from "@/lib/playlistUtils";

interface FormattedSearchResult {
  videoId: string;
  title: string;
  artist: string;
  album: string;
  thumbnail: string;
  duration: number;
  artistId?: string;
}

interface FormattedPlaylist {
  browseId: string;
  title: string;
  author: string;
  thumbnail: string;
  isCommunity?: boolean;
}

interface FormattedArtist {
  browseId: string;
  name: string;
  thumbnail: string;
}

interface FormattedAlbum {
  browseId: string;
  title: string;
  artist: string;
  thumbnail: string;
}

interface SearchRun {
  text?: string;
  navigationEndpoint?: {
    watchEndpoint?: { videoId?: string };
    browseEndpoint?: { browseId?: string };
  };
}

interface SearchText {
  runs?: SearchRun[];
}

interface ThumbnailRenderer {
  musicThumbnailRenderer?: {
    thumbnail?: { thumbnails?: { url?: string }[] };
  };
}

interface ResponsiveListItemRenderer {
  flexColumns?: {
    musicResponsiveListItemFlexColumnRenderer?: { text?: SearchText };
  }[];
  playlistItemData?: { videoId?: string };
  navigationEndpoint?: {
    watchEndpoint?: { videoId?: string };
    browseEndpoint?: { browseId?: string };
  };
  overlay?: {
    musicItemThumbnailOverlayRenderer?: {
      content?: {
        musicPlayButtonRenderer?: {
          playNavigationEndpoint?: { watchEndpoint?: { videoId?: string } };
        };
      };
    };
  };
  thumbnail?: ThumbnailRenderer;
}

interface CardShelfRenderer {
  title?: SearchText;
  subtitle?: SearchText;
  contents?: unknown[];
  onTap?: { watchEndpoint?: { videoId?: string } };
  thumbnail?: ThumbnailRenderer;
}

interface MusicShelfRenderer {
  contents?: unknown[];
  continuations?: {
    nextContinuationData?: { continuation?: string };
    nextRadioContinuationData?: { continuation?: string };
  }[];
}

type JsonObject = Record<string, unknown>;

const SEARCH_URL = "https://music.youtube.com/youtubei/v1/search";
const MAX_RESULTS = 50;

// Metrolist (innertube/src/main/kotlin/com/metrolist/innertube/YouTube.kt)
// SearchFilter constants.
const SONG_FILTER_PARAMS = "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D";
const PLAYLIST_FILTER_PARAMS = "EgeKAQQoADgBagwQDhAKEAMQBRAJEAQ%3D"; // featured playlists
const COMMUNITY_PLAYLIST_FILTER_PARAMS = "EgeKAQQoAEABahIQBRADEAQQCRAKEBUQDhAQEBE%3D"; // community playlists
const ARTIST_FILTER_PARAMS = "EgWKAQIgAWoKEAkQChAFEAMQBA%3D%3D";
const ALBUM_FILTER_PARAMS = "EgWKAQIYAWoKEAkQChAFEAMQBA%3D%3D";

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

const NON_SONG_LABELS = new Set([
  "song",
  "video",
  "single",
  "ep",
  "album",
  "playlist",
  "artist",
  "profile",
  "podcast",
  "episode",
]);

function asObject(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null ? (value as JsonObject) : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isDurationText(text: string): boolean {
  return /^\d{1,2}(:\d{2}){1,2}$/.test(text);
}

function isViewCountText(text: string): boolean {
  return /views?$/i.test(text);
}

function isYearText(text: string): boolean {
  return /^(19|20)\d{2}$/.test(text);
}

function isMonthlyAudienceText(text: string): boolean {
  return /monthly audience$/i.test(text);
}

function isMetadataSeparator(text: string): boolean {
  return /^[•&,;:|/]+$/.test(text);
}

function parseDuration(text: string): number {
  if (!text) return 0;
  const parts = text.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

async function requestSearch(payload: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(SEARCH_URL, {
    method: "POST",
    headers: REQUEST_HEADERS,
    cache: "no-store",
    body: JSON.stringify({ context: REQUEST_CONTEXT, ...payload }),
  });

  if (!response.ok) return null;
  return response.json();
}

function sectionsOf(data: unknown): unknown[] {
  const root = asObject(data);
  const contents = asObject(root?.contents);
  const tabs = asArray(asObject(contents?.tabbedSearchResultsRenderer)?.tabs);
  const tabContent = asObject(asObject(asObject(tabs[0])?.tabRenderer)?.content);
  const sections = asArray(asObject(tabContent?.sectionListRenderer)?.contents);

  if (sections.length > 0) return sections;

  // Some responses return the section list directly (no tab wrapper).
  return asArray(asObject(contents?.sectionListRenderer)?.contents);
}

function continuationItemsOf(data: unknown): unknown[] {
  const root = asObject(data);
  const shelfContinuation = asObject(
    asObject(root?.continuationContents)?.musicShelfContinuation,
  );
  const shelfItems = asArray(shelfContinuation?.contents);
  if (shelfItems.length > 0) return shelfItems;

  for (const action of asArray(root?.onResponseReceivedActions)) {
    const append = asObject(asObject(action)?.appendContinuationItemsAction);
    const items = asArray(append?.continuationItems);
    if (items.length > 0) return items;
  }

  return [];
}

function parseResponsiveItem(value: unknown): FormattedSearchResult | null {
  const renderer = asObject(value)?.musicResponsiveListItemRenderer;
  if (!renderer) return null;

  const item = renderer as ResponsiveListItemRenderer;
  const flexColumns = asArray(item.flexColumns);
  const titleColumn = asObject(flexColumns[0]);
  const titleRenderer = asObject(titleColumn?.musicResponsiveListItemFlexColumnRenderer);
  const titleText = asObject(titleRenderer?.text);
  const titleRuns = asArray(titleText?.runs) as SearchRun[];

  const title = asString(titleRuns[0]?.text);
  const videoId =
    asString(item.playlistItemData?.videoId) ||
    asString(titleRuns[0]?.navigationEndpoint?.watchEndpoint?.videoId) ||
    asString(item.navigationEndpoint?.watchEndpoint?.videoId) ||
    asString(
      item.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
        ?.playNavigationEndpoint?.watchEndpoint?.videoId,
    );

  if (!videoId || !title) return null;

  const subtitleColumn = asObject(flexColumns[1]);
  const subtitleRenderer = asObject(
    subtitleColumn?.musicResponsiveListItemFlexColumnRenderer,
  );
  const subtitleText = asObject(subtitleRenderer?.text);
  const subtitleRuns = asArray(subtitleText?.runs) as SearchRun[];

  // Subtitle runs are joined then split on bullet separators, e.g.
  // "Arijit Singh & Harshdeep Kaur • Raees • 5:00".
  // Artist names may themselves contain " & " or ", ", so only "•" separates fields.
  const subtitle = subtitleRuns
    .map((run) => asString(run?.text))
    .join("")
    .trim();
  const metadata = subtitle
    .split("•")
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .filter((text) => !NON_SONG_LABELS.has(text.toLowerCase()))
    .filter((text) => !isDurationText(text))
    .filter((text) => !isViewCountText(text))
    .filter((text) => !isMetadataSeparator(text));

  const durationText = subtitleRuns
    .map((run) => asString(run?.text).trim())
    .find((text) => isDurationText(text)) || "";
  const artist = metadata[0] || "";
  const album = metadata[1] || "";

  // Extract the artist's channel browseId from subtitle runs (UC… or FEmusic…)
  const artistId = subtitleRuns.find((run) => {
    const bId = asString(run?.navigationEndpoint?.browseEndpoint?.browseId);
    return bId.startsWith("UC") || bId.startsWith("FEmusic");
  })?.navigationEndpoint?.browseEndpoint?.browseId;

  const thumbnails = asArray(
    item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails,
  ) as { url?: string }[];
  const thumbnail =
    asString(thumbnails[thumbnails.length - 1]?.url) || asString(thumbnails[0]?.url);

  return {
    videoId,
    title,
    artist: artist || "Unknown Artist",
    album,
    thumbnail:
      thumbnail ||
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format",
    duration: parseDuration(durationText),
    artistId,
  };
}

function parseCardShelf(value: unknown): FormattedSearchResult | null {
  const renderer = asObject(value)?.musicCardShelfRenderer;
  if (!renderer) return null;

  const card = renderer as CardShelfRenderer;
  const titleRuns = asArray(card.title?.runs) as SearchRun[];
  const title = asString(titleRuns[0]?.text);
  const videoId =
    asString(titleRuns[0]?.navigationEndpoint?.watchEndpoint?.videoId) ||
    asString(card.onTap?.watchEndpoint?.videoId);

  if (!videoId || !title) return null;

  const subtitleRuns = asArray(card.subtitle?.runs) as SearchRun[];
  const subtitle = subtitleRuns.map((run) => asString(run?.text)).join("").trim();
  const metadata = subtitle
    .split("•")
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .filter((text) => !NON_SONG_LABELS.has(text.toLowerCase()))
    .filter((text) => !isDurationText(text))
    .filter((text) => !isViewCountText(text))
    .filter((text) => !isYearText(text))
    .filter((text) => !isMetadataSeparator(text));
  const artist = metadata[0] || "";
  const durationText = subtitleRuns
    .map((run) => asString(run?.text).trim())
    .find((text) => isDurationText(text)) || "";

  const thumbnails = asArray(
    card.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails,
  ) as { url?: string }[];
  const thumbnail =
    asString(thumbnails[thumbnails.length - 1]?.url) || asString(thumbnails[0]?.url);

  return {
    videoId,
    title,
    artist: artist || "Unknown Artist",
    album: metadata[1] || "",
    thumbnail,
    duration: parseDuration(durationText),
  };
}

function addResponsiveItems(items: unknown[], results: FormattedSearchResult[]): void {
  for (const item of items) {
    const song = parseResponsiveItem(item);
    if (song) results.push(song);
  }
}

interface BrowseFields {
  browseId: string;
  title: string;
  metadata: string[];
  thumbnail: string;
}

function parseBrowseFields(value: unknown): BrowseFields | null {
  const renderer = asObject(value)?.musicResponsiveListItemRenderer;
  if (!renderer) return null;

  const item = renderer as ResponsiveListItemRenderer;
  const flexColumns = asArray(item.flexColumns);

  const titleRuns = asArray(
    asObject(
      asObject(asObject(flexColumns[0])?.musicResponsiveListItemFlexColumnRenderer)?.text,
    )?.runs,
  ) as SearchRun[];
  const title = titleRuns.map((run) => asString(run?.text)).join("").trim();

  const subtitleRuns = asArray(
    asObject(
      asObject(asObject(flexColumns[1])?.musicResponsiveListItemFlexColumnRenderer)?.text,
    )?.runs,
  ) as SearchRun[];
  const subtitle = subtitleRuns.map((run) => asString(run?.text)).join("").trim();

  const metadata = subtitle
    .split("•")
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .filter((text) => !NON_SONG_LABELS.has(text.toLowerCase()))
    .filter((text) => !isDurationText(text))
    .filter((text) => !isViewCountText(text))
    .filter((text) => !isYearText(text))
    .filter((text) => !isMonthlyAudienceText(text))
    .filter((text) => !isMetadataSeparator(text));

  const browseId = asString(
    asObject(item.navigationEndpoint?.browseEndpoint)?.browseId,
  );

  const thumbnails = asArray(
    item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails,
  ) as { url?: string }[];
  const thumbnail =
    asString(thumbnails[thumbnails.length - 1]?.url) || asString(thumbnails[0]?.url);

  if (!browseId || !title) return null;

  return { browseId, title, metadata, thumbnail };
}

function parsePlaylistItem(value: unknown): FormattedPlaylist | null {
  const fields = parseBrowseFields(value);
  if (!fields) return null;
  const author = fields.metadata[0] || "";
  return {
    browseId: fields.browseId,
    title: fields.title,
    author,
    thumbnail: fields.thumbnail,
    isCommunity: isCommunityPlaylist(author),
  };
}

function parseArtistItem(value: unknown): FormattedArtist | null {
  const fields = parseBrowseFields(value);
  if (!fields) return null;
  return {
    browseId: fields.browseId,
    name: fields.title,
    thumbnail: fields.thumbnail,
  };
}

function parseAlbumItem(value: unknown): FormattedAlbum | null {
  const fields = parseBrowseFields(value);
  if (!fields) return null;
  return {
    browseId: fields.browseId,
    title: fields.title,
    artist: fields.metadata[0] || "",
    thumbnail: fields.thumbnail,
  };
}

function browseItemsOf(sections: unknown[]): unknown[] {
  const items: unknown[] = [];

  for (const section of sections) {
    const entry = asObject(section);
    if (!entry) continue;

    const shelf = asObject(entry.musicShelfRenderer);
    if (shelf) items.push(...asArray(shelf.contents));

    const card = asObject(entry.musicCardShelfRenderer);
    if (card) items.push(...asArray(card.contents));

    const itemSection = asObject(entry.itemSectionRenderer);
    if (itemSection) items.push(...asArray(itemSection.contents));
  }

  return items;
}

function parseBrowseList<T extends { browseId: string }>(
  data: unknown,
  parse: (value: unknown) => T | null,
  limit: number,
): T[] {
  const results: T[] = [];
  const seen = new Set<string>();

  for (const item of browseItemsOf(sectionsOf(data))) {
    const parsed = parse(item);
    if (!parsed || seen.has(parsed.browseId)) continue;
    seen.add(parsed.browseId);
    results.push(parsed);
    if (results.length >= limit) break;
  }

  return results;
}

function collectSections(
  sections: unknown[],
  results: FormattedSearchResult[],
): { shelves: number; continuation: string | null } {
  let shelves = 0;
  let continuation: string | null = null;

  for (const section of sections) {
    const entry = asObject(section);
    if (!entry) continue;

    // Top result card
    if (entry.musicCardShelfRenderer) {
      shelves += 1;
      const topResult = parseCardShelf(section);
      if (topResult) results.push(topResult);
      const card = entry.musicCardShelfRenderer as CardShelfRenderer;
      addResponsiveItems(asArray(card.contents), results);
    }

    // Song shelf (Songs / Videos / mixed results)
    if (entry.musicShelfRenderer) {
      shelves += 1;
      const shelf = entry.musicShelfRenderer as MusicShelfRenderer;
      addResponsiveItems(asArray(shelf.contents), results);

      if (!continuation) {
        for (const continuationItem of shelf.continuations ?? []) {
          const token =
            asString(continuationItem?.nextContinuationData?.continuation) ||
            asString(continuationItem?.nextRadioContinuationData?.continuation);
          if (token) {
            continuation = token;
            break;
          }
        }
      }
    }

    // Song items rendered as an item section (unfiltered search)
    if (entry.itemSectionRenderer) {
      shelves += 1;
      const itemSection = asObject(entry.itemSectionRenderer);
      addResponsiveItems(asArray(itemSection?.contents), results);
    }
  }

  return { shelves, continuation };
}

function topResultOf(data: unknown): FormattedSearchResult | null {
  for (const section of sectionsOf(data)) {
    const entry = asObject(section);
    if (entry?.musicCardShelfRenderer) {
      const topResult = parseCardShelf(section);
      if (topResult) return topResult;
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  let q = "";
  try {
    const { searchParams } = new URL(req.url);
    q = searchParams.get("q") || "";
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
    if (!q.trim()) {
      return NextResponse.json({ tracks: [], playlists: [], artists: [], albums: [], topResult: null });
    }

    const results: FormattedSearchResult[] = [];
    let shelves = 0;
    let continuation: string | null = null;

    // Use the Songs filter so the response is a full songs list, not a mixed short list.
    // Playlist/artist/album filters are the exact SearchFilter params from Metrolist's
    // innertube/src/main/kotlin/com/metrolist/innertube/YouTube.kt.
    const [filtered, playlistData, communityPlaylistData, artistData, albumData, unfilteredData] = await Promise.all([
      requestSearch({ query: q, params: SONG_FILTER_PARAMS }),
      requestSearch({ query: q, params: PLAYLIST_FILTER_PARAMS }),
      requestSearch({ query: q, params: COMMUNITY_PLAYLIST_FILTER_PARAMS }),
      requestSearch({ query: q, params: ARTIST_FILTER_PARAMS }),
      requestSearch({ query: q, params: ALBUM_FILTER_PARAMS }),
      requestSearch({ query: q }),
    ]);

    if (filtered) {
      const parsed = collectSections(sectionsOf(filtered), results);
      shelves += parsed.shelves;
      continuation = parsed.continuation;
    }

    // Fallback: if the filtered request gave nothing, parse every shelf/section
    // of the unfiltered response.
    if (results.length === 0 && unfilteredData) {
      const parsed = collectSections(sectionsOf(unfilteredData), results);
      shelves += parsed.shelves;
      continuation = parsed.continuation;
    }

    // Follow the continuation token once to get the next page of songs.
    if (continuation) {
      const nextPage = await requestSearch({ continuation });
      const nextItems = continuationItemsOf(nextPage);
      if (nextItems.length > 0) {
        shelves += 1;
        addResponsiveItems(nextItems, results);
      }
    }

    // Deduplicate by videoId and cap the total at 50 songs.
    const seen = new Set<string>();
    const deduplicated = results
      .filter((item) => {
        if (!item.videoId || seen.has(item.videoId)) return false;
        seen.add(item.videoId);
        return true;
      })
      .slice(0, MAX_RESULTS);

    const officialPlaylists = playlistData
      ? parseBrowseList(playlistData, parsePlaylistItem, 20)
      : [];
    const communityPlaylists = communityPlaylistData
      ? parseBrowseList(communityPlaylistData, parsePlaylistItem, 20)
      : [];

    // Combine official and community playlists without duplicate browseIds
    const playlistSeen = new Set<string>();
    const playlists: FormattedPlaylist[] = [];
    for (const p of [...officialPlaylists, ...communityPlaylists]) {
      if (!p.browseId || playlistSeen.has(p.browseId)) continue;
      playlistSeen.add(p.browseId);
      playlists.push(p);
    }
    const artists = artistData ? parseBrowseList(artistData, parseArtistItem, 20) : [];
    const albums = albumData ? parseBrowseList(albumData, parseAlbumItem, 20) : [];
    const topResult = unfilteredData ? topResultOf(unfilteredData) : null;

    console.log(
      `[api/search] query="${q}" shelves=${shelves} songsParsed=${results.length} songsReturned=${deduplicated.length} playlists=${playlists.length} artists=${artists.length} albums=${albums.length}`,
    );

    return NextResponse.json({
      tracks: deduplicated,
      playlists,
      artists,
      albums,
      topResult,
    });
  } catch (error) {
    console.error("API /search error:", error);
    return NextResponse.json(
      { tracks: [], playlists: [], artists: [], albums: [], topResult: null },
      { status: 500 },
    );
  }
}
