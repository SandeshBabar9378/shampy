import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimited } from "@/lib/auth";
import { isValidVideoId } from "@/lib/videoId";
import { YT_ANDROID_UA, resolveAudioStream } from "@/lib/ytStream";
import { DOWNLOADS_ENABLED } from "@/lib/features";

// Streams a song's audio bytes to the browser so it can be stored on the
// device for offline playback. The browser cannot fetch googlevideo URLs
// directly (no CORS), so the server relays them.
export async function GET(req: NextRequest) {
  if (!DOWNLOADS_ENABLED) {
    return NextResponse.json({ error: "Downloads are paused for now." }, { status: 503 });
  }

  const videoId = new URL(req.url).searchParams.get("videoId") || "";
  if (!isValidVideoId(videoId)) {
    return NextResponse.json({ error: "A valid videoId is required" }, { status: 400 });
  }

  // This endpoint relays bandwidth, so keep a single client from abusing it.
  if (rateLimited(`download:${clientIp(req)}`, 60, 60 * 60_000)) {
    return NextResponse.json({ error: "Too many downloads. Try again later." }, { status: 429 });
  }

  try {
    const stream = await resolveAudioStream(videoId, { preferMp4: true });
    if (stream.status === "error" || !stream.streamUrl) {
      return NextResponse.json(
        { error: "This song can't be downloaded (YouTube didn't provide a direct audio stream)." },
        { status: 502 },
      );
    }

    const upstream = await fetch(stream.streamUrl, {
      headers: { "User-Agent": YT_ANDROID_UA, Range: "bytes=0-" },
    });
    if (!upstream.body || (!upstream.ok && upstream.status !== 206)) {
      return NextResponse.json({ error: "Audio source refused the download." }, { status: 502 });
    }

    const headers: Record<string, string> = {
      "Content-Type": (stream.mimeType || "audio/mp4").split(";")[0],
      "Cache-Control": "private, no-store",
    };
    const length = upstream.headers.get("content-length");
    if (length) headers["Content-Length"] = length;

    return new Response(upstream.body, { headers });
  } catch (err) {
    console.error("API /download error:", err);
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
