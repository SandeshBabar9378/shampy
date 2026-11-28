import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_STREAM_QUALITY, parseStreamQuality, resolveAudioStream, type StreamQuality } from "@/lib/ytStream";

export async function GET(req: NextRequest) {
  let videoId = "";
  let quality: StreamQuality = DEFAULT_STREAM_QUALITY;
  try {
    const { searchParams } = new URL(req.url);
    videoId = searchParams.get("videoId") || "";
    quality = parseStreamQuality(searchParams.get("quality"));
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

    const result = await resolveAudioStream(videoId, { quality });

    if (result.status === "error") {
      return NextResponse.json(
        { error: "Failed to fetch stream from YouTube", streamUrl: null, videoId, quality },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (result.streamUrl) {
      return NextResponse.json({
        streamUrl: result.streamUrl,
        videoId,
        mimeType: result.mimeType,
        bitrate: result.bitrate,
        itag: result.itag,
        quality,
      }, { headers: { "Cache-Control": "no-store" } });
    }

    // Return videoId if stream signature cipher is applied
    return NextResponse.json({
      streamUrl: null,
      videoId,
      quality,
      message: "Direct stream protected; client uses YouTube player / iframe fallback",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("API /stream error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
