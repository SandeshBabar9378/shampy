"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, ListMusic, Play, Plus, Check, MoreVertical, X } from "lucide-react";
import { AnimatedShuffle } from "@/components/animations/MotionIcons";
import { usePlayer } from "@/context/PlayerContext";
import { TrackRow } from "@/components/TrackRow";
import { DownloadStatusList } from "@/components/DownloadStatusList";
import { Track, SavedPlaylist } from "@/lib/types";
import { getDefaultArtworkFallbackUrl } from "@/lib/artwork";
import { DOWNLOAD_TEST_NOTE, isDownloadTestPlaylistId } from "@/lib/testDownloadProvider";

interface PlaylistTrack {
  videoId: string;
  title: string;
  artist: string;
  album: string;
  thumbnail: string;
  duration: number;
}

interface PlaylistData {
  id: string;
  title: string;
  author: string;
  thumbnail: string;
  trackCount: number;
  tracks: PlaylistTrack[];
}

function toTrack(item: PlaylistTrack): Track {
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

export function PlaylistView({ id }: { id: string }) {
  const router = useRouter();
  const {
    playTrack,
    playShuffledQueue,
    isShuffle,
    savedPlaylists,
    toggleSavedPlaylist,
    downloadTestPlaylist,
    hideDownloadTestPlaylist,
    downloadTracks,
    offlineIds,
  } = usePlayer();
  const [playlist, setPlaylist] = useState<PlaylistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const isTestPlaylist = isDownloadTestPlaylistId(id);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDownloadNotice(null);

    if (isTestPlaylist) {
      const tracks = downloadTestPlaylist.tracks || [];
      setPlaylist({
        id,
        title: downloadTestPlaylist.name,
        author: "Temporary test provider",
        thumbnail: downloadTestPlaylist.coverUrl || getDefaultArtworkFallbackUrl(),
        trackCount: tracks.length,
        tracks: tracks.map((track) => ({
          videoId: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album,
          thumbnail: track.coverUrl,
          duration: track.duration,
        })),
      });
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    fetch(`/api/playlist?id=${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body: { error?: string } = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load playlist");
        }
        return res.json() as Promise<PlaylistData>;
      })
      .then((data) => {
        if (!cancelled) setPlaylist(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || "Failed to load playlist");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, isTestPlaylist, downloadTestPlaylist]);

  // Test fixtures keep their original Track fields (catalogue/API rows are lossy).
  const tracks: Track[] = isTestPlaylist
    ? downloadTestPlaylist.tracks ?? []
    : playlist
      ? playlist.tracks.map(toTrack)
      : [];
  const isSaved = savedPlaylists.some((p) => p.id === id);

  const savedPlaylistPayload: SavedPlaylist | null = playlist
    ? {
        id: playlist.id,
        title: playlist.title,
        author: playlist.author,
        thumbnail: playlist.thumbnail,
        trackCount: playlist.trackCount || tracks.length,
      }
    : null;

  const handleToggleSave = () => {
    if (savedPlaylistPayload) toggleSavedPlaylist(savedPlaylistPayload);
    setShowHeaderMenu(false);
  };

  const downloadedCount = tracks.filter((track) => offlineIds.has(track.id)).length;

  const handleDownloadPlaylist = async () => {
    if (!playlist || tracks.length === 0) return;
    const result = await downloadTracks(tracks, {
      kind: "playlist",
      id: `playlist:${id}`,
      title: playlist.title,
      index: 0,
      total: tracks.length,
      artworkUrl: playlist.thumbnail || undefined,
      author: playlist.author || undefined,
    });
    if (result.batchId === "mobile-only") {
      setDownloadNotice("Downloads are available in the mobile app only.");
    } else if (result.unavailable.length === tracks.length) {
      setDownloadNotice("No songs in this playlist have a legal download source.");
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
              <p className="text-xs font-mono">Loading playlist...</p>
            </div>
          ) : error || !playlist ? (
            <div className="py-24 text-center">
              <ListMusic className="w-16 h-16 mx-auto mb-4 text-neutral-600" />
              <p className="text-lg font-bold text-white">Could not load playlist</p>
              <p className="text-xs text-neutral-400 mt-1.5">{error || "Playlist not found"}</p>
            </div>
          ) : (
            <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-200">
              {/* Playlist header */}
              <div className="relative flex flex-col sm:flex-row items-center sm:items-end gap-4 sm:gap-6 p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-white/10 shadow-2xl bg-gradient-to-b from-neutral-800/70 to-neutral-950/40">
                <div className="w-[120px] h-[120px] sm:w-[200px] sm:h-[200px] rounded-lg overflow-hidden shadow-2xl shrink-0 bg-neutral-800">
                  {playlist.thumbnail ? (
                    <img
                      src={playlist.thumbnail}
                      alt={playlist.title}
                      crossOrigin="anonymous"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.src = getDefaultArtworkFallbackUrl();
                      }}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ListMusic className="w-20 h-20 text-neutral-600" />
                    </div>
                  )}
                </div>

                <div className="text-center sm:text-left flex-1 min-w-0">
                  <p className="text-[10px] sm:text-xs uppercase font-bold tracking-wider text-emerald-400 font-mono">
                    PLAYLIST{isTestPlaylist ? " • TEMPORARY TEST" : ""}
                  </p>
                  <h1 className="font-display text-3xl sm:text-5xl font-bold text-white mt-1 mb-1.5 sm:mb-2 tracking-tight break-words leading-tight line-clamp-2">
                    {playlist.title}
                  </h1>
                  <p className="text-sm text-neutral-300 flex items-center justify-center sm:justify-start gap-2">
                    <span className="font-semibold text-white">{playlist.author}</span>
                    <span>•</span>
                    <span>{playlist.trackCount || tracks.length} songs</span>
                  </p>
                  {isTestPlaylist && (
                    <div className="sm:hidden mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-left">
                      <p className="text-[11px] leading-snug text-amber-200">{DOWNLOAD_TEST_NOTE}</p>
                      <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
                        <Link href="/album/download-test-samples" className="text-emerald-300 underline">
                          Open test album
                        </Link>
                        <button
                          onClick={() => {
                            hideDownloadTestPlaylist();
                            router.push("/");
                          }}
                          className="inline-flex items-center gap-1 text-neutral-300 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                          Hide test playlist
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Header three-dot menu (right side; laptop only) */}
                <div className="hidden md:block absolute top-4 right-4">
                  <button
                    onClick={() => setShowHeaderMenu((value) => !value)}
                    className="p-2 text-neutral-400 hover:text-white transition-colors cursor-pointer rounded-full hover:bg-white/10"
                    title="More options"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                  {showHeaderMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setShowHeaderMenu(false)}
                      />
                      <div className="absolute right-0 top-11 w-52 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl p-1 z-40 flex flex-col text-xs text-neutral-200">
                        <button
                          onClick={handleToggleSave}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-neutral-800 flex items-center gap-2 cursor-pointer"
                        >
                          {isSaved ? (
                            <>
                              <Check className="w-4 h-4" />
                              Remove from library
                            </>
                          ) : (
                            <>
                              <Plus className="w-4 h-4" />
                              Save playlist
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Play, Shuffle, Save and Download actions */}
              <div className="flex items-center gap-3 sm:gap-4">
                {tracks.length > 0 && (
                  <>
                    <button
                      onClick={() => playTrack(tracks[0], tracks)}
                      className="w-14 h-14 rounded-full bg-emerald-500 text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl shadow-emerald-500/20 cursor-pointer"
                      title="Play Playlist"
                      aria-label="Play Playlist"
                    >
                      <Play className="w-6 h-6 fill-black ml-0.5" />
                    </button>
                    <button
                      onClick={() => void playShuffledQueue(tracks)}
                      aria-pressed={isShuffle}
                      aria-label="Shuffle Playlist"
                      className={`w-11 h-11 rounded-full border flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer ${
                        isShuffle
                          ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-300 shadow-lg shadow-emerald-500/10"
                          : "border-white/10 bg-neutral-900 text-neutral-300 hover:text-white hover:border-white/20"
                      }`}
                      title={isShuffle ? "Shuffle is on" : "Shuffle Playlist"}
                    >
                      <AnimatedShuffle active={isShuffle} className="w-5 h-5" />
                    </button>
                  </>
                )}
                <button
                  onClick={handleToggleSave}
                  className={`p-1.5 transition-colors cursor-pointer ${
                    isSaved ? "text-emerald-400" : "text-neutral-500 hover:text-white"
                  }`}
                  title={isSaved ? "Remove from library" : "Save to library"}
                >
                  {isSaved ? <Check className="w-4 h-4 text-emerald-400" /> : <Plus className="w-4 h-4" />}
                </button>
                {tracks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleDownloadPlaylist()}
                    className="ml-auto w-11 h-11 shrink-0 rounded-full border border-white/15 bg-neutral-900/70 text-neutral-300 flex items-center justify-center hover:border-emerald-400/50 hover:bg-emerald-500/10 hover:text-emerald-300 active:scale-95 active:bg-emerald-500/20 transition-all cursor-pointer"
                    title="Download Playlist"
                    aria-label="Download Playlist"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                )}
              </div>
              {downloadNotice && (
                <p className="text-xs text-emerald-300">{downloadNotice}</p>
              )}
              <p className="sm:hidden text-[11px] text-neutral-500">
                {downloadedCount}/{tracks.length} songs downloaded on this device
              </p>

              {/* Track list: number, cover, title + artist, duration, 3-dot (right) */}
              <div className="bg-neutral-950/40 rounded-2xl border border-neutral-900/60 p-2 divide-y divide-neutral-900">
                {tracks.length === 0 ? (
                  <div className="py-16 text-center text-neutral-500">
                    <ListMusic className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-base font-semibold text-neutral-300">This playlist has no tracks</p>
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
