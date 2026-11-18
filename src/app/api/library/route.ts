import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, withTransaction, type Queryable } from "@/lib/db";
import { resolveUserId, rethrowPrerenderSignal } from "@/lib/auth";
import { Track, Playlist, SavedPlaylist, FollowedArtist } from "@/lib/types";

const DEFAULT_PLAYLIST_COVER = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600";
const FALLBACK_COVER = "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600";
const HISTORY_KEEP = 200;
const RECENT_LIMIT = 20;
const IMPORT_LIMIT = 200;

interface TrackRow {
  song_id: string;
  title: string;
  artist: string;
  album: string | null;
  cover_url: string | null;
  duration: number | null;
  youtube_id: string | null;
}

const TRACK_COLUMNS = "song_id, title, artist, album, cover_url, duration, youtube_id";

function rowToTrack(r: TrackRow): Track {
  return {
    id: r.song_id,
    title: r.title,
    artist: r.artist,
    album: r.album || "",
    coverUrl: r.cover_url || "",
    duration: r.duration || 0,
    youtubeId: r.youtube_id || undefined,
  };
}

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : "");

/** Accepts an untrusted track from the client; null if it is unusable. */
function cleanTrack(t: unknown): Track | null {
  if (!t || typeof t !== "object") return null;
  const o = t as Record<string, unknown>;
  const id = str(o.id, 200);
  if (!id || typeof o.title !== "string" || typeof o.artist !== "string") return null;
  return {
    id,
    title: str(o.title),
    artist: str(o.artist),
    album: str(o.album),
    coverUrl: str(o.coverUrl, 1000),
    duration: Number.isFinite(Number(o.duration)) ? Math.max(0, Math.round(Number(o.duration))) : 0,
    youtubeId: str(o.youtubeId, 32) || undefined,
  };
}

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

async function ownsPlaylist(db: Queryable, playlistId: string, userId: string) {
  return Boolean(await db.queryOne("SELECT 1 FROM playlists WHERE id = $1 AND user_id = $2", [playlistId, userId]));
}

