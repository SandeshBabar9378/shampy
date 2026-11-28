import { NextRequest, NextResponse } from "next/server";
import {
  getDefaultArtworkFallbackUrl,
  getYouTubeThumbnailUrl,
} from "@/lib/artwork";
import type { DataMode } from "@/lib/dataMode";

interface FormattedNextResult {
  videoId: string;
  title: string;
  artist: string;
  album: string;
  thumbnail: string;
  duration: number;
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

export async function GET(req: NextRequest) {
  let videoId = "";
  let mode: DataMode = "high";
  try {
    const { searchParams } = new URL(req.url);
    videoId = searchParams.get("videoId") || "";
    mode = searchParams.get("mode") === "low" ? "low" : "high";
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
    if (!videoId.trim()) {
      return NextResponse.json({ error: "videoId is required" }, { status: 400 });
    }

    // Call InnerTube v1/next endpoint with WEB_REMIX client and radio playlist
    const ytResponse = await fetch("https://music.youtube.com/youtubei/v1/next", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://music.youtube.com/",
        Origin: "https://music.youtube.com",
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB_REMIX",
            clientVersion: "1.20240101.01.00",
            hl: "en",
            gl: "US",
          },
        },
        videoId: videoId,
        playlistId: `RDAMVM${videoId}`,
        isAudioOnly: true,
      }),
    });

    if (!ytResponse.ok) {
      return NextResponse.json([], { status: 200 });
    }

    const data = await ytResponse.json();
    const results: FormattedNextResult[] = [];

    // Parse tabs / playlist panel from response
    // tabs[0].tabRenderer.content.musicQueueRenderer.content.playlistPanelRenderer.contents
    const musicQueue =
      data?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer
        ?.watchNextTabbedResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.musicQueueRenderer;

    const playlistContents =
      musicQueue?.content?.playlistPanelRenderer?.contents ||
      data?.continuationContents?.playlistPanelContinuation?.contents ||
      [];

    if (Array.isArray(playlistContents)) {
      for (const item of playlistContents) {
        const renderer = item?.playlistPanelVideoRenderer;
        if (!renderer) continue;

        const itemVideoId = renderer?.videoId;
        const title = renderer?.title?.runs?.[0]?.text || "";
        const subRuns = renderer?.longBylineText?.runs || [];

        let artist = "";
        let album = "";
        if (subRuns.length > 0) {
          const runTexts = subRuns
            .map((r: { text: string }) => r.text)
            .filter((t: string) => t !== " • " && t !== "•");
          artist = runTexts[0] || "";
          if (runTexts.length > 1) {
            album = runTexts[1] || "";
          }
        }

        const durationText = renderer?.lengthText?.runs?.[0]?.text || "";
        const duration = parseDuration(durationText);
        const thumbs = renderer?.thumbnail?.thumbnails || [];
        const thumbnail = getYouTubeThumbnailUrl(thumbs, itemVideoId, "hq", mode);

        if (itemVideoId && title) {
          results.push({
            videoId: itemVideoId,
            title,
            artist: artist || "Unknown Artist",
            album: album || "",
            thumbnail: thumbnail || getDefaultArtworkFallbackUrl(),
            duration: duration || 0,
          });
        }
      }
    }

    return NextResponse.json(results.slice(0, mode === "low" ? 8 : 20));
  } catch (error) {
    console.error("API /next error:", error);
    return NextResponse.json([], { status: 500 });
  }
}
