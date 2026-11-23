"use client";

/**
 * Phone-only Home rebuild (matches the approved mockup).
 *
 * Reuses the existing player context for everything: Speed Dial shuffle goes
 * through playShuffledQueue, mixes/recent plays through playTrack, and the
 * Liked / Recent / Downloads dials switch to the existing shell views.
 * Listening history is read from the same localStorage keys the player
 * writes, and refreshed on the player's "storage" event so the page
 * auto-updates after every play/like.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  Download,
  Heart,
  History,
  Play,
  Search,
  Shuffle,
  Star,
  Zap,
} from "lucide-react";
import { useAppShell } from "@/context/AppShellContext";
import { usePlayer } from "@/context/PlayerContext";
import type { Track } from "@/lib/types";
import { CURATED_TRACKS } from "@/lib/musicProvider";
import { applyStableArtworkFallback, getStableTrackArtworkUrl } from "@/lib/artwork";
import { EqualizerLogo, GreetingSwoosh } from "@/components/ui/MotionIcons";
import { NightSky } from "@/components/home/NightSky";
import { RecentlyPlayed } from "@/components/home/RecentlyPlayed";
import { OnRepeat } from "@/components/home/OnRepeat";
import { CommunityPlaylists } from "@/components/home/CommunityPlaylists";
import { NewReleases } from "@/components/home/NewReleases";
import { BecauseYouListened } from "@/components/home/BecauseYouListened";
import { TrendingNow } from "@/components/home/TrendingNow";
import { PopularArtists } from "@/components/home/PopularArtists";
import { LAVENDER } from "@/components/home/homeUi";

type Daypart = "Morning" | "Afternoon" | "Evening" | "Night";

function daypartForHour(hour: number): Daypart {
  if (hour >= 5 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 17) return "Afternoon";
  if (hour >= 17 && hour < 21) return "Evening";
  return "Night";
}

/** Time of day nudges every mix toward the kind of songs people play then. */
const DAYPART_KEYWORDS: Record<Daypart, string[]> = {
  Morning: ["acoustic", "soft", "fresh", "morning", "unplugged"],
  Afternoon: ["pop", "dance", "energy", "party", "punjabi"],
  Evening: ["romantic", "soul", "mellow", "love", "chill"],
  Night: ["night", "lofi", "lo-fi", "slow", "sleep", "dream"],
};

interface MixDef {
  id: string;
  title: string;
  subtitle: string;
  keywords: string[];
  gradient: string;
}

const MIX_DEFS: MixDef[] = [
  { id: "daily", title: "Daily Mix", subtitle: "Personalized for you", keywords: [], gradient: "var(--mix-gradient-1)" },
  { id: "mood", title: "Mood Mix", subtitle: "For every mood", keywords: [], gradient: "var(--mix-gradient-2)" },
  { id: "chill", title: "Chill Mix", subtitle: "Relax & Unwind", keywords: ["chill", "lofi", "lo-fi", "acoustic", "soft", "relax", "unwind", "slow", "mellow"], gradient: "var(--mix-gradient-3)" },
  { id: "energetic", title: "Energetic Mix", subtitle: "Turn the energy up", keywords: ["dance", "party", "workout", "energy", "rock", "edm", "hip hop", "punjabi", "pop"], gradient: "var(--mix-gradient-4)" },
  { id: "romantic", title: "Romantic Mix", subtitle: "Songs from the heart", keywords: ["romantic", "love", "ishq", "pyar", "mohabbat", "heart", "soul", "r&b"], gradient: "var(--mix-gradient-5)" },
  { id: "focus", title: "Focus Mix", subtitle: "Stay in the zone", keywords: ["focus", "study", "instrumental", "classical", "ambient", "piano", "calm"], gradient: "var(--mix-gradient-6)" },
  { id: "night", title: "Night Mix", subtitle: "Late night vibes", keywords: ["night", "midnight", "late", "sleep", "dream", "lofi", "lo-fi", "slow"], gradient: "var(--mix-gradient-7)" },
];

function dedupeTracks(tracks: Track[]): Track[] {
  return Array.from(new Map(tracks.filter((t) => t?.id).map((t) => [t.id, t])).values());
}

function keywordScore(track: Track, keywords: string[]): number {
  const haystack = `${track.genre ?? ""} ${track.title} ${track.artist} ${track.album}`.toLowerCase();
  return keywords.reduce((score, keyword) => (haystack.includes(keyword) ? score + 1 : score), 0);
}

