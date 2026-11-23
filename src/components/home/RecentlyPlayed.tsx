"use client";

/**
 * Home Step 2 — Recently Played.
 *
 * Square rounded thumbnails (~4 visible, last one cut at the edge) with the
 * title and artist under each cover. The player keeps `recentlyPlayed` in
 * localStorage newest-first, so the incoming order is already correct.
 * Tapping a card plays it through the existing player queue.
 */

import React from "react";
import { Clock } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import type { Track } from "@/lib/types";
import { applyStableArtworkFallback, getStableTrackArtworkUrl } from "@/lib/artwork";
import { LAVENDER, PlaceholderRow, SectionHeader } from "./homeUi";

export function RecentlyPlayed({ recents }: { recents: Track[] }) {
  const { playTrack } = usePlayer();

  return (
    <div className="relative mt-6">
      <SectionHeader icon={Clock} title="Recently Played" />
      {recents.length > 0 ? (
        <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
          {recents.map((track) => (
            <button
              key={track.id}
              type="button"
              onClick={() => void playTrack(track, recents)}
              className="w-[23%] shrink-0 cursor-pointer text-left shubhu-press"
              title={track.title}
            >
              <span className="shubhu-art-placeholder block aspect-square w-full overflow-hidden rounded-xl border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getStableTrackArtworkUrl(track, "max")}
                  alt={track.title}
                  referrerPolicy="no-referrer"
                  onError={(e) => applyStableArtworkFallback(e.currentTarget)}
                  className="h-full w-full object-cover"
                />
              </span>
              <span className="mt-1.5 block truncate text-[12px] font-semibold text-white">
                {track.title}
              </span>
              <span className="block truncate text-[11px]" style={{ color: LAVENDER }}>
                {track.artist}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <PlaceholderRow
          count={4}
          note="Play something to see it here"
          cardClassName="w-[23%]"
        />
      )}
    </div>
  );
}
