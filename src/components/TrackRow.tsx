"use client";

import React, { useState } from "react";
import { Play, Pause, Heart, Plus, Check, MoreVertical, X, ListPlus, ListEnd, ListStart, Trash2 } from "lucide-react";
import { Track } from "@/lib/types";
import { usePlayer } from "@/context/PlayerContext";

interface TrackRowProps {
  track: Track;
  index: number;
  queue?: Track[];
  onPlayOverride?: () => void;
  showSimilarBadge?: boolean;
  playlistId?: string;
}

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "3:20";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function TrackRow({ track, index, queue, onPlayOverride, showSimilarBadge, playlistId }: TrackRowProps) {
  const { currentTrack, isPlaying, playTrack, togglePlay, likedSongIds, toggleLike, playlists, addToPlaylist, queue: appQueue, setAppQueue, playNext, removeFromPlaylist } = usePlayer();
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [showMobilePlaylistMenu, setShowMobilePlaylistMenu] = useState(false);
  const [showDesktopMenu, setShowDesktopMenu] = useState(false);
  const [showMenuPlaylists, setShowMenuPlaylists] = useState(false);
  const [addedSuccess, setAddedSuccess] = useState(false);
  const [bottomSheetOpen, setBottomSheetOpen] = useState(false);

  const isCurrent = currentTrack?.id === track.id;
  const isLiked = likedSongIds.has(track.id);

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
        className="group relative flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-neutral-800/60 transition-colors select-none text-sm cursor-pointer"
      >
        {/* 1. Index & Track Info */}
        <div className="flex items-center gap-2.5 sm:gap-4 flex-1 min-w-0 pr-2">
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
            src={track.coverUrl || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300"}
            alt={track.title}
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.src = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=200&auto=format";
            }}
            className="w-10 h-10 rounded object-cover bg-neutral-800 shrink-0"
          />

          <div className="min-w-0 flex-1">
            <p
              className={`flex-1 min-w-0 font-medium truncate hover:underline ${
                isCurrent ? "text-emerald-400" : "text-white"
              }`}
            >
              {track.title}
            </p>
            <p className="text-xs text-neutral-400 truncate hover:text-white hover:underline">
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
        <div className="hidden md:block flex-1 text-neutral-400 text-xs truncate pr-4">
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
            className={`p-1.5 transition-colors cursor-pointer opacity-0 pointer-events-none md:group-hover:opacity-100 md:pointer-events-auto ${
              isLiked ? "text-emerald-500" : "text-neutral-500 hover:text-white"
            }`}
            title={isLiked ? "Liked" : "Like"}
          >
            <Heart className={`w-4 h-4 ${isLiked ? "fill-emerald-500" : ""}`} />
          </button>

          {/* Desktop hover actions: Add to Playlist */}
          <div className="relative opacity-0 pointer-events-none md:group-hover:opacity-100 md:pointer-events-auto">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowPlaylistMenu(!showPlaylistMenu);
              }}
              className="p-1.5 text-neutral-500 hover:text-white transition-opacity cursor-pointer"
              title="Add to Playlist"
            >
              {addedSuccess ? <Check className="w-4 h-4 text-emerald-400" /> : <Plus className="w-4 h-4" />}
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
                <button
                  onClick={() => {
                    toggleLike(track);
                    closeMenus();
                  }}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-neutral-800 flex items-center gap-2 cursor-pointer border-t border-neutral-800 mt-1"
                >
                  <Heart className={`w-4 h-4 ${isLiked ? "fill-emerald-500 text-emerald-500" : ""}`} />
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
            className="fixed inset-x-0 bottom-0 z-50 bg-[#282828] rounded-t-2xl p-4 flex flex-col gap-4 md:hidden text-white shadow-2xl animate-in slide-in-from-bottom duration-200"
          >
            <div className="flex items-center gap-3 pb-2 border-b border-neutral-700">
              <img
                src={track.coverUrl || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300"}
                alt={track.title}
                crossOrigin="anonymous"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.src = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=200&auto=format";
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
                <button
                  onClick={() => toggleLike(track)}
                  className="flex items-center gap-3 text-left py-2 px-1 text-sm font-medium hover:text-emerald-400 cursor-pointer"
                >
                  <Heart className={`w-5 h-5 ${isLiked ? "fill-emerald-500 text-emerald-500" : ""}`} />
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
