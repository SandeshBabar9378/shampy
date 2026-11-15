"use client";

import React from "react";
import { Play } from "lucide-react";
import { Playlist } from "@/lib/types";
import { PlaylistCollage } from "./PlaylistCollage";

interface PlaylistCardProps {
  playlist: Playlist;
  onClick: () => void;
  onPlay?: () => void;
}

export function PlaylistCard({ playlist, onClick, onPlay }: PlaylistCardProps) {
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
      className="group relative bg-neutral-900/60 hover:bg-neutral-800/80 p-4 rounded-xl transition-all duration-200 cursor-pointer flex flex-col border border-neutral-800/40 hover:border-neutral-700/60 shadow-sm hover:shadow-xl hover:scale-105"
    >
      <div className="relative aspect-square w-full rounded-lg overflow-hidden mb-4 bg-neutral-800 shadow-md">
        <PlaylistCollage
          tracks={playlist.tracks}
          fallbackCoverUrl={playlist.coverUrl}
          className="w-full h-full"
        />

        {onPlay && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
            className="absolute bottom-2 right-2 w-11 h-11 bg-emerald-500 rounded-full flex items-center justify-center text-black shadow-xl shadow-black/40 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
            title="Play Playlist"
          >
            <Play className="w-5 h-5 fill-black ml-0.5" />
          </button>
        )}
      </div>

      <h3 className="font-semibold text-white text-base truncate mb-1">
        {playlist.name}
      </h3>
      <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed">
        {playlist.description || `${trackCount} tracks`}
      </p>
    </div>
  );
}
