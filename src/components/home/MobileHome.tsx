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

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  Heart,
  History,
  Play,
  Search,
  Settings,
  Shuffle,
  Star,
  Zap,
} from "lucide-react";
import { useAppShell } from "@/context/AppShellContext";
import { usePlayer } from "@/context/PlayerContext";
import type { Track } from "@/lib/types";
import { CURATED_TRACKS } from "@/lib/musicProvider";
import { applyStableArtworkFallback, getStableTrackArtworkUrl, getTrackArtworkUrl } from "@/lib/artwork";
import { getActiveDataMode, useDataMode } from "@/hooks/useDataMode";
import { EqualizerLogo } from "@/components/ui/MotionIcons";
import { NightSky } from "@/components/home/NightSky";
import { RecentlyPlayed } from "@/components/home/RecentlyPlayed";
import { OnRepeat } from "@/components/home/OnRepeat";
import { CommunityPlaylists } from "@/components/home/CommunityPlaylists";
import { NewReleases } from "@/components/home/NewReleases";
import { BecauseYouListened } from "@/components/home/BecauseYouListened";
import { TrendingNow } from "@/components/home/TrendingNow";
import { PopularArtists } from "@/components/home/PopularArtists";
import { LAVENDER, SectionHeader } from "@/components/home/homeUi";
import { MOBILE_HOME_TOKENS } from "@/lib/home-tokens";

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

/* ------------------------------------------------------------------ */
/* Hero sky: drifting clouds + one time-placed sun / moon.             */
/* The celestial body rides a fixed arc with a transform only; the      */
/* clouds drift with transform + opacity and park under reduced motion. */
/* ------------------------------------------------------------------ */

/**
 * Sky strip height: ~28% of the phone viewport. The backdrop, the stars, the
 * drifting clouds and the sun/moon arc all live inside this one strip, and
 * the rest of the page starts right below it.
 */
const HERO_SKY_BAND_HEIGHT = "15svh";
/** Keeps the body clear of the screen edges at rise and set (no half-cropping). */
const HERO_BODY_SIDE_PAD = 10;
/** Pre-measurement guess for the first paint; the effect corrects it. */
const HERO_BODY_BAND_HEIGHT = 80;
/** Body centre sits this far from the band's top on the high point. */
const HERO_BODY_TOP_PAD = 8;
/** Body diameter in px (radius = 15). */
const HERO_BODY_DIAMETER = 30;
/** Arc tilt in degrees at rise (and by symmetry at set). */
const HERO_BODY_LIFT = 8;
/** 12 evenly spaced sun rays; the SVG spins them slowly via CSS. */
const SUN_RAY_ANGLES = Array.from({ length: 12 }, (_, i) => i * 30);

