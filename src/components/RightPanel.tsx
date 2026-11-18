"use client";

import React, { useState } from "react";
import {
  Mic2, Play, Pause, ChevronRight, ChevronLeft, Music2,
} from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import { LyricsPanel } from "@/components/LyricsPanel";
import { getTrackArtworkFallbackUrl, getTrackArtworkUrl } from "@/lib/artwork";

interface RightPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RightPanel({ isOpen, onClose }: RightPanelProps) {
  const { currentTrack, isPlaying, togglePlay, queue, playTrack } = usePlayer();
  const [subTab, setSubTab] = useState<"upnext" | "lyrics">("upnext");
  const [isCollapsed, setIsCollapsed] = useState(true);

  if (!isOpen) return null;

  const cover = getTrackArtworkUrl(currentTrack, "max");

  // Collapsed strip matching the left sidebar collapsed width (~60px)
  if (isCollapsed) {
    return (
      <aside className="hidden xl:flex flex-col w-16 h-[calc(100vh-1.5rem)] my-3 mr-3 rounded-2xl overflow-hidden bg-neutral-950/80 backdrop-blur-xl border border-white/5 shadow-2xl transition-all duration-300 select-none z-20 shrink-0 items-center py-3">
        {/* Expand button (chevron pointing left) */}
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer mb-2"
          title="Expand panel"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Small equalizer / music icon */}
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-3 shrink-0">
          <Music2 className="w-4 h-4" />
        </div>

        {/* Divider */}
        <div className="w-8 h-px bg-white/10 mb-3 shrink-0" />

        {/* Current track thumbnail */}
        {currentTrack && (
          <button
            onClick={togglePlay}
            className="relative w-10 h-10 rounded-xl overflow-hidden mb-3 group shrink-0 border border-emerald-500/40 shadow cursor-pointer"
            title={`${currentTrack.title} - ${isPlaying ? "Pause" : "Play"}`}
          >
            <img
              src={cover}
              alt={currentTrack.title}
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.src = getTrackArtworkFallbackUrl(currentTrack, "hq");
              }}
              className="w-full h-full object-cover"
            />
            <div className="theme-dark-surface absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-white text-white" />
              ) : (
                <Play className="w-4 h-4 fill-white text-white ml-0.5" />
              )}
            </div>
          </button>
        )}

        {/* Vertical list of small cover thumbnails for queue */}
        <div className="flex-1 w-full overflow-y-auto overflow-x-hidden flex flex-col items-center gap-2 px-2 scrollbar-hide py-1">
          {queue.map((track, i) => {
            const isCurrent = track.id === currentTrack?.id;
            return (
              <button
                key={`collapsed-q-${track.id}-${i}`}
                onClick={() => playTrack(track, queue)}
                className={`w-9 h-9 rounded-lg overflow-hidden shrink-0 transition-transform hover:scale-105 cursor-pointer border ${
                  isCurrent
                    ? "border-emerald-400 ring-1 ring-emerald-400 shadow-md"
                    : "border-white/10 hover:border-white/30"
                }`}
                title={`${track.title} - ${track.artist}`}
              >
                <img
                  src={getTrackArtworkUrl(track, "max")}
                  alt={track.title}
                  crossOrigin="anonymous"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.src = getTrackArtworkFallbackUrl(track, "hq");
                  }}
                  className="w-full h-full object-cover"
                />
              </button>
            );
          })}
        </div>
      </aside>
    );
  }

  return (
    <aside className="hidden xl:flex flex-col w-80 h-[calc(100vh-1.5rem)] my-3 mr-3 rounded-2xl overflow-hidden bg-neutral-950/80 backdrop-blur-xl border border-white/5 shadow-2xl transition-all duration-300 select-none z-20 shrink-0">
      {/* Header with Music label and collapse button */}
      <div className="p-3 border-b border-white/5 flex items-center justify-between gap-2 shrink-0">
        <span className="font-semibold text-sm text-white flex items-center gap-1.5">
          <Music2 className="w-4 h-4 text-emerald-400" />
          Music
        </span>

        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          title="Collapse panel"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Main Track Presentation */}
      <div className="p-4 border-b border-white/5 shrink-0 flex flex-col items-center text-center">
        <div className="relative w-44 h-44 rounded-2xl overflow-hidden shadow-2xl mb-3 border border-white/10 group bg-neutral-900">
          <img
            src={cover}
            alt={currentTrack?.title || "Now Playing"}
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.src = getTrackArtworkFallbackUrl(currentTrack, "hq");
            }}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          {currentTrack && (
            <button
              onClick={togglePlay}
              className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-emerald-500 text-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-xl hover:scale-110 active:scale-95 cursor-pointer"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-black" /> : <Play className="w-5 h-5 fill-black ml-0.5" />}
            </button>
          )}
        </div>

        <h3 className="font-display font-bold text-base text-white line-clamp-2 max-w-full leading-tight" title={currentTrack?.title || undefined}>
          {currentTrack?.title || "No track playing"}
        </h3>
        <p className="text-xs text-neutral-400 truncate max-w-full mt-1" title={currentTrack?.artist || undefined}>
          {currentTrack?.artist || "Pick a song to start listening"}
        </p>

        {/* Source badge */}
        <div className="flex items-center gap-2 mt-2.5 text-[10px]">
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
            YouTube Music
          </span>
          <span className="text-neutral-500 font-mono">•</span>
          <span className="text-neutral-400 font-mono">320kbps</span>
        </div>
      </div>

      {/* Sub tabs: Up next / Lyrics */}
      <div className="flex items-center justify-center p-2 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-1 bg-neutral-900/60 p-0.5 rounded-xl border border-white/5 w-full">
          <button
            onClick={() => setSubTab("upnext")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              subTab === "upnext"
                ? "bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] shadow-sm"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Up next
          </button>
          <button
            onClick={() => setSubTab("lyrics")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              subTab === "lyrics"
                ? "bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] shadow-sm"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Lyrics
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-2 scrollbar-hide">
        {subTab === "upnext" ? (
          <div className="space-y-1">
            {queue.length === 0 ? (
              <div className="py-12 text-center text-neutral-500 text-xs">
                Queue is empty
              </div>
            ) : (
              queue.map((track, i) => {
                const isCurrent = track.id === currentTrack?.id;
                return (
                  <button
                    key={`${track.id}-${i}`}
                    onClick={() => playTrack(track, queue)}
                    className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-left transition-all cursor-pointer group ${
                      isCurrent
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                        : "hover:bg-white/5 text-neutral-300 hover:text-white"
                    }`}
                  >
                    <img
                      src={getTrackArtworkUrl(track, "max")}
                      alt={track.title}
                      crossOrigin="anonymous"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.src = getTrackArtworkFallbackUrl(track, "hq");
                      }}
                      className="w-10 h-10 rounded-lg object-cover shrink-0 bg-neutral-800 shadow"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate group-hover:text-emerald-400 transition-colors">
                        {track.title}
                      </p>
                      <p className="text-[11px] text-neutral-400 truncate">
                        {track.artist}
                      </p>
                    </div>
                    {isCurrent && isPlaying && (
                      <div className="flex items-end gap-0.5 h-3 shrink-0 mr-1">
                        <span className="w-0.5 bg-emerald-400 h-full animate-pulse" />
                        <span className="w-0.5 bg-emerald-400 h-2/3 animate-pulse delay-75" />
                        <span className="w-0.5 bg-emerald-400 h-4/5 animate-pulse delay-150" />
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        ) : (
          <div className="h-full">
            <LyricsPanel onClose={() => setSubTab("upnext")} variant="panel" />
          </div>
        )}
      </div>
    </aside>
  );
}
