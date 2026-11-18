const YOUTUBE_THUMBNAIL_BASE = "https://i.ytimg.com";

export type YouTubeArtworkQuality = "mq" | "hq" | "sd" | "max";

const YOUTUBE_THUMBNAIL_SUFFIXES: Record<YouTubeArtworkQuality, string> = {
  mq: "mqdefault.jpg",
  hq: "hqdefault.jpg",
  sd: "sddefault.jpg",
  max: "maxresdefault.jpg",
};

/** Pick the largest real thumbnail (YouTube lists sizes in ascending order). */
function bestThumbnailUrl(
  candidates: { url: string; width: number; height: number }[],
): string {
  let best = candidates[0];
  let bestArea = best.width * best.height;

  for (let i = 1; i < candidates.length; i += 1) {
    const area = candidates[i].width * candidates[i].height;
    if (area >= bestArea) {
      best = candidates[i];
      bestArea = area;
    }
  }

  return best.url;
}

const DEFAULT_ARTWORK_FALLBACK = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format";

export function getYouTubeArtworkUrl(
  videoId: string | undefined,
  quality: YouTubeArtworkQuality = "max",
): string | null {
  if (!videoId) return null;
  return `${YOUTUBE_THUMBNAIL_BASE}/vi/${videoId}/${YOUTUBE_THUMBNAIL_SUFFIXES[quality]}`;
}

export function getYouTubeArtworkFallbackUrl(
  videoId: string | undefined,
  quality: YouTubeArtworkQuality = "hq",
): string | null {
  if (!videoId) return null;
  const fallbackQuality = quality === "mq" ? "hq" : quality;
  return getYouTubeArtworkUrl(videoId, fallbackQuality);
}

export function getDefaultArtworkFallbackUrl(): string {
  return DEFAULT_ARTWORK_FALLBACK;
}

export function getTrackArtworkUrl(
  track: { youtubeId?: string; coverUrl?: string } | null | undefined,
  quality: YouTubeArtworkQuality = "max",
): string {
  const youtubeUrl = track?.youtubeId ? getYouTubeArtworkUrl(track.youtubeId, quality) : null;
  return youtubeUrl || track?.coverUrl || getDefaultArtworkFallbackUrl();
}

export function getTrackArtworkFallbackUrl(
  track: { youtubeId?: string; coverUrl?: string } | null | undefined,
  quality: YouTubeArtworkQuality = "hq",
): string {
  const youtubeUrl = track?.youtubeId ? getYouTubeArtworkUrl(track.youtubeId, quality) : null;
  return youtubeUrl || track?.coverUrl || getDefaultArtworkFallbackUrl();
}

export function getYouTubeThumbnailUrl(
  thumbnails: { url?: string; width?: number; height?: number }[] = [],
  videoId?: string,
  fallbackQuality: YouTubeArtworkQuality = "hq",
): string {
  const candidates = thumbnails
    .map((thumbnail) => ({
      url: thumbnail?.url,
      width: typeof thumbnail?.width === "number" ? thumbnail.width : 0,
      height: typeof thumbnail?.height === "number" ? thumbnail.height : 0,
    }))
    .filter(
      (thumbnail): thumbnail is { url: string; width: number; height: number } =>
        Boolean(thumbnail.url),
    );

  // Tracks always have a videoId: prefer the reliable i.ytimg.com thumbnail for
  // that video, picking the best quality the source advertised.
  if (videoId) {
    const preferredQuality: YouTubeArtworkQuality = candidates.find((thumbnail) =>
      thumbnail.url.includes("maxresdefault"),
    )
      ? "max"
      : candidates.find((thumbnail) => thumbnail.url.includes("sddefault"))
        ? "sd"
        : candidates.find((thumbnail) => thumbnail.url.includes("hqdefault"))
          ? "hq"
          : candidates.find((thumbnail) => thumbnail.url.includes("mqdefault"))
            ? "mq"
            : "max";

    const resolved = getYouTubeArtworkUrl(videoId, preferredQuality);
    if (resolved) return resolved;
  }

  // Artists, albums and playlists (no videoId): use the real thumbnail that the
  // source returned for that specific entity instead of the shared default.
  if (candidates.length > 0) {
    return bestThumbnailUrl(candidates);
  }

  const fallback = videoId ? getYouTubeArtworkUrl(videoId, fallbackQuality) : null;
  return fallback || getDefaultArtworkFallbackUrl();
}