/** Deterministic per-mix selection from the real listening history. */
function buildMixTracks(
  def: MixDef,
  index: number,
  pool: Track[],
  artistCounts: Map<string, number>,
  genreCounts: Map<string, number>,
  daypart: Daypart,
): Track[] {
  if (pool.length === 0) return [];
  const keywords = [...def.keywords, ...DAYPART_KEYWORDS[daypart]];
  const scored = pool.map((track) => {
    let score: number;
    if (def.id === "daily") score = artistCounts.get(track.artist) ?? 0;
    else if (def.id === "mood") score = genreCounts.get(track.genre ?? "") ?? 0;
    else score = keywordScore(track, keywords);
    return { track, score };
  });
  const best = scored.reduce((max, entry) => Math.max(max, entry.score), 0);
  if (best === 0) {
    // No signal for this mix yet: rotate the pool so mixes still differ.
    const offset = (index * 3) % pool.length;
    return [...pool.slice(offset), ...pool.slice(0, offset)].slice(0, 12);
  }
  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.track)
    .slice(0, 12);
}

export function MobileHome() {
  const { setCurrentView, openProfile } = useAppShell();
  const { user, isPlaying, playTrack, playShuffledQueue } = usePlayer();

  const [recents, setRecents] = useState<Track[]>([]);
  const [liked, setLiked] = useState<Track[]>([]);
  const [mostPlayed, setMostPlayed] = useState<Track[]>([]);
  const [hour, setHour] = useState(19); // SSR-safe default; corrected on mount

  // Same keys the player writes; the player dispatches "storage" after every
  // play/like/sync, so this stays live without any new data plumbing.
  useEffect(() => {
    const load = () => {
      try {
        const rawRecents = JSON.parse(localStorage.getItem("recentlyPlayed") || "[]");
        const rawLiked = JSON.parse(
          localStorage.getItem("likedSongs") || localStorage.getItem("shubhu_liked_songs") || "[]",
        );
        setRecents(Array.isArray(rawRecents) ? rawRecents : []);
        setLiked(Array.isArray(rawLiked) ? rawLiked : []);
      } catch {}
      setHour(new Date().getHours());
    };
    load();
    window.addEventListener("storage", load);
    return () => window.removeEventListener("storage", load);
  }, []);

  // Real play counts live in song_stats. The API only returns them for a
  // signed-in account; guests keep the local-history ordering in On Repeat.
  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    let cancelled = false;
    const params = new URLSearchParams({ userId, section: "most", limit: "20" });
    fetch(`/api/recommend?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        if (cancelled) return;
        const tracks = (data as { tracks?: unknown } | null)?.tracks;
        if (!Array.isArray(tracks)) {
          setMostPlayed([]);
          return;
        }
        const valid = tracks.filter(
          (track): track is Track =>
            Boolean(track) && typeof (track as Track).id === "string" && typeof (track as Track).title === "string",
        );
        setMostPlayed(valid);
      })
      .catch(() => {
        if (!cancelled) setMostPlayed([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // A signed-out account must never see a previous account's real stats.
  const effectiveMostPlayed = user?.id ? mostPlayed : [];

  const daypart = daypartForHour(hour);

  const history = useMemo(() => dedupeTracks([...recents, ...liked]), [recents, liked]);

  const mixes = useMemo(() => {
    const pool = history.length > 0 ? history : CURATED_TRACKS;
    const artistCounts = new Map<string, number>();
    const genreCounts = new Map<string, number>();
    history.forEach((track) => {
      if (track.artist) artistCounts.set(track.artist, (artistCounts.get(track.artist) ?? 0) + 1);
      if (track.genre) genreCounts.set(track.genre, (genreCounts.get(track.genre) ?? 0) + 1);
    });
    return MIX_DEFS.map((def, index) => {
      const tracks = buildMixTracks(def, index, pool, artistCounts, genreCounts, daypart);
      const coverTrack = tracks.find((track) => track.coverUrl || track.youtubeId);
      return {
        ...def,
        tracks,
        coverUrl: coverTrack ? getStableTrackArtworkUrl(coverTrack, "max") : null,
      };
    });
  }, [history, daypart]);

  const handleShuffle = () => {
    const pool = history.length > 0 ? history : CURATED_TRACKS;
    void playShuffledQueue(pool);
  };

  const speedDial = [
    { id: "shuffle", lines: ["Shuffle"], icon: Shuffle, filled: false, onClick: handleShuffle },
    { id: "liked", lines: ["Liked", "Songs"], icon: Heart, filled: true, onClick: () => setCurrentView("liked") },
    { id: "recent", lines: ["Recent", "Played"], icon: History, filled: false, onClick: () => setCurrentView("recent") },
    { id: "downloads", lines: ["Downloads"], icon: Download, filled: false, onClick: () => setCurrentView("downloads") },
  ];

  return (
    <div className="relative -mx-4 -mt-4">
      {/* Night-city backdrop behind the header + greeting */}
      <NightSky />

      {/* Header */}
      <div className="relative px-4 pt-4">
        <div className="flex items-center justify-between">
          <EqualizerLogo playing={isPlaying} />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCurrentView("search")}
              className="flex h-9 w-9 items-center justify-center text-white cursor-pointer shubhu-press"
              title="Search"
              aria-label="Search"
            >
              <Search className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={openProfile}
              className="shubhu-card-surface h-8 w-8 overflow-hidden rounded-full cursor-pointer shubhu-press"
              title="Profile"
              aria-label="Profile"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={user?.avatar || "https://api.dicebear.com/7.x/bottts/svg?seed=user"}
                alt=""
                className="h-full w-full object-cover"
              />
            </button>
          </div>
        </div>

        {/* Greeting */}
        <h1 className="mt-10 text-[32px] font-extrabold leading-tight tracking-tight text-white">
          Good {daypart}!
        </h1>
        <GreetingSwoosh className="mt-1" />
      </div>

      {/* Speed Dial */}
      <div className="relative mt-16 px-4">
        <div className="shubhu-card-surface rounded-2xl p-4 backdrop-blur-sm">
          <div className="mb-4 flex items-center gap-2">
            <Zap className="h-4 w-4 fill-current" style={{ color: LAVENDER }} />
            <h2 className="text-base font-bold text-white">Speed Dial</h2>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {speedDial.map(({ id, lines, icon: Icon, filled, onClick }) => (
              <button
                key={id}
                type="button"
                onClick={onClick}
                className="flex flex-col items-center gap-2 cursor-pointer shubhu-press"
              >
                <span className="shubhu-speed-circle flex h-16 w-16 items-center justify-center rounded-full">
                  <Icon
                    className={`h-6 w-6 ${filled ? "fill-current" : ""}`}
                    style={{ color: "var(--theme-lavender)" }}
                  />
                </span>
                <span className="text-center text-[11px] font-medium leading-tight text-white">
                  {lines.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Made for You */}
      <div className="relative mt-6">
        <div className="mb-3 flex items-center gap-2 px-4">
          <Star className="shubhu-icon-accent h-5 w-5 fill-current" />
          <h2 className="text-lg font-bold text-white">Made for You</h2>
        </div>
        <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
          {mixes.map((mix) => (
            <button
              key={mix.id}
              type="button"
              onClick={() => {
                if (mix.tracks.length > 0) void playTrack(mix.tracks[0], mix.tracks);
              }}
              className="shubhu-card-surface w-[37%] min-w-[136px] shrink-0 cursor-pointer rounded-2xl p-2 text-left shubhu-press"
            >
              <span className="relative block">
                {mix.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mix.coverUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={(e) => applyStableArtworkFallback(e.currentTarget)}
                    className="aspect-square w-full rounded-xl object-cover"
                  />
                ) : (
                  <span className="block aspect-square w-full rounded-xl" style={{ backgroundImage: mix.gradient }} />
                )}
                <span className="absolute -bottom-4 right-1 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--theme-accent)] shadow-lg">
                  <Play className="ml-0.5 h-4 w-4 fill-[var(--theme-accent-contrast)] text-[var(--theme-accent-contrast)]" />
                </span>
              </span>
              <span className="block px-1 pb-1 pt-5">
                <span className="block truncate text-[13px] font-bold text-white">{mix.title}</span>
                <span className="mt-0.5 block truncate text-[11px]" style={{ color: LAVENDER }}>
                  {mix.subtitle}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Recently Played */}
      <RecentlyPlayed recents={recents} />

      {/* On Repeat */}
      <OnRepeat history={history} recents={recents} mostPlayed={effectiveMostPlayed} />

      {/* Community Playlists */}
      <CommunityPlaylists history={history} />

      {/* New Releases For You */}
      <NewReleases history={history} />

      {/* Because You Listened To */}
      <BecauseYouListened history={history} />

      {/* Trending Now */}
      <TrendingNow history={history} recents={recents} mostPlayed={effectiveMostPlayed} />

      {/* Popular Artists */}
      <PopularArtists history={history} recents={recents} mostPlayed={effectiveMostPlayed} />
    </div>
  );
}
