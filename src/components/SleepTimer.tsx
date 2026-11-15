"use client";

import React from "react";
import { Moon, Music, Timer, X } from "lucide-react";
import { SLEEP_TIMER_OPTIONS, usePlayer } from "@/context/PlayerContext";

interface SleepTimerProps {
  onClose?: () => void;
}

function formatRemaining(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function SleepTimer({ onClose }: SleepTimerProps) {
  const {
    sleepEndsAt,
    sleepRemainingSeconds,
    sleepAtEndOfSong,
    sleepTimerNotice,
    selectSleepTimer,
    cancelSleepTimer,
  } = usePlayer();

  const isActive = sleepEndsAt !== null || sleepAtEndOfSong;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 w-64 shadow-2xl text-white select-none">
      <div className="flex items-center justify-between mb-3 border-b border-neutral-800 pb-2">
        <div className="flex items-center gap-2">
          <Moon className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold">Sleep Timer</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-neutral-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {isActive && (
        <div className="text-center py-2 border-b border-neutral-800 mb-3">
          <p className="text-xs text-neutral-400">
            {sleepAtEndOfSong ? "Stopping after current song" : "Stopping playback in"}
          </p>
          {!sleepAtEndOfSong && (
            <p className="text-2xl font-bold font-mono text-emerald-400 my-1">
              {formatRemaining(sleepRemainingSeconds)}{" "}
              <span className="text-xs font-normal text-neutral-400">left</span>
            </p>
          )}
          <button
            onClick={cancelSleepTimer}
            className="mt-2 text-xs text-red-400 hover:text-red-300 underline cursor-pointer"
          >
            Turn off timer
          </button>
        </div>
      )}

      {sleepTimerNotice && (
        <p className="text-xs text-center text-emerald-400 mb-2">{sleepTimerNotice}</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        {SLEEP_TIMER_OPTIONS.map((option) => (
          <button
            key={option.label}
            onClick={() => selectSleepTimer(option)}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 bg-neutral-800 hover:bg-neutral-700 active:bg-emerald-600 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
              option.seconds === null ? "col-span-2" : ""
            }`}
          >
            {option.seconds === null ? (
              <Music className="w-3.5 h-3.5 text-neutral-400" />
            ) : (
              <Timer className="w-3.5 h-3.5 text-neutral-400" />
            )}
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
