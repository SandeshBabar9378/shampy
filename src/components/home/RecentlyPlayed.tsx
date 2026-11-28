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
import { useDataMode } from "@/hooks/useDataMode";
import { MOBILE_HOME_TOKENS } from "@/lib/home-tokens";
import { LAVENDER, PlaceholderRow, SectionHeader } from "./homeUi";

export function RecentlyPlayed({ recents }: { recents: Track[] }) {
  const { playTrack } = usePlayer();
  const { mode } = useDataMode();
  const playOptions = mode === "low" ? { appendSimilar: false } : undefined;

  return (
    <div className={`relative ${MOBILE_HOME_TOKENS.sectionSpacing}`}>
      <SectionHeader icon={Clock} title="Recently Played" />
      {recents.length > 0 ? (
        <div className={MOBILE_HOME_TOKENS.horizontalRow}>
          {recents.map((track) => (
            <button
              key={track.id}
              type="button"
              onClick={() => void playTrack(track, recents, playOptions)}
              className={`${MOBILE_HOME_TOKENS.horizontalCard} cursor-pointer text-left shubhu-press`}
              title={track.title}
            >
              <span className={`shubhu-art-placeholder block ${MOBILE_HOME_TOKENS.imageContainer}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getStableTrackArtworkUrl(track, "hq", mode)}
                  alt={track.title}
                  referrerPolicy="no-referrer"
                  loading="eager"
                  decoding="async"
                  onError={(e) => applyStableArtworkFallback(e.currentTarget)}
                  className={MOBILE_HOME_TOKENS.image}
                />
              </span>
              <span className={`mt-1.5 ${MOBILE_HOME_TOKENS.titleText}`}>
                {track.title}
              </span>
              <span className={MOBILE_HOME_TOKENS.subtitleText} style={{ color: LAVENDER }}>
                {track.artist}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <PlaceholderRow
          count={4}
          note="Play something to see it here"
          cardClassName={MOBILE_HOME_TOKENS.horizontalCard}
        />
      )}
    </div>
  );
}
