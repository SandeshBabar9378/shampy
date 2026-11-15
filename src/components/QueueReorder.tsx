"use client";

import React from "react";
import { ChevronUp, ChevronDown, ListMusic, X } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import { Track } from "@/lib/types";

interface QueueReorderProps {
  onClose?: () => void;
}

export function QueueReorder({ onClose }: QueueReorderProps) {
  const { queue, currentTrack, playTrack, setAppQueue } = usePlayer();

  const handleMove = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= queue.length) return;

    const newQueue = [...queue];
    const [moved] = newQueue.splice(index, 1);
    newQueue.splice(targetIndex, 0, moved);
    setAppQueue(newQueue);
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 w-80 max-h-96 flex flex-col shadow-2xl text-white select-none">
      <div className="flex items-center justify-between mb-3 border-b border-neutral-800 pb-2">
        <div className="flex items-center gap-2">
          <ListMusic className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold">Queue ({queue.length})</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-neutral-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
        {queue.length === 0 ? (
          <p className="text-xs text-neutral-500 py-4 text-center">Queue is empty</p>
        ) : (
          queue.map((track: Track, idx: number) => {
            const isPlaying = track.id === currentTrack?.id;
            return (
              <div
                key={`${track.id}-${idx}`}
                className={`flex items-center justify-between gap-2 p-1.5 rounded-lg text-xs transition-colors ${
                  isPlaying ? "bg-white/10 text-emerald-400" : "hover:bg-neutral-800/80 text-neutral-300"
                }`}
              >
                <div
                  className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
                  onClick={() => playTrack(track)}
                >
                  <span className="text-[10px] text-neutral-500 w-4 text-center font-mono">{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-medium ${isPlaying ? "text-emerald-400" : "text-white"}`}>
                      {track.title}
                    </p>
                    <p className="text-[10px] text-neutral-400 truncate">{track.artist}</p>
                  </div>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    disabled={idx === 0}
                    onClick={() => handleMove(idx, "up")}
                    className="p-1 hover:text-white text-neutral-400 disabled:opacity-20 cursor-pointer disabled:cursor-default"
                    title="Move up"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    disabled={idx === queue.length - 1}
                    onClick={() => handleMove(idx, "down")}
                    className="p-1 hover:text-white text-neutral-400 disabled:opacity-20 cursor-pointer disabled:cursor-default"
                    title="Move down"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
