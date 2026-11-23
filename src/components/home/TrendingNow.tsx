"use client";

/**
 * Home Step 5 — Trending Now.
 *
 * There is no real trending chart source in this codebase. The section therefore
 * stays honest: it keeps the Trending Now heading, but the row is explicitly
 * labelled "Your top played" and uses the same real play-count ranking as
 * On Repeat (offset where there is enough history to avoid a duplicate row).
 */

import React, { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import type { Track } from "@/lib/types";
import { applyStableArtworkFallback, getStableTrackArtworkUrl } from "@/lib/artwork";
import { LAVENDER, PlaceholderRow, SectionHeader } from "./homeUi";
import { rankTopTracks, trackKey } from "./ranking";

const CARD_CLASS = "w-[37%] min-w-[128px]";

interface TrendingNowProps {
  history: Track[];
  recents: Track[];
  mostPlayed: Track[];
}

export function TrendingNow({ history, recents, mostPlayed }: TrendingNowProps) {
  const { playTrack } = usePlayer();

  const shown = useMemo(() => {
    const ranked = rankTopTracks(history, recents, mostPlayed, 12);
    if (ranked.length <= 6) return ranked;
    const start = Math.min(6, ranked.length - 6);
    return ranked.slice(start, start + 8);
  }, [history, recents, mostPlayed]);

  return (
    <div className="relative mt-6">
      <SectionHeader icon={TrendingUp} title="Trending Now" />
      <p className="mb-2 px-4 text-[11px]" style={{ color: LAVENDER }}>
        Your top played
      </p>
      {shown.length > 0 ? (
        <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
          {shown.map((track) => (
            <button
              key={trackKey(track)}
              type="button"
              onClick={() => void playTrack(track, shown)}
              className={`${CARD_CLASS} shrink-0 cursor-pointer text-left shubhu-press`}
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
          count={3}
          note="Trending will appear here"
          cardClassName={CARD_CLASS}
        />
      )}
    </div>
  );
}
