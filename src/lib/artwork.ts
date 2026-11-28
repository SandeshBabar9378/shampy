import type { DataMode } from "@/lib/dataMode";

const YOUTUBE_THUMBNAIL_BASE = "https://i.ytimg.com";

export type YouTubeArtworkQuality = "mq" | "hq" | "sd" | "max";

const YOUTUBE_THUMBNAIL_SUFFIXES: Record<YouTubeArtworkQuality, string> = {
  mq: "mqdefault.jpg",
  hq: "hqdefault.jpg",
  sd: "sddefault.jpg",
  max: "maxresdefault.jpg",
};

/**
 * Low data mode always asks YouTube for mqdefault (320×180), the smallest
 * thumbnail the helper offers. High mode keeps the caller's requested quality.
 */
function qualityForMode(
  quality: YouTubeArtworkQuality,
  mode: DataMode,
): YouTubeArtworkQuality {
  return mode === "low" ? "mq" : quality;
}

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

/** Low mode asks for the smallest real thumbnail the source advertised. */
function smallestThumbnailUrl(
  candidates: { url: string; width: number; height: number }[],
): string {
  let smallest = candidates[0];
  let smallestArea = smallest.width * smallest.height;

  for (let i = 1; i < candidates.length; i += 1) {
    const area = candidates[i].width * candidates[i].height;
    if (area < smallestArea) {
      smallest = candidates[i];
      smallestArea = area;
    }
  }

  return smallest.url;
}

/**
 * Downgrade an artwork URL that came back from an API. Only known YouTube
 * thumbnail URLs are rewritten; other providers keep their original URL.
 */
export function fitArtworkUrlToMode(url: string, mode: DataMode): string {
  if (mode !== "low" || !url.includes("i.ytimg.com")) return url;
  return url.replace(/\/(maxres|sd|hq)default\.jpg(?=[?#]|$)/, "/mqdefault.jpg");
}

const DEFAULT_ARTWORK_FALLBACK = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format";

export function getYouTubeArtworkUrl(
  videoId: string | undefined,
  // hq is the reliable 480x360 thumbnail. maxres is often missing (it returns
  // a 120x90 placeholder), so UI callers use hq and low mode uses mq.
  quality: YouTubeArtworkQuality = "hq",
  mode: DataMode = "high",
): string | null {
  if (!videoId) return null;
  const effectiveQuality = qualityForMode(quality, mode);
  return `${YOUTUBE_THUMBNAIL_BASE}/vi/${videoId}/${YOUTUBE_THUMBNAIL_SUFFIXES[effectiveQuality]}`;
}

export function getDefaultArtworkFallbackUrl(): string {
  return DEFAULT_ARTWORK_FALLBACK;
}

/**
 * Artist/album/playlist artwork returned by YouTube Music legitimately lives on
 * yt3/lh3.googleusercontent.com. Rejecting that whole host replaced every one
 * of those per-entity covers with the same editorial still, which is why most
 * cards showed one fallback while a few i.ytimg.com covers loaded. Keep the
 * real URL; each <img> already has an onError fallback for URLs that truly die.
 */
export function normalizeArtworkUrl(url: string | null | undefined): string {
  const value = (url || "").trim();
  if (!/^(https?:\/\/|\/)/i.test(value)) return getDefaultArtworkFallbackUrl();
  return value;
}

export function getTrackArtworkUrl(
  track: { youtubeId?: string; coverUrl?: string } | null | undefined,
  quality: YouTubeArtworkQuality = "hq",
  mode: DataMode = "high",
): string {
  const youtubeUrl = track?.youtubeId
    ? getYouTubeArtworkUrl(track.youtubeId, quality, mode)
    : null;
  return youtubeUrl || track?.coverUrl || getDefaultArtworkFallbackUrl();
}

/**
 * A local, guaranteed-to-render second step after a remote artwork fails.
 * Callers keep the same signature; the track/quality arguments are accepted so
 * no call site has to guess a fallback quality that may also 404.
 */
export function getTrackArtworkFallbackUrl(
  _track: { youtubeId?: string; coverUrl?: string } | null | undefined,
  _quality: YouTubeArtworkQuality = "hq",
  _mode: DataMode = "high",
): string {
  void _track;
  void _quality;
  void _mode;
  return "/placeholder.svg";
}

/**
 * Mobile artwork resolver.
 *
 * Unlike the desktop helper, this keeps the artwork URL that came with the
 * track (including downloaded/offline metadata) instead of recomputing a
 * YouTube thumbnail from `youtubeId` on every render. The same song therefore
 * keeps the same URL across online/offline playback, Next/Previous and seeks,
 * so the browser does not reload or blink the image.
 */
export function getStableTrackArtworkUrl(
  track: { youtubeId?: string; coverUrl?: string } | null | undefined,
  quality: YouTubeArtworkQuality = "hq",
  mode: DataMode = "high",
): string {
  // In Low mode recompute the smallest YouTube thumbnail so artwork that came
  // back from an API as a maxres URL is not downloaded at full size.
  if (mode === "low") {
    const lowQualityUrl = track?.youtubeId
      ? getYouTubeArtworkUrl(track.youtubeId, "mq", "low")
      : null;
    return lowQualityUrl || fitArtworkUrlToMode(track?.coverUrl || "", mode) || getDefaultArtworkFallbackUrl();
  }
  if (track?.coverUrl) return track.coverUrl;
  return getTrackArtworkUrl(track, quality, mode);
}

/** One-shot fallback for mobile images; never swaps between qualities. */
export function getStableArtworkFallbackUrl(): string {
  // Local and guaranteed to exist; no extra network request in data-saver mode.
  return "/placeholder.svg";
}

/** Avoid reloading the fallback when the fallback itself fails to decode. */
export function applyStableArtworkFallback(image: HTMLImageElement): void {
  const fallback = getStableArtworkFallbackUrl();
  let absolute = fallback;
  try {
    absolute = new URL(fallback, typeof window === "undefined" ? undefined : window.location.href).href;
  } catch {
    // Fallback is already an absolute URL in practice.
  }
  if (image.src !== absolute) image.src = fallback;
}

export function getYouTubeThumbnailUrl(
  thumbnails: { url?: string; width?: number; height?: number }[] = [],
  videoId?: string,
  fallbackQuality: YouTubeArtworkQuality = "hq",
  mode: DataMode = "high",
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

  // Tracks always have a videoId. Use the caller's reliable quality (hq by
  // default) instead of maxres: maxresdefault is frequently a 120×90 blank
  // placeholder and would also break Low mode's bandwidth budget.
  if (videoId) {
    const resolved = getYouTubeArtworkUrl(videoId, fallbackQuality, mode);
    if (resolved) return resolved;
  }

  // Artists, albums and playlists (no videoId): use the real thumbnail that the
  // source returned for that specific entity instead of the shared default.
  if (candidates.length > 0) {
    const chosen = mode === "low" ? smallestThumbnailUrl(candidates) : bestThumbnailUrl(candidates);
    return normalizeArtworkUrl(fitArtworkUrlToMode(chosen, mode));
  }

  const fallback = videoId ? getYouTubeArtworkUrl(videoId, fallbackQuality, mode) : null;
  return fallback || getDefaultArtworkFallbackUrl();
}