/** Rays sit just inside the sun's edge and reach ~1.4x its radius. */
function SunRays() {
  return (
    <svg className="shubhu-hero-body-rays" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      {SUN_RAY_ANGLES.map((angle) => {
        const rad = (angle * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        return (
          <line
            key={angle}
            x1={50 + cos * 26}
            y1={50 + sin * 26}
            x2={50 + cos * 41}
            y2={50 + sin * 41}
            stroke="currentColor"
            strokeWidth={4.5}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

/** One body frame of the arc: `translate` + `rotate` along a fixed curve. */
function heroSkyArcTransform(t: number, width: number, height: number): string {
  const span = Math.max(0, height - HERO_BODY_TOP_PAD - HERO_BODY_DIAMETER);
  const travel = Math.max(0, width - HERO_BODY_DIAMETER - HERO_BODY_SIDE_PAD * 2);
  const x = HERO_BODY_SIDE_PAD + t * travel;
  const y = HERO_BODY_TOP_PAD + span * (1 - Math.sin(Math.PI * t));
  const rotate = Math.cos(Math.PI * t) * HERO_BODY_LIFT;
  return `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${rotate.toFixed(2)}deg)`;
}

/** Sky fraction along the arc: 0 at rise (left, low), 0.5 overhead, 1 at set (right, low).
   Sun rises ~06:00 and sets ~18:00; moon rises ~18:00 and sets ~06:00 (next day).
   Elapsed minutes wrap past midnight so the arc is continuous across the 06:00/18:00 boundary. */
function heroSkyT(minutes: number, isDay: boolean): number {
  const riseMinutes = isDay ? 6 * 60 : 18 * 60;
  let elapsed = minutes - riseMinutes;
  if (elapsed < 0) elapsed += 24 * 60; // carried over from the previous calendar day
  let t = elapsed / 720; // 12-hour arc
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  return t;
}

/**
 * Absolute sky layer for the phone hero: five soft clouds that drift across
 * the strip on a loop, plus the single sun/moon sitting on the time-based
 * arc. Fills the strip above the skyline (bottom-[24%]) and clips to it, so
 * clouds only ever move inside the sun/moon area.
 */
function HeroSky({ isDay }: { isDay: boolean }) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [body, setBody] = useState<{ kind: "sun" | "moon"; transform: string }>({
    kind: isDay ? "sun" : "moon",
    transform: heroSkyArcTransform(0, HERO_BODY_BAND_HEIGHT, HERO_BODY_BAND_HEIGHT),
  });

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    const placeBody = () => {
      const now = new Date();
      const minutes = now.getHours() * 60 + now.getMinutes();
      const isDay = now.getHours() >= 6 && now.getHours() < 18;
      const t = heroSkyT(minutes, isDay);
      const { width, height } = layer.getBoundingClientRect();
      const next = {
        kind: (isDay ? "sun" : "moon") as "sun" | "moon",
        transform: heroSkyArcTransform(t, width, height),
      };
      // State bail-out keeps the minute interval from re-rendering needlessly.
      setBody((prev) => (prev.kind === next.kind && prev.transform === next.transform ? prev : next));
    };

    placeBody();

    // Reduced motion: body stays static at its current spot, no clock drift.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const timer = window.setInterval(placeBody, 60 * 1000);
    // Rotation / viewport resize changes the band size, so re-measure.
    window.addEventListener("resize", placeBody);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", placeBody);
    };
  }, []);

  const celestialClass = body.kind === "sun" ? "shubhu-hero-body--sun" : "shubhu-hero-body--moon";

  return (
    <div
      ref={layerRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 bottom-[20%] overflow-hidden"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`shubhu-hero-cloud shubhu-hero-cloud--${n}`}>
          <svg viewBox="0 0 120 60" aria-hidden="true" focusable="false">
            <g fill="currentColor">
              <ellipse cx="34" cy="40" rx="30" ry="16" />
              <ellipse cx="62" cy="29" rx="26" ry="19" />
              <ellipse cx="92" cy="41" rx="24" ry="15" />
            </g>
          </svg>
        </span>
      ))}
      <span className={`shubhu-hero-body ${celestialClass}`} style={{ transform: body.transform }}>
        {body.kind === "sun" ? <SunRays /> : null}
        <span className="shubhu-hero-body-core" />
        <span className="shubhu-hero-body-halo" />
      </span>
    </div>
  );
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
  const router = useRouter();
  const { setCurrentView } = useAppShell();
  const { user, isPlaying, playTrack, playShuffledQueue } = usePlayer();
  const { mode } = useDataMode();
  const playOptions = mode === "low" ? { appendSimilar: false } : undefined;

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
    // Keep the daypart + sky in sync with the clock, not just first paint.
    const timer = window.setInterval(() => setHour(new Date().getHours()), 60 * 1000);
    return () => {
      window.removeEventListener("storage", load);
      window.clearInterval(timer);
    };
  }, []);

  // Real play counts live in song_stats. The API only returns them for a
  // signed-in account; guests keep the local-history ordering in On Repeat.
  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    let cancelled = false;
    const activeMode = getActiveDataMode();
    const params = new URLSearchParams({
      userId,
      section: "most",
      limit: activeMode === "low" ? "10" : "20",
      mode: activeMode,
    });
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
  }, [user?.id, mode]);

  // A signed-out account must never see a previous account's real stats.
  const effectiveMostPlayed = user?.id ? mostPlayed : [];

  const daypart = daypartForHour(hour);
  // Sun is up 06:00–18:00, matching the arc HeroSky draws.
  const isDay = hour >= 6 && hour < 18;

  const history = useMemo(() => dedupeTracks([...recents, ...liked]), [recents, liked]);

  const mixes = useMemo(() => {
    const pool = history.length >= 7 ? history : dedupeTracks([...history, ...CURATED_TRACKS]);
    const artistCounts = new Map<string, number>();
    const genreCounts = new Map<string, number>();
    history.forEach((track) => {
      if (track.artist) artistCounts.set(track.artist, (artistCounts.get(track.artist) ?? 0) + 1);
      if (track.genre) genreCounts.set(track.genre, (genreCounts.get(track.genre) ?? 0) + 1);
    });
    return MIX_DEFS.map((def, index) => {
      const tracks = buildMixTracks(def, index, pool, artistCounts, genreCounts, daypart);
      const coverTrack = tracks.find((track) => track.coverUrl || track.youtubeId);
      let coverUrl: string | null = null;
      if (coverTrack) {
        const stable = getStableTrackArtworkUrl(coverTrack, "hq", mode);
        // A bare hash from downloaded/offline metadata is not a fetchable URL.
        // Rebuild the reliable YouTube thumbnail from the video id instead.
        const fetchable = /^(https?:\/\/|\/)/.test(stable);
        coverUrl = fetchable ? stable : getTrackArtworkUrl(coverTrack, "hq", mode);
      }
      return { ...def, tracks, coverUrl };
    });
  }, [history, daypart, mode]);

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
    <div className={`relative -mx-4 -mt-4 ${MOBILE_HOME_TOKENS.bottomPadding}`}>
      {/* Sky strip: backdrop, stars, drifting clouds and the sun/moon arc. */}
      <div className="relative overflow-hidden rounded-b-3xl" style={{ height: HERO_SKY_BAND_HEIGHT }}>
        <NightSky isDay={isDay} />
        <HeroSky isDay={isDay} />
        {/* Smooth fade at bottom to blend into page */}
        <div className="absolute inset-x-0 bottom-0 h-[30%] pointer-events-none" style={{ background: "linear-gradient(180deg, transparent 0%, var(--background) 100%)" }} />

        {/* Header rides on top of the sky, inside the strip. */}
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-4">
          <EqualizerLogo playing={isPlaying} animated={mode !== "low" || isPlaying} />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentView("search")}
              className="flex h-11 w-11 items-center justify-center text-white cursor-pointer shubhu-press"
              title="Search"
              aria-label="Search"
            >
              <Search className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => router.push("/settings")}
              className="flex h-11 w-11 items-center justify-center text-white cursor-pointer shubhu-press"
              title="Settings"
              aria-label="Settings"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Speed Dial — the rest of the page starts right under the sky strip. */}
      <div className="relative mt-5 px-4">
        <div className="shubhu-card-surface rounded-2xl p-4 backdrop-blur-sm">
          <div className="mb-4 flex items-center gap-2">
            <Zap className="h-4 w-4 fill-current" style={{ color: "var(--theme-accent-strong)" }} />
            <h2 className="font-display text-[17px] font-semibold tracking-tight text-white">Speed dial</h2>
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
      <div className={`relative ${MOBILE_HOME_TOKENS.sectionSpacing}`}>
        <SectionHeader icon={Star} title="Made for you" />
        <div className={MOBILE_HOME_TOKENS.horizontalRow}>
          {mixes.map((mix, mixIndex) => (
            <button
              key={mix.id}
              type="button"
              onClick={() => {
                if (mix.tracks.length > 0) void playTrack(mix.tracks[0], mix.tracks, playOptions);
              }}
              className={`shubhu-card-surface card-variant-${mixIndex % 4} ${MOBILE_HOME_TOKENS.horizontalCard} cursor-pointer rounded-2xl p-2 text-left shubhu-press`}
            >
              <span className="relative block overflow-hidden rounded-xl">
                {mix.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mix.coverUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    loading="eager"
                    decoding="async"
                    onError={(e) => applyStableArtworkFallback(e.currentTarget)}
                    className="aspect-square w-full rounded-xl object-cover scale-[1.18]"
                  />
                ) : (
                  <span className="block aspect-square w-full rounded-xl" style={{ backgroundImage: mix.gradient }} />
                )}
                <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--theme-accent)] shadow-lg">
                  <Play className="ml-0.5 h-3.5 w-3.5 fill-[var(--theme-accent-contrast)] text-[var(--theme-accent-contrast)]" />
                </span>
              </span>
              <span className="block px-1 pb-1 pt-2">
                <span className="block truncate text-[12px] font-bold leading-snug text-white">{mix.title}</span>
                <span className="mt-0.5 block truncate text-[11px] leading-snug" style={{ color: LAVENDER }}>
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
