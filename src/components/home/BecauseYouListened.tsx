"use client";

/**
 * Home Step 4 — Because You Listened To.
 *
 * Seeds are real tracks from history. Suggestions come from the existing
 * /api/next radio endpoint and are deduplicated against history, so a song
 * already shown in On Repeat / Recently Played is not repeated here. The
 * reason line only names the real seed artist from history.
 */

import React, { useEffect, useMemo, useState } from "react";
import { Headphones } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import type { Track } from "@/lib/types";
import { applyStableArtworkFallback, getStableTrackArtworkUrl } from "@/lib/artwork";
import { LAVENDER, PlaceholderRow, SectionHeader } from "./homeUi";

const CARD_CLASS = "w-[37%] min-w-[128px]";

interface Suggestion {
  track: Track;
  reason: string;
}

interface NextTrack {
  videoId?: string;
  title?: string;
  artist?: string;
  album?: string;
  thumbnail?: string;
  duration?: number;
}

function trackKey(track: Track): string {
  return track.youtubeId || track.id;
}

export function BecauseYouListened({ history }: { history: Track[] }) {
  const { playTrack } = usePlayer();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const seeds = useMemo(() => {
    const seen = new Set<string>();
    return history
      .filter((track) => {
        const videoId = track.youtubeId || (/^[A-Za-z0-9_-]{11}$/.test(track.id) ? track.id : "");
        if (!videoId || seen.has(trackKey(track))) return false;
        seen.add(trackKey(track));
        return true;
      })
      .slice(0, 3);
  }, [history]);

  const seedKey = seeds.map(trackKey).join("|");

  useEffect(() => {
    if (!seedKey) return;
    let cancelled = false;
    const controller = new AbortController();
    const historyKeys = new Set(history.map(trackKey));

    Promise.all(
      seeds.map(async (seed) => {
        const videoId =
          seed.youtubeId || (/^[A-Za-z0-9_-]{11}$/.test(seed.id) ? seed.id : "");
        try {
          const res = await fetch(`/api/next?videoId=${encodeURIComponent(videoId)}`, {
            signal: controller.signal,
          });
          if (!res.ok) return [] as Suggestion[];
          const data = (await res.json()) as NextTrack[];
          if (!Array.isArray(data)) return [] as Suggestion[];
          return data
            .filter((item) => Boolean(item?.videoId && item.title))
            .slice(0, 8)
            .map((item): Suggestion => ({
              track: {
                id: item.videoId as string,
                title: item.title as string,
                artist: item.artist || "Unknown Artist",
                album: item.album || "",
                coverUrl: item.thumbnail || "",
                duration: item.duration || 0,
                youtubeId: item.videoId,
              },
              reason: seed.artist || seed.title,
            }));
        } catch {
          return [] as Suggestion[];
        }
      }),
    )
      .then((groups) => {
        if (cancelled) return;
        const seen = new Set<string>(historyKeys);
        const merged = groups
          .flat()
          .filter(({ track }) => {
            const key = trackKey(track);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, 8);
        setSuggestions(merged);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // `seedKey` captures the memoised seeds; history is read only for the
    // exclusion set, which is stable for a given seed list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  const displayed = seedKey ? suggestions : [];

  return (
    <div className="relative mt-6">
      <SectionHeader icon={Headphones} title="Because You Listened To" />
      {displayed.length > 0 ? (
        <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
          {displayed.map(({ track, reason }) => (
            <button
              key={trackKey(track)}
              type="button"
              onClick={() => void playTrack(track, displayed.map((item) => item.track))}
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
              <span className="mt-0.5 block text-[10px] leading-tight text-white/55">
                Because you listened to {reason}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <PlaceholderRow
          count={3}
          note="Listen to a few songs to get suggestions here"
          cardClassName={CARD_CLASS}
        />
      )}
    </div>
  );
}
