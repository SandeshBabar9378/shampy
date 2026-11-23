"use client";

/**
 * Home Step 1 — On Repeat.
 *
 * Ranks real tracks from the existing listening history. A signed-in user's
 * `song_stats` ranking (`/api/recommend?section=most`) is the play-count source;
 * recently played tracks get a small recency boost. Guests only have the local
 * history, so their order is the recency signal. No play counts are invented.
 */

import React, { useMemo } from "react";
import { Play, Repeat2 } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import type { Track } from "@/lib/types";
import { applyStableArtworkFallback, getStableTrackArtworkUrl } from "@/lib/artwork";
import { LAVENDER, PlaceholderRow, SectionHeader } from "./homeUi";
import { rankTopTracks, trackKey } from "./ranking";

const CARD_CLASS = "w-[37%] min-w-[128px]";

interface OnRepeatProps {
  /** Deduplicated local history (recents + likes), newest first. */
  history: Track[];
  /** Newest-first local recently-played list from the player. */
  recents: Track[];
  /** Real play-count ranking from song_stats; empty for guests. */
  mostPlayed: Track[];
}

export function OnRepeat({ history, recents, mostPlayed }: OnRepeatProps) {
  const { playTrack } = usePlayer();

  const ranked = useMemo(
    () => rankTopTracks(history, recents, mostPlayed),
    [history, recents, mostPlayed],
  );

  return (
    <div className="relative mt-6">
      <SectionHeader icon={Repeat2} title="On Repeat" />
      {ranked.length > 0 ? (
        <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
          {ranked.map((track) => (
            <div key={trackKey(track)} className={`${CARD_CLASS} shrink-0`}>
              <div className="shubhu-art-placeholder relative block aspect-square w-full overflow-hidden rounded-xl border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getStableTrackArtworkUrl(track, "max")}
                  alt={track.title}
                  referrerPolicy="no-referrer"
                  onError={(e) => applyStableArtworkFallback(e.currentTarget)}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => void playTrack(track, ranked)}
                  className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] shadow-lg shubhu-press"
                  title={`Play ${track.title}`}
                  aria-label={`Play ${track.title}`}
                >
                  <Play className="ml-0.5 h-4 w-4 fill-current" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => void playTrack(track, ranked)}
                className="mt-1.5 block w-full cursor-pointer text-left"
                title={track.title}
              >
                <span className="block truncate text-[12px] font-semibold text-white">
                  {track.title}
                </span>
                <span className="block truncate text-[11px]" style={{ color: LAVENDER }}>
                  {track.artist}
                </span>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <PlaceholderRow
          count={3}
          note="Play a song a few times to see it here"
          cardClassName={CARD_CLASS}
        />
      )}
    </div>
  );
}
