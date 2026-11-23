"use client";

/**
 * Home Step 6 — Popular Artists.
 *
 * Artists are ranked by real plays from history: the play-count ranking from
 * song_stats (or recency for guests) plus how often the artist appears in
 * history. A browseId/thumbnail is only used when /api/search returns one, so
 * the card links to a real artist page or stays non-interactive.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic2 } from "lucide-react";
import type { Track } from "@/lib/types";
import { PlaceholderRow, SectionHeader } from "./homeUi";
import { rankTopTracks } from "./ranking";

const CARD_CLASS = "w-[22%] min-w-[76px]";

interface PopularArtist {
  name: string;
  browseId: string | null;
  thumbnail: string | null;
}

interface SearchArtist {
  name?: string;
  browseId?: string;
  thumbnail?: string;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function PopularArtists({ history, recents, mostPlayed }: {
  history: Track[];
  recents: Track[];
  mostPlayed: Track[];
}) {
  const router = useRouter();
  const [artists, setArtists] = useState<PopularArtist[]>([]);

  const rankedArtists = useMemo(() => {
    const ranked = rankTopTracks(history, recents, mostPlayed, 20);
    const historyCounts = new Map<string, number>();
    history.forEach((track) => {
      if (track.artist) historyCounts.set(track.artist, (historyCounts.get(track.artist) ?? 0) + 1);
    });

    const scores = new Map<string, number>();
    const artistIds = new Map<string, string>();
    ranked.forEach((track, index) => {
      if (!track.artist) return;
      const rankWeight = ranked.length - index;
      scores.set(track.artist, (scores.get(track.artist) ?? 0) + rankWeight);
      if (track.artistId && !artistIds.has(track.artist)) artistIds.set(track.artist, track.artistId);
    });
    historyCounts.forEach((count, name) => {
      scores.set(name, (scores.get(name) ?? 0) + count * 0.5);
    });

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => ({ name, artistId: artistIds.get(name) ?? null }));
  }, [history, recents, mostPlayed]);

  const artistKey = rankedArtists.map((artist) => artist.name).join("|");

  useEffect(() => {
    if (!artistKey) return;
    let cancelled = false;
    const controller = new AbortController();

    Promise.all(
      rankedArtists.map(async ({ name, artistId }): Promise<PopularArtist> => {
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(name)}`, {
            signal: controller.signal,
          });
          if (!res.ok) return { name, browseId: artistId, thumbnail: null };
          const data = (await res.json()) as { artists?: SearchArtist[] };
          const matches = Array.isArray(data.artists) ? data.artists : [];
          const exact =
            matches.find((artist) => artist.name?.trim().toLowerCase() === name.trim().toLowerCase()) ??
            matches[0];
          return {
            name,
            browseId: exact?.browseId || artistId || null,
            thumbnail: exact?.thumbnail || null,
          };
        } catch {
          return { name, browseId: artistId, thumbnail: null };
        }
      }),
    )
      .then((resolved) => {
        if (!cancelled) setArtists(resolved);
      })
      .catch(() => {
        if (!cancelled) setArtists([]);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // `artistKey` captures the memoised ranking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistKey]);

  const displayed = artistKey ? artists : [];

  return (
    <div className="relative mt-6">
      <SectionHeader icon={Mic2} title="Popular Artists" />
      {displayed.length > 0 ? (
        <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
          {displayed.map((artist) => {
            const content = (
              <>
                <span className="shubhu-art-placeholder block aspect-square w-full overflow-hidden rounded-full border">
                  {artist.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={artist.thumbnail}
                      alt={artist.name}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="shubhu-placeholder-gradient-3 flex h-full w-full items-center justify-center text-sm font-bold text-white/80">
                      {initials(artist.name)}
                    </span>
                  )}
                </span>
                <span className="mt-1.5 block truncate text-center text-[11px] font-semibold text-white">
                  {artist.name}
                </span>
              </>
            );
            return artist.browseId ? (
              <button
                key={artist.name}
                type="button"
                onClick={() => router.push(`/artist/${encodeURIComponent(artist.browseId as string)}`)}
                className={`${CARD_CLASS} shrink-0 cursor-pointer shubhu-press`}
                title={artist.name}
              >
                {content}
              </button>
            ) : (
              <div key={artist.name} className={`${CARD_CLASS} shrink-0`} title={artist.name}>
                {content}
              </div>
            );
          })}
        </div>
      ) : (
        <PlaceholderRow
          count={4}
          note="Artists you play will appear here"
          cardClassName={CARD_CLASS}
          circle
        />
      )}
    </div>
  );
}
