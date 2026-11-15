import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { Track, Playlist } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const db = getDb();

  // 1. Fetch Liked Songs
  const likedRows = db.prepare(
    "SELECT song_id, title, artist, album, cover_url, duration, youtube_id FROM liked_songs WHERE user_id = ? ORDER BY added_at DESC"
  ).all(userId) as any[];

  const likedSongs: Track[] = likedRows.map((r) => ({
    id: r.song_id,
    title: r.title,
    artist: r.artist,
    album: r.album || "",
    coverUrl: r.cover_url || "",
    duration: r.duration || 0,
    youtubeId: r.youtube_id || undefined,
  }));

  // 2. Fetch User Custom Playlists
  const playlistRows = db.prepare(
    "SELECT id, name, description, cover_url FROM playlists WHERE user_id = ? ORDER BY created_at DESC"
  ).all(userId) as any[];

  const playlists: Playlist[] = playlistRows.map((p) => {
    const songs = db.prepare(
      "SELECT song_id, title, artist, album, cover_url, duration, youtube_id FROM playlist_songs WHERE playlist_id = ? ORDER BY added_at ASC"
    ).all(p.id) as any[];

    return {
      id: p.id,
      name: p.name,
      description: p.description,
      coverUrl: p.cover_url || (songs[0]?.cover_url ?? "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600"),
      trackCount: songs.length,
      tracks: songs.map((s) => ({
        id: s.song_id,
        title: s.title,
        artist: s.artist,
        album: s.album || "",
        coverUrl: s.cover_url || "",
        duration: s.duration || 0,
        youtubeId: s.youtube_id || undefined,
      })),
    };
  });

  // 3. Fetch Listening History
  const historyRows = db.prepare(
    "SELECT song_id, title, artist, cover_url FROM listening_history WHERE user_id = ? ORDER BY played_at DESC LIMIT 20"
  ).all(userId) as any[];

  return NextResponse.json({
    likedSongs,
    playlists,
    history: historyRows,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, userId, track, playlistId, playlistName, playlistDescription, trackId } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const db = getDb();

    switch (action) {
      case "like": {
        if (!track || !track.id) return NextResponse.json({ error: "track required" }, { status: 400 });
        db.prepare(
          "INSERT OR REPLACE INTO liked_songs (user_id, song_id, title, artist, album, cover_url, duration, youtube_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          userId,
          track.id,
          track.title,
          track.artist,
          track.album || "",
          track.coverUrl || "",
          track.duration || 0,
          track.youtubeId || null
        );
        return NextResponse.json({ success: true });
      }

      case "unlike": {
        if (!track || !track.id) return NextResponse.json({ error: "track required" }, { status: 400 });
        db.prepare("DELETE FROM liked_songs WHERE user_id = ? AND song_id = ?").run(userId, track.id);
        return NextResponse.json({ success: true });
      }

      case "create_playlist": {
        if (!playlistName) return NextResponse.json({ error: "playlistName required" }, { status: 400 });
        const id = "pl_" + Math.random().toString(36).substring(2, 9);
        db.prepare(
          "INSERT INTO playlists (id, user_id, name, description, cover_url) VALUES (?, ?, ?, ?, ?)"
        ).run(
          id,
          userId,
          playlistName,
          playlistDescription || "",
          "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600"
        );
        return NextResponse.json({ success: true, id, name: playlistName });
      }

      case "add_to_playlist": {
        if (!playlistId || !track) return NextResponse.json({ error: "playlistId and track required" }, { status: 400 });
        db.prepare(
          "INSERT OR REPLACE INTO playlist_songs (playlist_id, song_id, title, artist, album, cover_url, duration, youtube_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          playlistId,
          track.id,
          track.title,
          track.artist,
          track.album || "",
          track.coverUrl || "",
          track.duration || 0,
          track.youtubeId || null
        );
        return NextResponse.json({ success: true });
      }

      case "remove_from_playlist": {
        if (!playlistId || !trackId) {
          return NextResponse.json(
            { error: "playlistId and trackId required" },
            { status: 400 },
          );
        }
        db.prepare(
          "DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?"
        ).run(playlistId, trackId);
        return NextResponse.json({ success: true });
      }

      case "update_playlist": {
        if (!playlistId || !playlistName) {
          return NextResponse.json(
            { error: "playlistId and playlistName required" },
            { status: 400 },
          );
        }
        db.prepare(
          "UPDATE playlists SET name = ?, description = ? WHERE id = ? AND user_id = ?"
        ).run(playlistName, playlistDescription || "", playlistId, userId);
        return NextResponse.json({ success: true });
      }

      case "delete_playlist": {
        if (!playlistId) {
          return NextResponse.json({ error: "playlistId required" }, { status: 400 });
        }
        db.prepare("DELETE FROM playlist_songs WHERE playlist_id = ?").run(playlistId);
        db.prepare("DELETE FROM playlists WHERE id = ? AND user_id = ?").run(playlistId, userId);
        return NextResponse.json({ success: true });
      }

      case "record_history": {
        if (!track) return NextResponse.json({ error: "track required" }, { status: 400 });
        db.prepare(
          "INSERT INTO listening_history (user_id, song_id, title, artist, cover_url) VALUES (?, ?, ?, ?, ?)"
        ).run(userId, track.id, track.title, track.artist, track.coverUrl || "");
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
