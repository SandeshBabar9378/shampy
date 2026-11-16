"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Disc3, Play } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import { Player } from "@/components/Player";
import { TrackRow } from "@/components/TrackRow";
import { Track } from "@/lib/types";

interface AlbumTrack {
  videoId: string;
  title: string;
  artist: string;
  album: string;
  thumbnail: string;
  duration: number;
}

interface AlbumData {
  title: string;
  author: string;
  thumbnail: string;
  tracks: AlbumTrack[];
}

function toTrack(item: AlbumTrack): Track {
  return {
    id: item.videoId,
    title: item.title,
    artist: item.artist,
    album: item.album,
    coverUrl: item.thumbnail || "/placeholder.svg",
    duration: item.duration || 0,
    youtubeId: item.videoId,
  };
}

export function AlbumView({ id }: { id: string }) {
  const { playTrack } = usePlayer();
  const [album, setAlbum] = useState<AlbumData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/album?id=${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body: { error?: string } = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load album");
        }
        return res.json() as Promise<AlbumData>;
      })
      .then((data) => {
        if (!cancelled) setAlbum(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || "Failed to load album");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const tracks: Track[] = album ? album.tracks.map(toTrack) : [];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-black text-white">
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-gradient-to-b from-neutral-900 via-neutral-950 to-black">
        <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-4 sm:py-6 pb-44 sm:pb-32 scrollbar-thin scrollbar-thumb-neutral-800">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors mb-3 sm:mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>

          {loading ? (
            <div className="py-24 text-center text-neutral-400">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs font-mono">Loading album...</p>
            </div>
          ) : error || !album ? (
            <div className="py-24 text-center">
              <Disc3 className="w-16 h-16 mx-auto mb-4 text-neutral-600" />
              <p className="text-lg font-bold text-white">Could not load album</p>
              <p className="text-xs text-neutral-400 mt-1.5">{error || "Album not found"}</p>
            </div>
          ) : (
            <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-200">
              {/* Album header */}
              <div className="relative flex flex-col sm:flex-row items-center sm:items-end gap-4 sm:gap-6 p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-white/10 shadow-2xl bg-gradient-to-b from-neutral-800/70 to-neutral-950/40">
                <div className="w-[120px] h-[120px] sm:w-[200px] sm:h-[200px] rounded-lg overflow-hidden shadow-2xl shrink-0 bg-neutral-800">
                  {album.thumbnail ? (
                    <img
                      src={album.thumbnail}
                      alt={album.title}
                      crossOrigin="anonymous"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.src = "/placeholder.svg";
                      }}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Disc3 className="w-20 h-20 text-neutral-600" />
                    </div>
                  )}
                </div>

                <div className="text-center sm:text-left flex-1 min-w-0">
                  <p className="text-[10px] sm:text-xs uppercase font-bold tracking-wider text-emerald-400 font-mono">ALBUM</p>
                  <h1 className="font-display text-3xl sm:text-5xl font-bold text-white mt-1 mb-1.5 sm:mb-2 tracking-tight break-words leading-tight line-clamp-2">
                    {album.title}
                  </h1>
                  <p className="text-sm text-neutral-300">
                    <span className="font-semibold text-white">{album.author}</span>
                    <span> • </span>
                    <span>{tracks.length} songs</span>
                  </p>
                </div>
              </div>

              {/* Play action */}
              <div className="flex items-center gap-4">
                {tracks.length > 0 && (
                  <button
                    onClick={() => playTrack(tracks[0], tracks)}
                    className="w-14 h-14 rounded-full bg-emerald-500 text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl shadow-emerald-500/20 cursor-pointer"
                    title="Play Album"
                  >
                    <Play className="w-6 h-6 fill-black ml-0.5" />
                  </button>
                )}
              </div>

              {/* Track list */}
              <div className="bg-neutral-950/40 rounded-2xl border border-neutral-900/60 p-2 divide-y divide-neutral-900">
                {tracks.length === 0 ? (
                  <div className="py-16 text-center text-neutral-500">
                    <Disc3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-base font-semibold text-neutral-300">No tracks found</p>
                  </div>
                ) : (
                  tracks.map((track, index) => (
                    <TrackRow key={track.id} track={track} index={index} queue={tracks} />
                  ))
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      <Player />
    </div>
  );
}
