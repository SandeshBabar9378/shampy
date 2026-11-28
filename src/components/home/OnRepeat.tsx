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
import { useDataMode } from "@/hooks/useDataMode";
import { MOBILE_HOME_TOKENS } from "@/lib/home-tokens";
import { LAVENDER, PlaceholderRow, SectionHeader } from "./homeUi";
import { rankTopTracks, trackKey } from "./ranking";

const CARD_CLASS = MOBILE_HOME_TOKENS.horizontalCard;

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
  const { mode } = useDataMode();
  const playOptions = mode === "low" ? { appendSimilar: false } : undefined;

  const ranked = useMemo(
    () => rankTopTracks(history, recents, mostPlayed),
    [history, recents, mostPlayed],
  );

  return (
    <div className={`relative ${MOBILE_HOME_TOKENS.sectionSpacing}`}>
      <SectionHeader icon={Repeat2} title="On Repeat" />
      {ranked.length > 0 ? (
        <div className={MOBILE_HOME_TOKENS.horizontalRow}>
          {ranked.map((track) => (
            <div key={trackKey(track)} className={CARD_CLASS}>
              <div className={`shubhu-art-placeholder relative block ${MOBILE_HOME_TOKENS.imageContainer}`}>
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
                <button
                  type="button"
                  onClick={() => void playTrack(track, ranked, playOptions)}
                  className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] shadow-lg shubhu-press"
                  title={`Play ${track.title}`}
                  aria-label={`Play ${track.title}`}
                >
                  <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => void playTrack(track, ranked, playOptions)}
                className="mt-1.5 block w-full cursor-pointer text-left"
                title={track.title}
              >
                <span className={MOBILE_HOME_TOKENS.titleText}>
                  {track.title}
                </span>
                <span className={MOBILE_HOME_TOKENS.subtitleText} style={{ color: LAVENDER }}>
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
