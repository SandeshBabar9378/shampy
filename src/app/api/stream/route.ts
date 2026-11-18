import { NextRequest, NextResponse } from "next/server";
import { resolveAudioStream } from "@/lib/ytStream";

export async function GET(req: NextRequest) {
  let videoId = "";
  try {
    const { searchParams } = new URL(req.url);
    videoId = searchParams.get("videoId") || "";
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

    const result = await resolveAudioStream(videoId);

    if (result.status === "error") {
      return NextResponse.json(
        { error: "Failed to fetch stream from YouTube", streamUrl: null, videoId },
        { status: 502 }
      );
    }

    if (result.streamUrl) {
      return NextResponse.json({
        streamUrl: result.streamUrl,
        videoId,
        mimeType: result.mimeType,
        bitrate: result.bitrate,
      });
    }

    // Return videoId if stream signature cipher is applied
    return NextResponse.json({
      streamUrl: null,
      videoId,
      message: "Direct stream protected; client uses YouTube player / iframe fallback",
    });
  } catch (error) {
    console.error("API /stream error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
