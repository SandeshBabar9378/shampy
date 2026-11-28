"use client";

import React from "react";
import { Play } from "lucide-react";
import { Playlist } from "@/lib/types";
import { PlaylistCollage } from "./PlaylistCollage";

interface PlaylistCardProps {
  playlist: Playlist;
  onClick: () => void;
  onPlay?: () => void;
  /** Small visual variant so repeated shelves do not read as identical cards. */
  variant?: number;
  className?: string;
}

export function PlaylistCard({ playlist, onClick, onPlay, variant = 0, className = "" }: PlaylistCardProps) {
  const getPlaylistTrackCount = (playlistId: string): number => {
    if (typeof window === "undefined") return playlist.tracks?.length ?? playlist.trackCount ?? 0;
    try {
      const stored = localStorage.getItem("shubhu_playlists") || localStorage.getItem("playlists") || "[]";
      const playlists: Playlist[] = JSON.parse(stored);
      const found = playlists.find((p) => p.id === playlistId);
      return found?.tracks?.length ?? playlist.tracks?.length ?? playlist.trackCount ?? 0;
    } catch {
      return playlist.tracks?.length ?? playlist.trackCount ?? 0;
    }
  };

  const trackCount = getPlaylistTrackCount(playlist.id);

  return (
    <div
      onClick={onClick}
      className={`card-variant-${variant % 4} ${className || "w-[160px] sm:w-[172px] md:w-[180px] shrink-0"} group relative flex max-w-none flex-col bg-neutral-900/50 hover:bg-neutral-800/80 p-3.5 rounded-2xl transition-all duration-300 cursor-pointer border border-white/5 hover:border-[var(--theme-accent)]/20 shadow-md hover:shadow-2xl hover:-translate-y-1.5 select-none`}
    >
      <div className="relative aspect-square w-full rounded-xl overflow-hidden mb-3 bg-neutral-800 shadow-md">
        <PlaylistCollage
          tracks={playlist.tracks}
          fallbackCoverUrl={playlist.coverUrl}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />

        {onPlay && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
            className="absolute bottom-2.5 right-2.5 w-10 h-10 bg-[var(--theme-accent)] rounded-full flex items-center justify-center text-[var(--theme-accent-contrast)] shadow-xl shadow-[0_18px_45px_-20px_rgba(var(--theme-accent-rgb),0.5)] opacity-100 transition-transform duration-300 hover:scale-110 active:scale-95 cursor-pointer"
            title="Play Playlist"
          >
            <Play className="w-4 h-4 fill-black ml-0.5" />
          </button>
        )}
      </div>

      <h3 className="font-semibold text-white text-sm truncate mb-0.5 group-hover:text-emerald-400 transition-colors">
        {playlist.name}
      </h3>
      <p className="text-xs text-neutral-400 truncate">
        {playlist.description || `${trackCount} songs`}
      </p>
    </div>
  );
}
