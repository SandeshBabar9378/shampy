"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Disc3, DownloadCloud, Play } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import { TrackRow } from "@/components/TrackRow";
import { DownloadStatusList } from "@/components/DownloadStatusList";
import { Track } from "@/lib/types";
import { getDefaultArtworkFallbackUrl } from "@/lib/artwork";
import { getDownloadTestAlbum } from "@/lib/testDownloadProvider";

const TEST_ALBUM_ID = "download-test-samples";

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
    coverUrl: item.thumbnail || getDefaultArtworkFallbackUrl(),
    duration: item.duration || 0,
    youtubeId: item.videoId,
  };
}

function testAlbumData(): AlbumData {
  const album = getDownloadTestAlbum();
  return {
    title: album.title,
    author: album.author,
    thumbnail: album.coverUrl || getDefaultArtworkFallbackUrl(),
    tracks: album.tracks.map((track) => ({
      videoId: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      thumbnail: track.coverUrl,
      duration: track.duration,
    })),
  };
}

export function AlbumView({ id }: { id: string }) {
  const { playTrack, downloadTracks, offlineIds } = usePlayer();
  const [album, setAlbum] = useState<AlbumData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDownloadNotice(null);

    if (id === TEST_ALBUM_ID) {
      setAlbum(testAlbumData());
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

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

  // Test fixtures keep their original Track fields (catalogue/API rows are lossy).
  const testTracks = id === TEST_ALBUM_ID ? getDownloadTestAlbum().tracks : [];
  const tracks: Track[] = testTracks.length > 0
    ? testTracks
    : album
      ? album.tracks.map(toTrack)
      : [];
  const downloadedCount = tracks.filter((track) => offlineIds.has(track.id)).length;

  const handleDownloadAlbum = async () => {
    if (!album || tracks.length === 0) return;
    const result = await downloadTracks(tracks, {
      kind: "album",
      id: `album:${id}`,
      title: album.title,
      index: 0,
      total: tracks.length,
      artworkUrl: album.thumbnail || undefined,
      author: album.author || undefined,
    });
    if (result.unavailable.length === tracks.length) {
      setDownloadNotice("No songs in this album have a legal download source.");
    } else if (result.added.length > 0) {
      setDownloadNotice(`Downloading ${result.added.length} of ${tracks.length} songs…`);
    } else {
      setDownloadNotice(
        result.duplicates.length > 0
          ? "Those songs are already downloaded or queued."
          : "Nothing to download here.",
      );
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-gradient-to-b from-neutral-900 via-neutral-950 to-[var(--background)]">
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-4 sm:py-6 pb-[calc(var(--player-height)+24px)] scrollbar-thin scrollbar-thumb-neutral-800">
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
                        e.currentTarget.src = getDefaultArtworkFallbackUrl();
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
                {tracks.length > 0 && (
                  <button
                    onClick={() => void handleDownloadAlbum()}
                    className="sm:hidden flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-300 cursor-pointer"
                  >
                    <DownloadCloud className="w-4 h-4" />
                    Download Album
                  </button>
                )}
              </div>
              {downloadNotice && (
                <p className="sm:hidden text-xs text-emerald-300">{downloadNotice}</p>
              )}
              <p className="sm:hidden text-[11px] text-neutral-500">
                {downloadedCount}/{tracks.length} songs downloaded on this device
              </p>

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
              <DownloadStatusList tracks={tracks} />
            </div>
          )}
      </main>
    </div>
  );
}
