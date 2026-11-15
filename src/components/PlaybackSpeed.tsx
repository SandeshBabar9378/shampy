"use client";

import React from "react";
import { Gauge, X } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";

interface PlaybackSpeedProps {
  onClose?: () => void;
}

export function PlaybackSpeed({ onClose }: PlaybackSpeedProps) {
  const { playbackRate, setPlaybackRate, availableRates } = usePlayer();

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 w-56 shadow-2xl text-white select-none">
      <div className="flex items-center justify-between mb-3 border-b border-neutral-800 pb-2">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold">Playback Speed</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-neutral-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {availableRates.map((speed) => (
          <button
            key={speed}
            onClick={() => setPlaybackRate(speed)}
            className={`py-1.5 px-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              playbackRate === speed
                ? "bg-emerald-500 text-black font-bold"
                : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
            }`}
          >
            {speed}x
          </button>
        ))}
      </div>
    </div>
  );
}
