"use client";

/**
 * Home Step 3 — New Releases For You.
 *
 * There is no dedicated "new releases" endpoint in this codebase. The only
 * real release dates are the years on an artist's albums/singles from
 * /api/artist, so we resolve the most-played artists from history through
 * /api/search and use those. If that yields no dated release, the section
 * stays a gradient placeholder instead of inventing a song or a date.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import type { Track } from "@/lib/types";
import { getDefaultArtworkFallbackUrl, normalizeArtworkUrl } from "@/lib/artwork";
import { MOBILE_HOME_TOKENS } from "@/lib/home-tokens";
import { LAVENDER, PlaceholderRow, SectionHeader } from "./homeUi";

const CARD_CLASS = MOBILE_HOME_TOKENS.horizontalCard;

interface Release {
  browseId: string;
  title: string;
  artist: string;
  year: string;
  thumbnail: string;
}

interface ArtistReleaseResponse {
  browseId?: string;
  title?: string;
  year?: string;
  thumbnail?: string;
}

interface ArtistResponse {
  albums?: ArtistReleaseResponse[];
  singles?: ArtistReleaseResponse[];
}

interface SearchArtist {
  name?: string;
  browseId?: string;
  thumbnail?: string;
}

function realYear(value: unknown): string | null {
  return typeof value === "string" && /^(19|20)\d{2}$/.test(value) ? value : null;
}

export function NewReleases({ history }: { history: Track[] }) {
  const router = useRouter();
  const [releases, setReleases] = useState<Release[]>([]);

  // Most-played artists in the local history are the real preference signal.
  const artists = useMemo(() => {
    const counts = new Map<string, number>();
    history.forEach((track) => {
      if (track.artist) counts.set(track.artist, (counts.get(track.artist) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);
  }, [history]);

  const artistKey = artists.join("|");

  useEffect(() => {
    if (!artistKey) return;
    let cancelled = false;
    const controller = new AbortController();

    const loadArtistReleases = async (name: string): Promise<Release[]> => {
      const searchRes = await fetch(`/api/search?q=${encodeURIComponent(name)}`, {
        signal: controller.signal,
      });
      if (!searchRes.ok) return [];
      const searchData = (await searchRes.json()) as { artists?: SearchArtist[] };
      const matches = Array.isArray(searchData.artists) ? searchData.artists : [];
      const exact =
        matches.find((artist) => artist.name?.trim().toLowerCase() === name.trim().toLowerCase()) ??
        matches[0];
      if (!exact?.browseId) return [];

      const artistRes = await fetch(`/api/artist?id=${encodeURIComponent(exact.browseId)}`, {
        signal: controller.signal,
      });
      if (!artistRes.ok) return [];
      const artistData = (await artistRes.json()) as ArtistResponse;
      const dated = [...(artistData.albums ?? []), ...(artistData.singles ?? [])]
        .map((item): Release | null => {
          const year = realYear(item.year);
          if (!year || !item.browseId || !item.title) return null;
          return {
            browseId: item.browseId,
            title: item.title,
            artist: name,
            year,
            thumbnail: item.thumbnail || "",
          };
        })
        .filter((item): item is Release => item !== null);
      return dated;
    };

    Promise.all(artists.map(loadArtistReleases))
      .then((groups) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const merged = groups
          .flat()
          .filter((release) => {
            if (seen.has(release.browseId)) return false;
            seen.add(release.browseId);
            return true;
          })
          .sort((a, b) => b.year.localeCompare(a.year))
          .slice(0, 8);
        setReleases(merged);
      })
      .catch(() => {
        if (!cancelled) setReleases([]);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // `artistKey` captures the memoised artist list without re-running on
    // every history array identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistKey]);

  const displayed = artistKey ? releases : [];

  return (
    <div className={`relative ${MOBILE_HOME_TOKENS.sectionSpacing}`}>
      <SectionHeader icon={Sparkles} title="New Releases For You" />
      {displayed.length > 0 ? (
        <div className={MOBILE_HOME_TOKENS.horizontalRow}>
          {displayed.map((release) => (
            <button
              key={release.browseId}
              type="button"
              onClick={() => router.push(`/album/${encodeURIComponent(release.browseId)}`)}
              className={`${CARD_CLASS} cursor-pointer text-left shubhu-press`}
              title={release.title}
            >
              <span className={`shubhu-art-placeholder block ${MOBILE_HOME_TOKENS.imageContainer}`}>
                {release.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={normalizeArtworkUrl(release.thumbnail)}
                    alt={release.title}
                    referrerPolicy="no-referrer"
                    loading="eager"
                    decoding="async"
                    onError={(e) => {
                      e.currentTarget.src = getDefaultArtworkFallbackUrl();
                    }}
                    className={MOBILE_HOME_TOKENS.image}
                  />
                ) : (
                  <span className="shubhu-placeholder-gradient-2 flex h-full w-full items-center justify-center text-2xl font-bold text-white/70">
                    {release.title.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </span>
              <span className={`mt-1.5 ${MOBILE_HOME_TOKENS.titleText}`}>
                {release.title}
              </span>
              <span className={MOBILE_HOME_TOKENS.subtitleText} style={{ color: LAVENDER }}>
                {release.artist} · {release.year}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <PlaceholderRow
          count={3}
          note="New releases will appear here"
          cardClassName={CARD_CLASS}
        />
      )}
    </div>
  );
}
