import { NextRequest, NextResponse } from "next/server";

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

    // Query YouTube InnerTube Android client for player stream data
    const ytResponse = await fetch("https://www.youtube.com/youtubei/v1/player", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip",
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
        videoId: videoId,
      }),
    });

    if (!ytResponse.ok) {
      return NextResponse.json(
        { error: "Failed to fetch stream from YouTube", streamUrl: null, videoId },
        { status: 502 }
      );
    }

    const data = await ytResponse.json();
    const adaptiveFormats = data?.streamingData?.adaptiveFormats || [];
    const regularFormats = data?.streamingData?.formats || [];
    const allFormats = [...adaptiveFormats, ...regularFormats];

    // Find audio formats (audio/mp4, audio/webm) with direct playable URL
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const audioFormats = allFormats.filter((f: any) =>
      typeof f?.mimeType === "string" && f.mimeType.startsWith("audio/") && f.url
    );

    // Sort by audio bitrate descending
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    audioFormats.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

    if (audioFormats.length > 0 && audioFormats[0].url) {
      return NextResponse.json({
        streamUrl: audioFormats[0].url,
        videoId,
        mimeType: audioFormats[0].mimeType,
        bitrate: audioFormats[0].bitrate,
      });
    }

    // Fallback: check regular format with direct url
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fallbackFormat = allFormats.find((f: any) => f?.url);
    if (fallbackFormat?.url) {
      return NextResponse.json({
        streamUrl: fallbackFormat.url,
        videoId,
        mimeType: fallbackFormat.mimeType,
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
