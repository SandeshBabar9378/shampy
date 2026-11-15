import { NextRequest, NextResponse } from "next/server";
import { getRecommendations } from "@/lib/musicProvider";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const artist = searchParams.get("artist") || undefined;
  const genre = searchParams.get("genre") || undefined;

  const tracks = await getRecommendations(artist, genre);
  return NextResponse.json({ recommendations: tracks });
}