export async function GET(req: NextRequest) {
  // Touch request data before the try block (see rethrowPrerenderSignal).
  const claimedId = new URL(req.url).searchParams.get("userId");
  try {
    const userId = await resolveUserId(req, claimedId);
    if (!userId) return bad("userId required");

    const [likedRows, playlistRows, historyRows, recentRows, savedRows, followedRows, downloadRows] =
      await Promise.all([
        query<TrackRow>(`SELECT ${TRACK_COLUMNS} FROM liked_songs WHERE user_id = $1 ORDER BY added_at DESC, id DESC`, [
          userId,
        ]),
        query<{ id: string; name: string; description: string | null; cover_url: string | null }>(
          "SELECT id, name, description, cover_url FROM playlists WHERE user_id = $1 ORDER BY created_at DESC, id",
          [userId],
        ),
        query<{ song_id: string; title: string; artist: string; cover_url: string | null }>(
          "SELECT song_id, title, artist, cover_url FROM listening_history WHERE user_id = $1 ORDER BY id DESC LIMIT 20",
          [userId],
        ),
        // Most recent play of each distinct song, newest first.
        query<TrackRow>(
          `SELECT ${TRACK_COLUMNS} FROM listening_history
            WHERE id IN (SELECT MAX(id) FROM listening_history WHERE user_id = $1 GROUP BY song_id)
            ORDER BY id DESC LIMIT ${RECENT_LIMIT}`,
          [userId],
        ),
        query<{ playlist_id: string; title: string; author: string | null; thumbnail: string | null; track_count: number }>(
          "SELECT playlist_id, title, author, thumbnail, track_count FROM saved_playlists WHERE user_id = $1 ORDER BY added_at, playlist_id",
          [userId],
        ),
        query<{ browse_id: string; name: string; thumbnail: string | null }>(
          "SELECT browse_id, name, thumbnail FROM followed_artists WHERE user_id = $1 ORDER BY added_at, browse_id",
          [userId],
        ),
        query<TrackRow>(`SELECT ${TRACK_COLUMNS} FROM downloads WHERE user_id = $1 ORDER BY added_at DESC`, [userId]),
      ]);

    // One query for every playlist's songs instead of one per playlist.
    const songsByPlaylist = new Map<string, TrackRow[]>();
    if (playlistRows.length > 0) {
      const songs = await query<TrackRow & { playlist_id: string }>(
        `SELECT playlist_id, ${TRACK_COLUMNS} FROM playlist_songs WHERE playlist_id = ANY($1) ORDER BY added_at ASC, id ASC`,
        [playlistRows.map((p) => p.id)],
      );
      for (const s of songs) {
        const list = songsByPlaylist.get(s.playlist_id) ?? [];
        list.push(s);
        songsByPlaylist.set(s.playlist_id, list);
      }
    }

    const playlists: Playlist[] = playlistRows.map((p) => {
      const songs = songsByPlaylist.get(p.id) ?? [];
      return {
        id: p.id,
        name: p.name,
        description: p.description ?? undefined,
        coverUrl: p.cover_url || songs[0]?.cover_url || FALLBACK_COVER,
        trackCount: songs.length,
        tracks: songs.map(rowToTrack),
      };
    });

    const savedPlaylists: SavedPlaylist[] = savedRows.map((s) => ({
      id: s.playlist_id,
      title: s.title,
      author: s.author || "",
      thumbnail: s.thumbnail || "",
      trackCount: s.track_count || 0,
    }));

    const followedArtists: FollowedArtist[] = followedRows.map((a) => ({
      browseId: a.browse_id,
      name: a.name,
      thumbnail: a.thumbnail || "",
    }));

    return NextResponse.json({
      likedSongs: likedRows.map(rowToTrack),
      playlists,
      history: historyRows.map((h) => ({ song_id: h.song_id, title: h.title, artist: h.artist, cover_url: h.cover_url })),
      recentlyPlayed: recentRows.map(rowToTrack),
      savedPlaylists,
      followedArtists,
      downloads: downloadRows.map(rowToTrack),
    });
  } catch (err) {
    rethrowPrerenderSignal(err);
    console.error("API /library GET error:", err);
    return bad("Internal server error", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, playlistId, playlistName, playlistDescription, trackId } = body;

    const userId = await resolveUserId(req, body.userId);
    if (!userId) return bad("userId required");

    const track = cleanTrack(body.track);
    const ok = () => NextResponse.json({ success: true });

    switch (action) {
      case "like": {
        if (!track) return bad("track required");
        await query(
          `INSERT INTO liked_songs (user_id, song_id, title, artist, album, cover_url, duration, youtube_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (user_id, song_id) DO UPDATE SET title = EXCLUDED.title, artist = EXCLUDED.artist,
             album = EXCLUDED.album, cover_url = EXCLUDED.cover_url, duration = EXCLUDED.duration,
             youtube_id = EXCLUDED.youtube_id`,
          [userId, track.id, track.title, track.artist, track.album, track.coverUrl, track.duration, track.youtubeId ?? null],
        );
        return ok();
      }

      case "unlike": {
        if (!track) return bad("track required");
        await query("DELETE FROM liked_songs WHERE user_id = $1 AND song_id = $2", [userId, track.id]);
        return ok();
      }

      case "create_playlist": {
        if (typeof playlistName !== "string" || !playlistName.trim()) return bad("playlistName required");
        const id = "pl_" + crypto.randomBytes(6).toString("hex");
        await query("INSERT INTO playlists (id, user_id, name, description, cover_url) VALUES ($1, $2, $3, $4, $5)", [
          id,
          userId,
          playlistName.trim().slice(0, 100),
          str(playlistDescription, 500),
          DEFAULT_PLAYLIST_COVER,
        ]);
        return NextResponse.json({ success: true, id, name: playlistName });
      }

      case "add_to_playlist": {
        if (!playlistId || !track) return bad("playlistId and track required");
        if (!(await ownsPlaylist({ query, queryOne }, playlistId, userId))) return bad("Playlist not found", 404);
        await query(
          `INSERT INTO playlist_songs (playlist_id, song_id, title, artist, album, cover_url, duration, youtube_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (playlist_id, song_id) DO NOTHING`,
          [playlistId, track.id, track.title, track.artist, track.album, track.coverUrl, track.duration, track.youtubeId ?? null],
        );
        return ok();
      }

      case "remove_from_playlist": {
        if (!playlistId || !trackId) return bad("playlistId and trackId required");
        if (!(await ownsPlaylist({ query, queryOne }, playlistId, userId))) return bad("Playlist not found", 404);
        await query("DELETE FROM playlist_songs WHERE playlist_id = $1 AND song_id = $2", [playlistId, trackId]);
        return ok();
      }

      case "update_playlist": {
        if (!playlistId || typeof playlistName !== "string" || !playlistName.trim()) {
          return bad("playlistId and playlistName required");
        }
        await query("UPDATE playlists SET name = $1, description = $2 WHERE id = $3 AND user_id = $4", [
          playlistName.trim().slice(0, 100),
          str(playlistDescription, 500),
          playlistId,
          userId,
        ]);
        return ok();
      }

      case "delete_playlist": {
        if (!playlistId) return bad("playlistId required");
        await withTransaction(async (tx) => {
          if (!(await ownsPlaylist(tx, playlistId, userId))) return;
          await tx.query("DELETE FROM playlist_songs WHERE playlist_id = $1", [playlistId]);
          await tx.query("DELETE FROM playlists WHERE id = $1 AND user_id = $2", [playlistId, userId]);
        });
        return ok();
      }

      case "record_history": {
        if (!track) return bad("track required");
        await query(
          `INSERT INTO listening_history (user_id, song_id, title, artist, album, cover_url, duration, youtube_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [userId, track.id, track.title, track.artist, track.album, track.coverUrl, track.duration, track.youtubeId ?? null],
        );
        // Keep the table from growing without bound.
        await query(
          `DELETE FROM listening_history WHERE user_id = $1
             AND id < (SELECT MIN(id) FROM (SELECT id FROM listening_history WHERE user_id = $1 ORDER BY id DESC LIMIT ${HISTORY_KEEP}) keep)`,
          [userId],
        );
        return ok();
      }

      case "save_playlist": {
        const p = body.savedPlaylist;
        if (!p || typeof p.id !== "string" || typeof p.title !== "string") return bad("savedPlaylist required");
        await query(
          `INSERT INTO saved_playlists (user_id, playlist_id, title, author, thumbnail, track_count)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (user_id, playlist_id) DO NOTHING`,
          [userId, str(p.id, 200), str(p.title), str(p.author), str(p.thumbnail, 1000), Number(p.trackCount) || 0],
        );
        return ok();
      }

      case "unsave_playlist": {
        if (typeof body.savedPlaylistId !== "string") return bad("savedPlaylistId required");
        await query("DELETE FROM saved_playlists WHERE user_id = $1 AND playlist_id = $2", [userId, body.savedPlaylistId]);
        return ok();
      }

      case "follow_artist": {
        const a = body.artist;
        if (!a || typeof a.browseId !== "string" || !a.browseId) return bad("artist required");
        await query(
          `INSERT INTO followed_artists (user_id, browse_id, name, thumbnail)
           VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, browse_id) DO NOTHING`,
          [userId, str(a.browseId, 200), str(a.name), str(a.thumbnail, 1000)],
        );
        return ok();
      }

      case "unfollow_artist": {
        if (typeof body.browseId !== "string") return bad("browseId required");
        await query("DELETE FROM followed_artists WHERE user_id = $1 AND browse_id = $2", [userId, body.browseId]);
        return ok();
      }

      case "add_download": {
        if (!track) return bad("track required");
        await query(
          `INSERT INTO downloads (user_id, song_id, title, artist, album, cover_url, duration, youtube_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (user_id, song_id) DO NOTHING`,
          [userId, track.id, track.title, track.artist, track.album, track.coverUrl, track.duration, track.youtubeId ?? null],
        );
        return ok();
      }

      case "remove_download": {
        if (typeof trackId !== "string") return bad("trackId required");
        await query("DELETE FROM downloads WHERE user_id = $1 AND song_id = $2", [userId, trackId]);
        return ok();
      }

      // One-time upload of data that only ever existed in this browser's
      // localStorage (saved playlists, followed artists, recents), run when a
      // guest signs in. Additive and idempotent.
      case "import_local": {
        const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, IMPORT_LIMIT) : []);
        await withTransaction(async (tx) => {
          for (const p of list(body.savedPlaylists)) {
            if (!p || typeof p.id !== "string" || typeof p.title !== "string") continue;
            await tx.query(
              `INSERT INTO saved_playlists (user_id, playlist_id, title, author, thumbnail, track_count)
               VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (user_id, playlist_id) DO NOTHING`,
              [userId, str(p.id, 200), str(p.title), str(p.author), str(p.thumbnail, 1000), Number(p.trackCount) || 0],
            );
          }
          for (const a of list(body.followedArtists)) {
            if (!a || typeof a.browseId !== "string" || !a.browseId) continue;
            await tx.query(
              `INSERT INTO followed_artists (user_id, browse_id, name, thumbnail)
               VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, browse_id) DO NOTHING`,
              [userId, str(a.browseId, 200), str(a.name), str(a.thumbnail, 1000)],
            );
          }
          // Oldest first so the newest local play ends up most recent.
          const recents = list(body.recentlyPlayed).map(cleanTrack).filter((t): t is Track => t !== null).reverse();
          for (const t of recents) {
            await tx.query(
              `INSERT INTO listening_history (user_id, song_id, title, artist, album, cover_url, duration, youtube_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [userId, t.id, t.title, t.artist, t.album, t.coverUrl, t.duration, t.youtubeId ?? null],
            );
          }
        });
        return ok();
      }

      default:
        return bad("Invalid action");
    }
  } catch (err) {
    console.error("API /library POST error:", err);
    return bad("Internal server error", 500);
  }
}
