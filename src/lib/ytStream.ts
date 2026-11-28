// Resolves a direct audio stream URL for a YouTube video via the InnerTube
// Android client. Shared by /api/stream (returns the URL) and /api/download
// (proxies the bytes).

export const YT_ANDROID_UA = "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip";

export type StreamQuality = "low" | "high";
export const DEFAULT_STREAM_QUALITY: StreamQuality = "high";

/** Missing or unknown values always mean high, matching the saved default. */
export function parseStreamQuality(value: string | null | undefined): StreamQuality {
  return value === "low" ? "low" : DEFAULT_STREAM_QUALITY;
}

export type StreamResult =
  | { status: "error" }
  | {
      status: "ok";
      streamUrl: string | null;
      mimeType?: string;
      bitrate?: number;
      itag?: number;
      quality: StreamQuality;
    };

interface YtFormat {
  itag?: number;
  url?: string;
  mimeType?: string;
  /** InnerTube reports this in bits per second. */
  bitrate?: number;
  /** Some responses only report this, in kilobits per second. */
  audioBitrate?: number;
}

function formatBps(format: YtFormat): number {
  if (typeof format.bitrate === "number" && format.bitrate > 0) return format.bitrate;
  if (typeof format.audioBitrate === "number" && format.audioBitrate > 0) {
    return format.audioBitrate * 1000;
  }
  return 0;
}

// 48–80 kbps covers the small AAC/Opus audio-only formats (for example itag
// 139/48 at ~48 kbps and itag 249/250 at ~50–70 kbps) without picking a
// broken/near-silent stream. If YouTube offers nothing in this band we still
// take the lowest playable audio-only format.
const LOW_TARGET_MIN_BPS = 40_000;
const LOW_TARGET_MAX_BPS = 80_000;

function selectLowBitrateAudio(formats: YtFormat[]): YtFormat | undefined {
  const playable = formats.filter((format) => format.url && formatBps(format) > 0);
  if (playable.length === 0) return undefined;

  const target = playable.filter((format) => {
    const bps = formatBps(format);
    return bps >= LOW_TARGET_MIN_BPS && bps <= LOW_TARGET_MAX_BPS;
  });
  const candidates = target.length > 0 ? target : playable;

  // AAC in MP4 is the safest bet across browsers; Opus/WebM is the fallback.
  return [...candidates].sort((a, b) => {
    const aMp4 = a.mimeType?.startsWith("audio/mp4") ? 0 : 1;
    const bMp4 = b.mimeType?.startsWith("audio/mp4") ? 0 : 1;
    return aMp4 - bMp4 || formatBps(a) - formatBps(b);
  })[0];
}

export async function resolveAudioStream(
  videoId: string,
  options: { preferMp4?: boolean; quality?: StreamQuality } = {},
): Promise<StreamResult> {
  const quality = parseStreamQuality(options.quality);

  const ytResponse = await fetch("https://www.youtube.com/youtubei/v1/player", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": YT_ANDROID_UA,
      "X-YouTube-Client-Name": "3",
      "X-YouTube-Client-Version": "19.09.37",
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: "ANDROID",
          clientVersion: "19.09.37",
          androidSdkVersion: 30,
          hl: "en",
          gl: "US",
        },
      },
      videoId,
    }),
  });

  if (!ytResponse.ok) return { status: "error" };

  const data = await ytResponse.json();
  const allFormats: YtFormat[] = [
    ...(data?.streamingData?.adaptiveFormats || []),
    ...(data?.streamingData?.formats || []),
  ];

  // Audio formats with a direct playable URL, best bitrate first.
  const audioFormats = allFormats
    .filter((f) => typeof f?.mimeType === "string" && f.mimeType.startsWith("audio/") && f.url)
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

  if (quality === "low") {
    const low = selectLowBitrateAudio(audioFormats);
    if (low?.url) {
      return {
        status: "ok",
        streamUrl: low.url,
        mimeType: low.mimeType,
        bitrate: low.bitrate,
        itag: low.itag,
        quality,
      };
    }
  } else {
    // AAC in MP4 plays in every browser; WebM/Opus does not play in older Safari.
    // This is the original high-quality selection, unchanged.
    const best = options.preferMp4
      ? (audioFormats.find((f) => f.mimeType?.startsWith("audio/mp4")) ?? audioFormats[0])
      : audioFormats[0];

    if (best?.url) {
      return {
        status: "ok",
        streamUrl: best.url,
        mimeType: best.mimeType,
        bitrate: best.bitrate,
        itag: best.itag,
        quality,
      };
    }
  }

  const fallback = allFormats.find((f) => f?.url);
  if (fallback?.url) {
    return {
      status: "ok",
      streamUrl: fallback.url,
      mimeType: fallback.mimeType,
      itag: fallback.itag,
      quality,
    };
  }

  // Signature-ciphered streams: the client falls back to the YouTube iframe.
  return { status: "ok", streamUrl: null, quality };
}
