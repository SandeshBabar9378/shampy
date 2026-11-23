"use client";

import React, { useEffect, useState } from "react";
import { Play, Pause, MoreVertical, X, ListPlus, ListEnd, ListStart, Trash2, Download, DownloadCloud } from "lucide-react";
import { AnimatedHeart, AnimatedListPlus } from "@/components/animations/MotionIcons";
import { useRouter } from "next/navigation";
import { Track } from "@/lib/types";
import { usePlayer } from "@/context/PlayerContext";
import { getTrackArtworkFallbackUrl, getTrackArtworkUrl } from "@/lib/artwork";
import { useDownload } from "@/hooks/useDownload";
import { DOWNLOADS_ENABLED } from "@/lib/features";

interface TrackRowProps {
  track: Track;
  index: number;
  queue?: Track[];
  onPlayOverride?: () => void;
  showSimilarBadge?: boolean;
  playlistId?: string;
  /** Let the song/artist/album text wrap instead of truncating (used by search results). */
  wrapText?: boolean;
}

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "3:20";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function TrackRow({ track, index, queue, onPlayOverride, showSimilarBadge, playlistId, wrapText = false }: TrackRowProps) {
  const router = useRouter();
  const dl = useDownload(track);
  const { currentTrack, isPlaying, playTrack, togglePlay, likedSongIds, toggleLike, playlists, addToPlaylist, queue: appQueue, setAppQueue, playNext, removeFromPlaylist } = usePlayer();
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [showMobilePlaylistMenu, setShowMobilePlaylistMenu] = useState(false);
  const [showDesktopMenu, setShowDesktopMenu] = useState(false);
  const [showMenuPlaylists, setShowMenuPlaylists] = useState(false);
  const [addedSuccess, setAddedSuccess] = useState(false);
  const [bottomSheetOpen, setBottomSheetOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(id);
  }, []);

  const isCurrent = currentTrack?.id === track.id;
  // likedSongIds is hydrated from localStorage in PlayerContext, so it is
  // empty during SSR and may be populated on the client's first render.
  // Keep the like button identical until after mount, then adopt the real value.
  const isLiked = mounted && likedSongIds.has(track.id);

  const closeMenus = () => {
    setBottomSheetOpen(false);
    setShowDesktopMenu(false);
    setShowPlaylistMenu(false);
    setShowMobilePlaylistMenu(false);
    setShowMenuPlaylists(false);
  };

  const handlePlay = () => {
    if (onPlayOverride) {
      onPlayOverride();
    } else if (isCurrent) {
      togglePlay();
    } else {
      playTrack(track, queue);
    }
  };

  const handleAddToPlaylist = async (plId: string) => {
    await addToPlaylist(plId, track);
    closeMenus();
    setAddedSuccess(true);
    setTimeout(() => setAddedSuccess(false), 2000);
  };

  const handleAddToQueue = () => {
    if (!appQueue.some((item) => item.id === track.id)) {
      setAppQueue([...appQueue, track]);
    }
    closeMenus();
  };

  const handlePlayNext = () => {
    playNext(track);
    closeMenus();
  };

  const handleCreatePlaylist = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("shubhu:create-playlist", { detail: { track } }),
      );
    }
    closeMenus();
  };

  const handleRemoveFromPlaylist = async () => {
    if (!playlistId) return;
    await removeFromPlaylist(playlistId, track.id);
    closeMenus();
  };

  return (
    <>
      <div
        onClick={handlePlay}
        style={{ animationDelay: `${Math.min(index, 14) * 26}ms` }}
        className={`group relative flex items-center justify-between px-3 py-2.5 rounded-xl transition-all select-none text-sm cursor-pointer shubhu-row-in ${
          isCurrent
            ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
            : "hover:bg-white/5 border border-transparent"
        }`}
      >
        {/* 1. Index & Track Info */}
        <div className={`flex items-center gap-2.5 sm:gap-4 min-w-0 pr-2 ${wrapText ? "flex-[1.6]" : "flex-1"}`}>
          <div className="w-6 text-center text-neutral-400 md:group-hover:hidden text-xs font-mono shrink-0">
            {isCurrent && isPlaying ? (
              <span className="w-3 h-3 block mx-auto bg-emerald-400 animate-pulse rounded-full" />
            ) : (
              index + 1
            )}
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePlay();
            }}
            className="w-6 text-center hidden md:group-hover:flex items-center justify-center text-white cursor-pointer shrink-0"
          >
            {isCurrent && isPlaying ? (
              <Pause className="w-4 h-4 fill-white" />
            ) : (
              <Play className="w-4 h-4 fill-white" />
            )}
          </button>

          <img
            src={getTrackArtworkUrl(track, "max")}
            alt={track.title}
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.src = getTrackArtworkFallbackUrl(track, "hq");
            }}
            className="w-10 h-10 rounded object-cover bg-neutral-800 shrink-0"
          />

          <div className="min-w-0 flex-1">
            <p
              title={wrapText ? track.title : undefined}
              className={`flex-1 min-w-0 font-medium ${wrapText ? "line-clamp-2 leading-snug" : "truncate"} hover:underline ${
                isCurrent ? "text-emerald-400" : "text-white"
              }`}
            >
              {track.title}
            </p>
            <p
              className={`text-xs text-neutral-400 ${wrapText ? "truncate" : "truncate"} hover:text-white ${track.artistId ? "cursor-pointer hover:underline" : ""}`}
              onClick={(e) => {
                if (track.artistId) {
                  e.stopPropagation();
                  router.push(`/artist/${track.artistId}`);
                }
              }}
              title={wrapText ? track.artist : (track.artistId ? "Go to artist page" : undefined)}
            >
              {track.artist}
            </p>
            {showSimilarBadge && (
              <span className="mt-0.5 inline-block text-[10px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded font-mono" title="Plays similar songs next">
                ~ Similar
              </span>
            )}
          </div>
        </div>

        {/* 2. Album Name */}
        <div
          className={`hidden md:block flex-1 min-w-0 text-neutral-400 text-xs pr-4 ${wrapText ? "break-words" : "truncate"}`}
          title={wrapText ? track.album || "Single" : undefined}
        >
          {track.album || "Single"}
        </div>

        {/* 3. Actions & Duration */}
        <div className="flex items-center gap-2 shrink-0 relative">
          {/* Desktop hover actions: Heart */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleLike(track);
            }}
            className={`hidden md:block shubhu-like-btn p-1.5 transition-colors cursor-pointer opacity-0 pointer-events-none md:group-hover:opacity-100 md:pointer-events-auto ${
              isLiked ? "text-emerald-500" : "text-neutral-500 hover:text-white"
            }`}
            title={isLiked ? "Liked" : "Like"}
          >
            <AnimatedHeart filled={isLiked} className="w-4 h-4" />
          </button>

          {/* Desktop hover actions: Add to Playlist */}
          <div className="relative hidden md:block opacity-0 pointer-events-none md:group-hover:opacity-100 md:pointer-events-auto">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowPlaylistMenu(!showPlaylistMenu);
              }}
              className={`p-1.5 transition-opacity cursor-pointer ${
                addedSuccess ? "text-emerald-400" : "text-neutral-500 hover:text-white"
              }`}
              title="Add to Playlist"
            >
              <AnimatedListPlus added={addedSuccess} className="w-4 h-4" />
            </button>

            {showPlaylistMenu && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-8 w-44 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl p-1 z-30"
              >
                <p className="text-[10px] uppercase font-semibold text-neutral-500 px-2 py-1">Add to Playlist</p>
                {playlists.length === 0 ? (
                  <p className="text-xs text-neutral-500 px-2 py-1 italic">No playlists</p>
                ) : (
                  playlists.map((pl) => (
                    <button
                      key={pl.id}
                      onClick={() => handleAddToPlaylist(pl.id)}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-neutral-800 text-xs text-neutral-200 truncate cursor-pointer"
                    >
                      {pl.name}
                    </button>
                  ))
                )}
                <button
                  onClick={handleCreatePlaylist}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-neutral-800 text-xs text-emerald-400 truncate cursor-pointer border-t border-neutral-800 mt-1"
                >
                  + Create new playlist
                </button>
              </div>
            )}
          </div>

          {/* Duration: text-sm, text-right, text-neutral-400 */}
          <span className="text-sm text-neutral-400 font-mono w-10 text-right">
            {formatDuration(track.duration)}
          </span>

          {/* Three-dot (MoreVertical) AFTER duration: always visible on mobile, visible on hover desktop */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setBottomSheetOpen(true);
              setShowDesktopMenu(true);
            }}
            className="flex items-center justify-center p-1.5 text-neutral-400 hover:text-white cursor-pointer md:opacity-0 md:group-hover:opacity-100 transition-opacity"
            title="More options"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {/* Desktop three-dot menu */}
          {showDesktopMenu && (
            <>
              <div
                className="hidden md:block fixed inset-0 z-30"
                onClick={(e) => {
                  e.stopPropagation();
                  closeMenus();
                }}
              />
              <div
                onClick={(e) => e.stopPropagation()}
                className="hidden md:flex absolute right-0 top-9 w-52 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl p-1 z-40 flex-col text-xs text-neutral-200"
              >
                <button
                  onClick={handlePlayNext}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-neutral-800 flex items-center gap-2 cursor-pointer"
                >
                  <ListStart className="w-4 h-4" />
                  Play next
                </button>
                <button
                  onClick={handleAddToQueue}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-neutral-800 flex items-center gap-2 cursor-pointer"
                >
                  <ListEnd className="w-4 h-4" />
                  Add to queue
                </button>
                <button
                  onClick={() => setShowMenuPlaylists((value) => !value)}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-neutral-800 flex items-center gap-2 cursor-pointer"
                >
                  <ListPlus className="w-4 h-4" />
                  Add to playlist
                </button>
                {showMenuPlaylists && (
                  <div className="border-t border-neutral-800 mt-1 pt-1 max-h-40 overflow-y-auto">
                    {playlists.map((pl) => (
                      <button
                        key={pl.id}
                        onClick={() => handleAddToPlaylist(pl.id)}
                        className="w-full text-left px-3 py-1.5 rounded hover:bg-neutral-800 truncate cursor-pointer"
                      >
                        {pl.name}
                      </button>
                    ))}
                    <button
                      onClick={handleCreatePlaylist}
                      className="w-full text-left px-3 py-1.5 rounded hover:bg-neutral-800 text-emerald-400 truncate cursor-pointer"
                    >
                      + Create new playlist
                    </button>
                  </div>
                )}
                {playlistId && (
                  <button
                    onClick={handleRemoveFromPlaylist}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-neutral-800 flex items-center gap-2 text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    Remove from this playlist
                  </button>
                )}
                {DOWNLOADS_ENABLED && (
                  <>
                <button
                  onClick={() => {
                    void dl.toggle();
                    if (!dl.error) setTimeout(closeMenus, 0);
                  }}
                  disabled={dl.busy}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-neutral-800 flex items-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-default"
                >
                  {dl.offline ? <DownloadCloud className="w-4 h-4 text-emerald-400" /> : <Download className="w-4 h-4" />}
                  {dl.label}
                </button>
                {dl.inList && !dl.offline && !dl.busy && (
                  <button
                    onClick={() => {
                      void dl.removeFromList();
                      closeMenus();
                    }}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-neutral-800 flex items-center gap-2 text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    Remove from downloads
                  </button>
                )}
                  </>
                )}
                <button
                  onClick={() => {
                    toggleLike(track);
                    closeMenus();
                  }}
                  className="w-full text-left shubhu-like-btn px-2 py-1.5 rounded hover:bg-neutral-800 flex items-center gap-2 cursor-pointer border-t border-neutral-800 mt-1"
                >
                  <span className={isLiked ? "text-emerald-500" : ""}>
                    <AnimatedHeart filled={isLiked} className="w-4 h-4" />
                  </span>
                  {isLiked ? "Unlike" : "Like"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Mobile Bottom Sheet */}
      {bottomSheetOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 md:hidden flex flex-col justify-end"
          onClick={() => {
            setBottomSheetOpen(false);
            setShowMobilePlaylistMenu(false);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="fixed inset-x-0 bottom-0 z-50 bg-[var(--color-neutral-900)] rounded-t-2xl p-4 flex flex-col gap-4 md:hidden text-[var(--color-neutral-50)] shadow-2xl animate-in slide-in-from-bottom duration-200"
          >
            <div className="flex items-center gap-3 pb-2 border-b border-neutral-700">
              <img
                src={getTrackArtworkUrl(track, "max")}
                alt={track.title}
                crossOrigin="anonymous"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.src = getTrackArtworkFallbackUrl(track, "hq");
                }}
                className="w-12 h-12 rounded object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm truncate">{track.title}</p>
                <p className="text-xs text-neutral-400 truncate">{track.artist}</p>
              </div>
              <button
                onClick={() => {
                  setBottomSheetOpen(false);
                  setShowMobilePlaylistMenu(false);
                }}
                className="p-1 text-neutral-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!showMobilePlaylistMenu ? (
              <>
                <button
                  onClick={handlePlayNext}
                  className="flex items-center gap-3 text-left py-2 px-1 text-sm font-medium hover:text-emerald-400 cursor-pointer"
                >
                  <ListStart className="w-5 h-5" />
                  <span>Play next</span>
                </button>
                <button
                  onClick={handleAddToQueue}
                  className="flex items-center gap-3 text-left py-2 px-1 text-sm font-medium hover:text-emerald-400 cursor-pointer"
                >
                  <ListEnd className="w-5 h-5" />
                  <span>Add to queue</span>
                </button>
                <button
                  onClick={() => setShowMobilePlaylistMenu(true)}
                  className="flex items-center gap-3 text-left py-2 px-1 text-sm font-medium hover:text-emerald-400 cursor-pointer"
                >
                  <ListPlus className="w-5 h-5" />
                  <span>Add to Playlist</span>
                </button>
                <div className="sm:hidden space-y-2">
                  <button
                    onClick={() => {
                      void dl.toggle().then((message) => message && closeMenus());
                    }}
                    disabled={dl.busy}
                    className="flex items-center gap-3 text-left py-2 px-1 text-sm font-medium hover:text-emerald-400 cursor-pointer disabled:opacity-60"
                  >
                    {dl.offline ? <DownloadCloud className="w-5 h-5 text-emerald-400" /> : <Download className="w-5 h-5" />}
                    <span>{dl.label}</span>
                  </button>
                  {dl.busy && (
                    <button
                      onClick={() => dl.cancel()}
                      className="flex items-center gap-3 text-left py-2 px-1 text-sm font-medium text-rose-400 hover:text-rose-300 cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                      <span>Cancel download</span>
                    </button>
                  )}
                  {dl.status === "failed" && (
                    <button
                      onClick={() => dl.retry()}
                      className="flex items-center gap-3 text-left py-2 px-1 text-sm font-medium hover:text-emerald-400 cursor-pointer"
                    >
                      <Download className="w-5 h-5" />
                      <span>Retry download</span>
                    </button>
                  )}
                  {dl.inList && !dl.offline && !dl.busy && (
                    <button
                      onClick={() => {
                        void dl.removeFromList();
                        closeMenus();
                      }}
                      className="flex items-center gap-3 text-left py-2 px-1 text-sm font-medium text-rose-400 hover:text-rose-300 cursor-pointer"
                    >
                      <Trash2 className="w-5 h-5" />
                      <span>Remove from downloads</span>
                    </button>
                  )}
                  {dl.error && (
                    <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                      <span className="flex-1">{dl.error}</span>
                      <button onClick={dl.clearError} className="p-0.5 cursor-pointer" aria-label="Dismiss error">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => toggleLike(track)}
                  className="flex items-center gap-3 text-left shubhu-like-btn py-2 px-1 text-sm font-medium hover:text-emerald-400 cursor-pointer"
                >
                  <span className={isLiked ? "text-emerald-500" : ""}>
                    <AnimatedHeart filled={isLiked} className="w-5 h-5" />
                  </span>
                  <span>{isLiked ? "Unlike" : "Like"}</span>
                </button>
                {playlistId && (
                  <button
                    onClick={handleRemoveFromPlaylist}
                    className="flex items-center gap-3 text-left py-2 px-1 text-sm font-medium text-rose-400 hover:text-rose-300 cursor-pointer"
                  >
                    <Trash2 className="w-5 h-5" />
                    <span>Remove from this playlist</span>
                  </button>
                )}
                <button
                  onClick={closeMenus}
                  className="flex items-center gap-3 text-left py-2 px-1 text-sm text-neutral-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                  <span>Close</span>
                </button>
              </>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-1">
                  <p className="text-xs uppercase font-semibold text-neutral-400">Choose Playlist</p>
                  <button
                    onClick={() => setShowMobilePlaylistMenu(false)}
                    className="text-xs text-emerald-400 hover:underline cursor-pointer"
                  >
                    Back
                  </button>
                </div>
                {playlists.length === 0 ? (
                  <p className="text-xs text-neutral-400 py-2 italic">No playlists found. Create one first!</p>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {playlists.map((pl) => (
                      <button
                        key={pl.id}
                        onClick={() => handleAddToPlaylist(pl.id)}
                        className="w-full text-left p-2.5 rounded-lg bg-neutral-800/80 hover:bg-neutral-700 text-sm truncate cursor-pointer"
                      >
                        {pl.name}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={handleCreatePlaylist}
                  className="w-full text-left p-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-sm text-emerald-400 cursor-pointer"
                >
                  + Create new playlist
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
