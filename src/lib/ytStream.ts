// Resolves a direct audio stream URL for a YouTube video via the InnerTube
// Android client. Shared by /api/stream (returns the URL) and /api/download
// (proxies the bytes).

export const YT_ANDROID_UA = "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip";

export type StreamResult =
  | { status: "error" }
  | { status: "ok"; streamUrl: string | null; mimeType?: string; bitrate?: number };

interface YtFormat {
  url?: string;
  mimeType?: string;
  bitrate?: number;
}

export async function resolveAudioStream(
  videoId: string,
  options: { preferMp4?: boolean } = {},
): Promise<StreamResult> {
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

  // AAC in MP4 plays in every browser; WebM/Opus does not play in older Safari.
  const best = options.preferMp4
    ? (audioFormats.find((f) => f.mimeType?.startsWith("audio/mp4")) ?? audioFormats[0])
    : audioFormats[0];

  if (best?.url) {
    return { status: "ok", streamUrl: best.url, mimeType: best.mimeType, bitrate: best.bitrate };
  }

  const fallback = allFormats.find((f) => f?.url);
  if (fallback?.url) {
    return { status: "ok", streamUrl: fallback.url, mimeType: fallback.mimeType };
  }

  // Signature-ciphered streams: the client falls back to the YouTube iframe.
  return { status: "ok", streamUrl: null };
}
