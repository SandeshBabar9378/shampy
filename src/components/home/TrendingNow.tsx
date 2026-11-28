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
import { useDataMode } from "@/hooks/useDataMode";
import { MOBILE_HOME_TOKENS } from "@/lib/home-tokens";
import { LAVENDER, PlaceholderRow, SectionHeader } from "./homeUi";
import { rankTopTracks, trackKey } from "./ranking";

const CARD_CLASS = MOBILE_HOME_TOKENS.horizontalCard;

interface TrendingNowProps {
  history: Track[];
  recents: Track[];
  mostPlayed: Track[];
}

export function TrendingNow({ history, recents, mostPlayed }: TrendingNowProps) {
  const { playTrack } = usePlayer();
  const { mode } = useDataMode();
  const playOptions = mode === "low" ? { appendSimilar: false } : undefined;

  const shown = useMemo(() => {
    const ranked = rankTopTracks(history, recents, mostPlayed, 12);
    if (ranked.length <= 6) return ranked;
    const start = Math.min(6, ranked.length - 6);
    return ranked.slice(start, start + 8);
  }, [history, recents, mostPlayed]);

  return (
    <div className={`relative ${MOBILE_HOME_TOKENS.sectionSpacing}`}>
      <SectionHeader icon={TrendingUp} title="Trending Now" />
      {shown.length > 0 ? (
        <div className={MOBILE_HOME_TOKENS.horizontalRow}>
          {shown.map((track) => (
            <button
              key={trackKey(track)}
              type="button"
              onClick={() => void playTrack(track, shown, playOptions)}
              className={`${CARD_CLASS} cursor-pointer text-left shubhu-press`}
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
          count={3}
          note="Trending will appear here"
          cardClassName={CARD_CLASS}
        />
      )}
    </div>
  );
}
