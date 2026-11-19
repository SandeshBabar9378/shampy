"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Play,
  Pause,
  Heart,
  Sparkles,
  Music,
  Disc,
  Compass,
  Flame,
  Plus,
  UserPlus,
  Settings,
  MoreVertical,
  Pencil,
  Share2,
  ArrowUpDown,
  ListEnd,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Download,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TrackRow } from "@/components/TrackRow";
import { PlaylistCard } from "@/components/PlaylistCard";
import { CreatePlaylistModal } from "@/components/CreatePlaylistModal";
import { useAppShell } from "@/context/AppShellContext";
import { usePlayer } from "@/context/PlayerContext";
import { Track, Playlist } from "@/lib/types";
import { FEATURED_PLAYLISTS, CURATED_TRACKS } from "@/lib/musicProvider";
import { useDominantColor } from "@/hooks/useDominantColor";
import { PlaylistCollage } from "@/components/PlaylistCollage";
import { DOWNLOADS_ENABLED } from "@/lib/features";
import { getDefaultArtworkFallbackUrl, getTrackArtworkFallbackUrl, getTrackArtworkUrl, getYouTubeArtworkUrl } from "@/lib/artwork";

// Cinematic carousel per-offset values (index = distance from the active cover).
const CAROUSEL_SCALE = [1, 0.96, 0.9, 0.82];
const CAROUSEL_DIM = [0, 0.15, 0.28, 0.4];
const CAROUSEL_ROTATE_Y = [0, 53, 58, 63];
// Horizontal distance from the exact center as a fraction of the container width.
const CAROUSEL_X_FRACTION = [0, 0.23, 0.37, 0.45];

// Mobile coverflow: the centered cover dominates, side covers peek in at the
// edges with a stronger depth falloff. Kept separate so desktop is untouched.
// Values mirror the approved mockup: ~44% viewport-wide center card with the
// neighbours tilted behind it and only a sliver of each one peeking through.
const CAROUSEL_MOBILE_SCALE = [1, 0.78, 0.64, 0.54];
const CAROUSEL_MOBILE_DIM = [0, 0.2, 0.34, 0.48];
const CAROUSEL_MOBILE_ROTATE_Y = [0, 50, 58, 64];
const CAROUSEL_MOBILE_X_FRACTION = [0, 0.34, 0.5, 0.62];
const CAROUSEL_MOBILE_CENTER_FRACTION = 0.46;
// How long auto-rotation stays paused after the finger leaves the screen.
const CAROUSEL_RESUME_DELAY_MS = 1600;

/** Linear sample of a per-distance curve so fractional drag positions stay smooth. */
function sampleCarouselCurve(values: number[], distance: number): number {
  if (distance <= 0) return values[0];
  const clamped = Math.min(distance, values.length - 1);
  const index = Math.floor(clamped);
  const next = Math.min(index + 1, values.length - 1);
  const t = clamped - index;
  return values[index] + (values[next] - values[index]) * t;
}

const LANGUAGE_PLAYLIST_MAP: Record<string, string[]> = {
  Hindi: [
    "Bollywood Butter",
    "Trending Chartbusters",
    "Punjabi 101",
    "Indie India",
    "Lofi Chill & Study",
    "Today's Top Hits",
    "Rap Caviar & Hip Hop",
  ],
  English: [
    "Today's Top Hits",
    "Rap Caviar & Hip Hop",
    "Lofi Chill & Study",
    "Indie India",
    "Bollywood Butter",
  ],
  Marathi: [
    "Marathi Hits",
    "Indie India",
    "Today's Top Hits",
    "Bollywood Butter",
  ],
};

export default function Home() {
  const router = useRouter();
  const { currentView, setCurrentView, searchQuery, setSearchQuery, openCreatePlaylist } = useAppShell();
  const { user, playlists, savedPlaylists, likedSongIds, followedArtists, playTrack, toggleLike, queue, setAppQueue, deletePlaylist, downloads, offlineIds, downloadProgress, downloadTrack } = usePlayer();

  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [searchArtists, setSearchArtists] = useState<{ name: string; image: string; browseId: string }[]>([]);
  const [searchAlbums, setSearchAlbums] = useState<{ title: string; artist: string; cover: string; browseId: string }[]>([]);
  const [searchPlaylists, setSearchPlaylists] = useState<{ browseId: string; title: string; author: string; thumbnail: string; isCommunity?: boolean }[]>([]);
  const [communityHomePlaylists, setCommunityHomePlaylists] = useState<{ browseId: string; title: string; author: string; thumbnail: string; isCommunity?: boolean }[]>([]);
  const [searchTopResult, setSearchTopResult] = useState<Track | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const [homeTracks, setHomeTracks] = useState<Track[]>(CURATED_TRACKS);
  const [recommendations, setRecommendations] = useState<Track[]>([]);
  const [forYou, setForYou] = useState<Track[]>([]);
  const [mostPlayed, setMostPlayed] = useState<Track[]>([]);
  const [likedTracks, setLikedTracks] = useState<Track[]>([]);

  const [isEditPlaylistOpen, setIsEditPlaylistOpen] = useState(false);
  const [playlistMenuOpen, setPlaylistMenuOpen] = useState(false);
  const [playlistSortKey, setPlaylistSortKey] = useState<"default" | "title" | "artist" | "duration">("default");
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>([]);
  const [languagePreference, setLanguagePreference] = useState<string>("Hindi");
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [mounted, setMounted] = useState(false);

  // Dynamic greeting + recently played + language preference (SSR-safe, runs only after mount)
  const [greeting, setGreeting] = useState<string>("");
  useEffect(() => {
    setMounted(true);
    const hours = new Date().getHours();
    if (hours >= 5 && hours < 12) setGreeting(`Good morning, ${user?.username ?? "Guest"} 👋`);
    else if (hours >= 12 && hours < 17) setGreeting(`Good afternoon, ${user?.username ?? "Guest"} 👋`);
    else setGreeting(`Good evening, ${user?.username ?? "Guest"} 👋`);

    // Load recently played from localStorage (SSR-safe)
    try {
      const raw = localStorage.getItem("recentlyPlayed");
      if (raw) setRecentlyPlayed(JSON.parse(raw) as Track[]);
      const lang = localStorage.getItem("languagePreference");
      if (lang) setLanguagePreference(lang);
    } catch {}

    const handleStorage = () => {
      try {
        const lang = localStorage.getItem("languagePreference");
        if (lang) setLanguagePreference(lang);
        const storedLikes = localStorage.getItem("likedSongs") || localStorage.getItem("shubhu_liked_songs");
        if (storedLikes) setLikedTracks(JSON.parse(storedLikes));
        const rec = localStorage.getItem("recentlyPlayed");
        if (rec) setRecentlyPlayed(JSON.parse(rec));
      } catch {}
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [user?.username]);

  // Fetch initial home recommendations
  useEffect(() => {
    fetch("/api/search?q=top+hits+india")
      .then((res) => res.json())
      .then((data) => {
        const rawTracks = Array.isArray(data) ? data : data.tracks || [];
        if (rawTracks.length > 0) {
          const mapped: Track[] = rawTracks.map((item: { videoId?: string; id?: string; title: string; artist: string; album?: string; thumbnail?: string; coverUrl?: string; duration?: number; artistId?: string }) => {
            const vid = item.videoId || (item.id && /^[A-Za-z0-9_-]{11}$/.test(item.id) ? item.id : undefined);
            const cover = item.thumbnail || item.coverUrl || getYouTubeArtworkUrl(vid, "max") || getDefaultArtworkFallbackUrl();
            return {
              id: vid || item.id || String(Math.random()),
              title: item.title,
              artist: item.artist,
              album: item.album || "",
              coverUrl: cover,
              duration: item.duration || 180,
              youtubeId: vid,
              artistId: item.artistId,
            };
          });
          setHomeTracks(mapped);
        }
      })
      .catch((e) => console.error(e));
  }, []);

  // Fetch Community Playlists for Home. Aggregates several recent/liked tracks
  // so one song cannot decide the whole row; falls back to the broad default.
  useEffect(() => {
    let query = "hindi playlist";
    try {
      const raw = localStorage.getItem("recentlyPlayed");
      const recents: Track[] = raw ? JSON.parse(raw) : [];
      const history = [
        ...(Array.isArray(likedTracks) ? likedTracks : []),
        ...(Array.isArray(recents) ? recents : []),
      ];
      const artistCounts = new Map<string, number>();
      const genreCounts = new Map<string, number>();
      history.forEach((t) => {
        if (t.artist && t.artist !== "Unknown Artist") {
          artistCounts.set(t.artist, (artistCounts.get(t.artist) || 0) + 1);
        }
        if (t.genre) genreCounts.set(t.genre, (genreCounts.get(t.genre) || 0) + 1);
      });
      const topArtist = Array.from(artistCounts.entries()).sort((a, b) => b[1] - a[1])[0];
      const topGenre = Array.from(genreCounts.entries()).sort((a, b) => b[1] - a[1])[0];
      // Two or more tracks pointing at the same artist is a real signal.
      if (topArtist && topArtist[1] >= 2) query = `${topArtist[0]} playlist`;
      else if (topGenre && topGenre[1] >= 2) query = `${topGenre[0]} playlist`;
    } catch {}

    fetch(`/api/search?q=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .then((data) => {
        const playlists = Array.isArray(data?.playlists) ? data.playlists : [];
        if (playlists.length > 0) {
          setCommunityHomePlaylists(playlists.slice(0, 10));
        }
      })
      .catch(() => {});
  }, [recentlyPlayed, likedTracks]);

  // Fetch full liked songs when liked view is opened
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("likedSongs") || localStorage.getItem("shubhu_liked_songs");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setLikedTracks(parsed);
          }
        }
      } catch {}
    }

    if (currentView === "liked" && user?.id) {
      fetch(`/api/library?userId=${user.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.likedSongs && data.likedSongs.length > 0) {
            setLikedTracks(data.likedSongs);
            try {
              localStorage.setItem("likedSongs", JSON.stringify(data.likedSongs));
            } catch {}
          }
        })
        .catch(() => {});
    }
  }, [currentView, user?.id, likedSongIds]);

  // Recommended For You. The server ranks a per-user slate when it can; the
  // previous local + /api/next build stays as the exact fallback, and the
  // section's visibility still depends only on `recommendations.length`.
  const recommendSessionRef = useRef<string>("");

  useEffect(() => {
    // Stable per page load, so the server can keep one slate for this session.
    if (!recommendSessionRef.current) {
      recommendSessionRef.current = `rec_${Math.random().toString(36).slice(2, 10)}`;
    }

    const seeds: { track: Track; videoId: string }[] = [];
    const seen = new Set<string>();

    [...recentlyPlayed, ...likedTracks].forEach((track) => {
      if (seeds.length >= 3 || !track?.id || seen.has(track.id)) return;
      const videoId =
        track.youtubeId || (/^[A-Za-z0-9_-]{11}$/.test(track.id) ? track.id : "");
      if (!videoId) return;
      seen.add(track.id);
      seeds.push({ track, videoId });
    });

    if (seeds.length === 0) {
      setRecommendations([]);
      return;
    }

    let cancelled = false;

    const buildFromRadio = () => {
      Promise.all(
        seeds.map(async ({ videoId }) => {
          try {
            const res = await fetch(`/api/next?videoId=${encodeURIComponent(videoId)}`);
            if (!res.ok) return [];
            const data = await res.json();
            return Array.isArray(data) ? data : [];
          } catch {
            return [];
          }
        }),
      )
        .then((pages) => {
          if (cancelled) return;

          const seedIds = new Set(seeds.map(({ track }) => track.id));
          const merged = new Map<string, Track>();

          for (const page of pages) {
            const items = page as {
              videoId?: string;
              title?: string;
              artist?: string;
              album?: string;
              thumbnail?: string;
              duration?: number;
            }[];

            for (const item of items) {
              if (
                !item?.videoId ||
                !item.title ||
                seedIds.has(item.videoId) ||
                merged.has(item.videoId)
              ) {
                continue;
              }
              merged.set(item.videoId, {
                id: item.videoId,
                title: item.title,
                artist: item.artist || "Unknown Artist",
                album: item.album || "",
                coverUrl:
                  item.thumbnail ||
                  getYouTubeArtworkUrl(item.videoId, "max") ||
                  getDefaultArtworkFallbackUrl(),
                duration: item.duration || 180,
                youtubeId: item.videoId,
              });
            }
          }

          setRecommendations(Array.from(merged.values()).slice(0, 20));
        })
        .catch((e) => console.error("Error building recommendations:", e));
    };

    const userId = user?.id;
    if (userId) {
      const params = new URLSearchParams({
        userId,
        section: "recommended",
        limit: "20",
        session: recommendSessionRef.current,
      });
      fetch(`/api/recommend?${params.toString()}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: unknown) => {
          if (cancelled) return;
          const payload = data as { recommended?: Track[] } | null;
          const ranked = payload?.recommended;
          const playable = (Array.isArray(ranked) ? ranked : []).filter((track) => {
            if (!track || !track.id) return false;
            return Boolean(track.youtubeId && /^[A-Za-z0-9_-]{11}$/.test(track.youtubeId)) ||
              /^[A-Za-z0-9_-]{11}$/.test(track.id);
          });
          if (playable.length === 0) {
            buildFromRadio();
            return;
          }
          setRecommendations(playable.slice(0, 20));
        })
        .catch(() => {
          if (!cancelled) buildFromRadio();
        });
    } else {
      buildFromRadio();
    }

    return () => {
      cancelled = true;
    };
  }, [recentlyPlayed, likedTracks, user?.id]);

  // Additional Home sources with a single source of truth each:
  //   most  -> real play counts from song_stats
  //   for-you -> overall-taste slate (no seed-track bias)
  useEffect(() => {
    const userId = user?.id;
    let cancelled = false;

    const fetchTracks = async (section: "most" | "for-you", limit: number) => {
      const params = new URLSearchParams({
        userId: userId ?? "",
        section,
        limit: String(limit),
        session: recommendSessionRef.current,
      });
      const res = await fetch(`/api/recommend?${params.toString()}`);
      if (!res.ok) return [] as Track[];
      const data = (await res.json()) as { tracks?: Track[] } | null;
      return Array.isArray(data?.tracks) ? data.tracks : [];
    };

    const run = async () => {
      if (!userId) {
        if (!cancelled) {
          setForYou([]);
          setMostPlayed([]);
        }
        return;
      }
      const [most, personal] = await Promise.all([fetchTracks("most", 8), fetchTracks("for-you", 10)]);
      if (cancelled) return;
      setMostPlayed(most);
      setForYou(personal);
    };

    run().catch((err) => {
      if (!cancelled) console.error("Error loading Home personalisation:", err);
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!shareNotice) return;
    const timeout = setTimeout(() => setShareNotice(null), 2500);
    return () => clearTimeout(timeout);
  }, [shareNotice]);

  // Live search debounced
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearchArtists([]);
      setSearchAlbums([]);
      setSearchPlaylists([]);
      setSearchTopResult(null);
      return;
    }

    const timer = setTimeout(() => {
      setIsSearching(true);
      fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`)
        .then((res) => res.json())
        .then((data) => {
          const rawTracks: { videoId?: string; id?: string; title: string; artist: string; album?: string; thumbnail?: string; coverUrl?: string; duration?: number; artistId?: string }[] = Array.isArray(data)
            ? data
            : data.tracks || [];
          const hasVideoId = (item: { videoId?: string; id?: string }) =>
            Boolean(item.videoId || (item.id && /^[A-Za-z0-9_-]{11}$/.test(item.id)));
          const toTrack = (item: { videoId?: string; id?: string; title: string; artist: string; album?: string; thumbnail?: string; coverUrl?: string; duration?: number; artistId?: string }): Track => {
            const vid = item.videoId || (item.id && /^[A-Za-z0-9_-]{11}$/.test(item.id) ? item.id : undefined);
            return {
              id: vid || item.id || "",
              title: item.title,
              artist: item.artist,
              album: item.album || "",
              coverUrl: item.thumbnail || item.coverUrl || getYouTubeArtworkUrl(vid, "max") || getDefaultArtworkFallbackUrl(),
              duration: item.duration || 180,
              youtubeId: vid,
              artistId: item.artistId,
            };
          };
          const mappedTracks: Track[] = rawTracks.filter(hasVideoId).map(toTrack);
          setSearchResults(mappedTracks);
          if (Array.isArray(data)) {
            setSearchArtists([]);
            setSearchAlbums([]);
            setSearchPlaylists([]);
            setSearchTopResult(null);
          } else {
            setSearchTopResult(
              data.topResult && hasVideoId(data.topResult) ? toTrack(data.topResult) : mappedTracks[0] || null,
            );
            setSearchArtists(
              (data.artists || []).map((artist: { name: string; thumbnail?: string; browseId?: string }) => ({
                name: artist.name,
                image: artist.thumbnail || "/placeholder.svg",
                browseId: artist.browseId || "",
              })),
            );
            setSearchAlbums(
              (data.albums || []).map((album: { title: string; artist?: string; thumbnail?: string; browseId?: string }) => ({
                title: album.title,
                artist: album.artist || "",
                cover: album.thumbnail || "/placeholder.svg",
                browseId: album.browseId || "",
              })),
            );
            setSearchPlaylists(data.playlists || []);
          }
          setIsSearching(false);
        })
        .catch(() => setIsSearching(false));
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Resolve custom playlist if in view
  const activeCustomPlaylist = currentView.startsWith("playlist:")
    ? playlists.find((p) => p.id === currentView.replace("playlist:", ""))
    : null;

  // Custom playlist dominant color
  const playlistDominantColor = useDominantColor(activeCustomPlaylist?.coverUrl);

  // Playlist page "Sort by" — display order only, does not rewrite stored order.
  const displayedPlaylistTracks = useMemo(() => {
    const tracks = [...(activeCustomPlaylist?.tracks ?? [])];
    if (playlistSortKey === "title") {
      tracks.sort((a, b) => a.title.localeCompare(b.title));
    } else if (playlistSortKey === "artist") {
      tracks.sort((a, b) => a.artist.localeCompare(b.artist));
    } else if (playlistSortKey === "duration") {
      tracks.sort((a, b) => a.duration - b.duration);
    }
    return tracks;
  }, [activeCustomPlaylist, playlistSortKey]);

  const handleSharePlaylist = async () => {
    if (!activeCustomPlaylist) return;
    const url = `${window.location.origin}/?playlist=${activeCustomPlaylist.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: activeCustomPlaylist.name, url });
        setShareNotice("Shared");
      } else {
        await navigator.clipboard.writeText(url);
        setShareNotice("Link copied");
      }
    } catch {
      setShareNotice("Share cancelled");
    }
    setPlaylistMenuOpen(false);
  };

  const handleAddPlaylistToQueue = () => {
    if (!activeCustomPlaylist?.tracks?.length) return;
    const queueIds = new Set(queue.map((track) => track.id));
    const additions = activeCustomPlaylist.tracks.filter((track) => !queueIds.has(track.id));
    if (additions.length > 0) setAppQueue([...queue, ...additions]);
    setPlaylistMenuOpen(false);
    setShareNotice("Added to queue");
  };

  const handleDeletePlaylist = async () => {
    if (!activeCustomPlaylist) return;
    if (!window.confirm(`Delete "${activeCustomPlaylist.name}"? This cannot be undone.`)) return;
    await deletePlaylist(activeCustomPlaylist.id);
    setPlaylistMenuOpen(false);
    setCurrentView("library");
  };

  // Step 2 & 3: Smart recommendations calculation
  const { topGenres, hasListeningHistory, madeForYouTracks, prioritizedPlaylists } = useMemo(() => {
    const genreCounts: Record<string, number> = {};
    const allHistory = [...likedTracks, ...recentlyPlayed];

    allHistory.forEach((song) => {
      if (song.genre) {
        genreCounts[song.genre] = (genreCounts[song.genre] || 0) + 1;
      }
    });

    const genres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([genre]) => genre);

    // Combine pool: curated + home tracks + recently played
    const pool = Array.from(
      new Map(
        [...CURATED_TRACKS, ...homeTracks, ...recommendations].map((t) => [t.id, t])
      ).values()
    );

    // Filter "Made For You":
    // a) language match (song.language === preference)
    // b) genre match (song.genre in topGenres)
    // If no listening history -> show "Featured Picks" with curated Hindi/popular songs instead
    let madeForYou: Track[] = [];
    if (allHistory.length > 0 && genres.length > 0) {
      madeForYou = pool.filter((song) => {
        const matchLang = !song.language || song.language.toLowerCase() === languagePreference.toLowerCase();
        const matchGenre = song.genre && genres.includes(song.genre);
        return matchLang || matchGenre;
      });
    }

    // Fallback: if no history or empty madeForYou -> pick curated tracks matching language or top curated
    if (madeForYou.length === 0) {
      madeForYou = CURATED_TRACKS.filter(
        (t) => !t.language || t.language.toLowerCase() === "hindi" || t.language.toLowerCase() === languagePreference.toLowerCase()
      );
      if (madeForYou.length === 0) {
        madeForYou = CURATED_TRACKS;
      }
    }

    // The engine's overall-taste slate (long-term + bounded mood) is a stronger
    // source than local genre matching whenever it has real picks.
    if (forYou.length > 0) madeForYou = forYou;

    // Prioritized playlists based on language
    const preferredNames = LANGUAGE_PLAYLIST_MAP[languagePreference] || LANGUAGE_PLAYLIST_MAP.Hindi;
    const prioritized = [...FEATURED_PLAYLISTS].sort((a, b) => {
      const idxA = preferredNames.indexOf(a.name);
      const idxB = preferredNames.indexOf(b.name);
      const valA = idxA === -1 ? 999 : idxA;
      const valB = idxB === -1 ? 999 : idxB;
      return valA - valB;
    });

    return {
      topGenres: genres,
      hasListeningHistory: allHistory.length > 0,
      madeForYouTracks: madeForYou.slice(0, 10),
      prioritizedPlaylists: prioritized,
    };
  }, [likedTracks, recentlyPlayed, languagePreference, homeTracks, recommendations, forYou]);

  // Home data (the "All" feed — there is no mood filtering anymore).
  const displayHomeTracks = homeTracks;
  const displayPopularTracks = homeTracks.slice(0, 10);
  // Real play counts win over the 6-item localStorage recents list.
  const displayMostPlayed =
    mostPlayed.length > 0
      ? mostPlayed.slice(0, 8)
      : recentlyPlayed.length > 0
        ? recentlyPlayed.slice(0, 8)
        : homeTracks.slice(0, 8);
  const displayPlaylists = communityHomePlaylists;

  // Cinematic carousel: auto-advance, hover pause, tab visibility, reduced motion.
  const [carouselHovered, setCarouselHovered] = useState(false);
  const [carouselTabVisible, setCarouselTabVisible] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  // Bumped on every interaction so the 4s auto-advance restarts.
  const [carouselResetKey, setCarouselResetKey] = useState(0);
  const restartCarouselTimer = () => setCarouselResetKey((key) => key + 1);

  // Mobile-only gesture state. `carouselIndex` doubles as a fractional position
  // while a finger is down, then snaps to the nearest whole album on release.
  const [isMobileCarousel, setIsMobileCarousel] = useState(false);
  const [carouselDragging, setCarouselDragging] = useState(false);
  // Explicit pause: rotation stops the moment a finger lands and only resumes
  // after a short idle window following release. One timer, always cleared first.
  const [carouselManuallyPaused, setCarouselManuallyPaused] = useState(false);
  const carouselResumeTimerRef = useRef<number | null>(null);
  const stopCarouselResumeTimer = () => {
    if (carouselResumeTimerRef.current !== null) {
      window.clearTimeout(carouselResumeTimerRef.current);
      carouselResumeTimerRef.current = null;
    }
  };
  const carouselDragRef = useRef({
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    startIndex: 0,
    lastDx: 0,
    lastX: 0,
    lastTime: 0,
    velocity: 0,
    horizontal: null as boolean | null,
  });
  const carouselSuppressClickRef = useRef(false);

  // Measured carousel area, used to size/position the covers in pixels.
  const carouselAreaRef = useRef<HTMLDivElement | null>(null);
  const [carouselBox, setCarouselBox] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const updateVisibility = () => setCarouselTabVisible(!document.hidden);
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  // Keep the pixel box in sync with the responsive carousel area.
  useEffect(() => {
    const element = carouselAreaRef.current;
    if (!element) return;
    const measure = () =>
      setCarouselBox({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [currentView, displayHomeTracks.length]);

  const carouselCount = Math.min(9, displayHomeTracks.length);

  useEffect(() => {
    if (
      prefersReducedMotion ||
      !carouselTabVisible ||
      carouselHovered ||
      carouselManuallyPaused ||
      carouselCount <= 1
    ) {
      return;
    }
    const id = window.setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % carouselCount);
    }, 4000);
    return () => window.clearInterval(id);
  }, [
    prefersReducedMotion,
    carouselTabVisible,
    carouselHovered,
    carouselManuallyPaused,
    carouselCount,
    carouselIndex,
    carouselResetKey,
  ]);

  // The resume timer is a single instance; clear it when the carousel unmounts.
  useEffect(() => {
    return () => {
      if (carouselResumeTimerRef.current !== null) {
        window.clearTimeout(carouselResumeTimerRef.current);
      }
    };
  }, []);

  // Mobile carousel gestures are enabled only below the sm breakpoint.
  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobileCarousel(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // Pixel distance the covers travel per album step.
  const carouselStepPx = Math.max(
    1,
    (carouselBox.width || 360) *
      (isMobileCarousel ? CAROUSEL_MOBILE_X_FRACTION[1] : CAROUSEL_X_FRACTION[1])
  );

  const scheduleCarouselResume = () => {
    stopCarouselResumeTimer();
    carouselResumeTimerRef.current = window.setTimeout(() => {
      carouselResumeTimerRef.current = null;
      restartCarouselTimer();
      setCarouselManuallyPaused(false);
    }, CAROUSEL_RESUME_DELAY_MS);
  };

  const handleCarouselPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isMobileCarousel || carouselCount <= 1) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    stopCarouselResumeTimer();
    const now = performance.now();
    carouselDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startIndex: carouselIndex,
      lastDx: 0,
      lastX: event.clientX,
      lastTime: now,
      velocity: 0,
      horizontal: null,
    };
    carouselSuppressClickRef.current = false;
    // Stop auto-rotation the instant the finger lands. It can only come back
    // after a quiet idle period once the finger has left the screen.
    setCarouselManuallyPaused(true);
    setCarouselDragging(true);
  };

  const handleCarouselPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = carouselDragRef.current;
    if (drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (drag.horizontal === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      drag.horizontal = Math.abs(dx) > Math.abs(dy) * 1.15;
      if (!drag.horizontal) return;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    if (!drag.horizontal) return;
    event.preventDefault();
    const now = performance.now();
    const dt = now - drag.lastTime;
    if (dt > 0) {
      const sample = (event.clientX - drag.lastX) / dt;
      drag.velocity = drag.velocity * 0.35 + sample * 0.65;
      drag.lastX = event.clientX;
      drag.lastTime = now;
    }
    drag.lastDx = dx;
    if (Math.abs(dx) > 6) carouselSuppressClickRef.current = true;
    // Direct finger tracking: a single gesture can pass through any number of
    // albums instead of being capped at one card per swipe.
    const raw = drag.startIndex - dx / carouselStepPx;
    setCarouselIndex(((raw % carouselCount) + carouselCount) % carouselCount);
  };

  const handleCarouselPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = carouselDragRef.current;
    if (drag.pointerId !== event.pointerId) return;
    const wasHorizontal = drag.horizontal;
    if (wasHorizontal) {
      // Momentum: a fast flick can travel through several albums at once.
      // Ignore a stale velocity if the finger paused before lifting.
      const idleMs = performance.now() - drag.lastTime;
      const velocity = idleMs < 90 ? drag.velocity : 0;
      const maxMomentum = carouselStepPx * 2.5;
      const momentum = Math.max(-maxMomentum, Math.min(maxMomentum, velocity * 180));
      const rawTarget = drag.startIndex - (drag.lastDx + momentum) / carouselStepPx;
      const target = Math.round(rawTarget);
      setCarouselIndex(((target % carouselCount) + carouselCount) % carouselCount);
    }
    drag.pointerId = null;
    drag.horizontal = null;
    drag.velocity = 0;
    setCarouselDragging(false);
    // Always start the idle window, even for a tap that never became a swipe.
    scheduleCarouselResume();
  };

  return (
    <>
      {/* Scrollable Viewport */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-4 sm:py-6 pb-[calc(var(--player-height)+24px)] scrollbar-thin scrollbar-thumb-neutral-800">
          {/* ===================== HOME VIEW ===================== */}
          {currentView === "home" && (
            <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-200">
              {/* Header Greeting */}
              <div>
                <div className="flex items-center justify-between mb-4 sm:mb-6">
                  <h1 className="font-display text-2xl sm:text-5xl font-bold tracking-tight text-white">
                    {greeting}
                  </h1>
                </div>

                {/* Trending Carousel / "Top songs right now" Box */}
                {displayHomeTracks.length > 0 && (() => {
                  const carouselTracks = displayHomeTracks.slice(0, 9);
                  const total = carouselTracks.length;
                  const activeIdx = ((carouselIndex % total) + total) % total;
                  // Fractional during a mobile drag, whole numbers otherwise.
                  const position = carouselIndex;
                  // Center cover: on mobile it stays near half the screen width so
                  // both neighbours can peek in; desktop keeps its original sizing.
                  const centerSize =
                    carouselBox.width > 0 && carouselBox.height > 0
                      ? isMobileCarousel
                        ? Math.min(carouselBox.height * 0.86, carouselBox.width * CAROUSEL_MOBILE_CENTER_FRACTION)
                        : Math.min(carouselBox.height - 48, carouselBox.width * 0.3)
                      : 220;
                  const containerWidth = carouselBox.width || 900;
                  const curveScale = isMobileCarousel ? CAROUSEL_MOBILE_SCALE : CAROUSEL_SCALE;
                  const curveDim = isMobileCarousel ? CAROUSEL_MOBILE_DIM : CAROUSEL_DIM;
                  const curveRotate = isMobileCarousel ? CAROUSEL_MOBILE_ROTATE_Y : CAROUSEL_ROTATE_Y;
                  const curveX = isMobileCarousel ? CAROUSEL_MOBILE_X_FRACTION : CAROUSEL_X_FRACTION;
                  const depthZ = isMobileCarousel ? 44 : 60;
                  const cardRadius = isMobileCarousel ? 22 : 28;
                  // At most 7 ambient layers: the visible tracks within +/-3 of the center.
                  const ambientLayers = carouselTracks
                    .map((track, idx) => {
                      const rawOffset = idx - activeIdx;
                      const offset =
                        rawOffset > total / 2
                          ? rawOffset - total
                          : rawOffset < -total / 2
                          ? rawOffset + total
                          : rawOffset;
                      return { track, offset };
                    })
                    .filter((entry) => Math.abs(entry.offset) <= 3);
                  const dotCount = Math.min(7, total);
                  const activeDot =
                    total <= 7
                      ? activeIdx
                      : Math.round((activeIdx / Math.max(1, total - 1)) * (dotCount - 1));
                  const transitionTiming = prefersReducedMotion
                    ? "none"
                    : carouselDragging
                    ? "none"
                    : `transform ${isMobileCarousel ? 620 : 800}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${
                        isMobileCarousel ? 620 : 800
                      }ms cubic-bezier(0.22, 1, 0.36, 1)`;

                  return (
                    <div
                      className="mb-4 sm:mb-8 relative overflow-hidden rounded-[28px] border border-white/[0.06] shadow-2xl theme-dark-surface"
                      style={{
                        background:
                          "radial-gradient(120% 130% at 50% 115%, var(--carousel-glow) 0%, var(--carousel-base) 55%, var(--carousel-base) 100%)",
                      }}
                      onMouseEnter={() => {
                        if (!isMobileCarousel) setCarouselHovered(true);
                      }}
                      onMouseLeave={() => {
                        if (!isMobileCarousel) setCarouselHovered(false);
                      }}
                    >
                      {/* Ambient color layers: one per visible song (max 7), blurred cover art */}
                      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
                        {ambientLayers.map(({ track, offset }) => (
                          <div
                            key={`ambient-${track.id}`}
                            className="absolute inset-0"
                            style={{
                              backgroundImage: track.coverUrl ? `url("${getTrackArtworkUrl(track, "max")}")` : undefined,
                              backgroundSize: "140% 140%",
                              backgroundPosition: "center",
                              filter: "blur(70px) saturate(1.4)",
                              opacity: offset === 0 ? 0.35 : 0,
                              transition: prefersReducedMotion
                                ? "none"
                                : "opacity 800ms cubic-bezier(0.22, 1, 0.36, 1)",
                            }}
                          />
                        ))}
                      </div>
                      {/* Dark overlay so text stays readable above the ambient tint */}
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background:
                            "linear-gradient(180deg, var(--carousel-veil-top) 0%, var(--carousel-veil-mid) 42%, var(--carousel-veil-bottom) 100%)",
                        }}
                      />
                      {/* Faint purple bottom glow, blue right glow, subtle light behind the center */}
                      <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-[70%] h-64 rounded-full bg-fuchsia-600/20 blur-[90px] pointer-events-none" />
                      <div className="absolute top-1/2 -right-24 -translate-y-1/2 w-64 h-[70%] rounded-full bg-blue-600/15 blur-[90px] pointer-events-none" />
                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[46%] h-[62%] rounded-full bg-white/[0.05] blur-3xl pointer-events-none" />

                      {/* Header */}
                      <div className="relative z-10 px-4 pt-4 sm:px-6 sm:pt-6">
                        <h2 className="font-serif text-xl sm:text-3xl font-bold text-white tracking-tight">
                          Top songs right now
                        </h2>
                        <p className="text-[11px] sm:text-xs text-neutral-400 mt-1">
                          Curated daily based on real-time stream velocity
                        </p>
                      </div>

                      {/* Outer clipper (clips the outer covers at the card edge) */}
                      <div
                        ref={carouselAreaRef}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowLeft") {
                            e.preventDefault();
                            restartCarouselTimer();
                            setCarouselIndex((prev) => (prev - 1 + total) % total);
                          } else if (e.key === "ArrowRight") {
                            e.preventDefault();
                            restartCarouselTimer();
                            setCarouselIndex((prev) => (prev + 1) % total);
                          }
                        }}
                        onPointerDown={handleCarouselPointerDown}
                        onPointerMove={handleCarouselPointerMove}
                        onPointerUp={handleCarouselPointerEnd}
                        onPointerCancel={handleCarouselPointerEnd}
                        style={isMobileCarousel ? { touchAction: "pan-y" } : undefined}
                        className="shubhu-carousel-stage relative z-10 mt-3 overflow-hidden outline-none focus-visible:ring-1 focus-visible:ring-emerald-400/30"
                      >
                        {/* Faint ground reflection / shadow under the row */}
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[64%] h-10 rounded-[100%] bg-black/50 blur-2xl pointer-events-none" />
                        {/* Soft glow behind the center cover */}
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[44%] h-[58%] rounded-full bg-emerald-400/[0.06] blur-3xl pointer-events-none" />

                        {/* Perspective element */}
                        <div className="absolute inset-0" style={{ perspective: "1400px" }}>
                          {/* 3D stage — must NOT have overflow hidden */}
                          <div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
                            {carouselTracks.map((track, idx) => {
                              const rawOffset = idx - position;
                              let offset = rawOffset;
                              while (offset > total / 2) offset -= total;
                              while (offset < -total / 2) offset += total;
                              const distance = Math.abs(offset);
                              // Nearest cover owns the title/play overlay, even mid-drag.
                              const isCenter = distance < 0.5;
                              const isHidden = distance > 3;
                              const scale = sampleCarouselCurve(curveScale, distance);
                              // Left covers tilt with a positive angle, right covers negative.
                              const rotateY = -Math.sign(offset) * sampleCarouselCurve(curveRotate, distance);
                              const translateX =
                                Math.sign(offset) * sampleCarouselCurve(curveX, distance) * containerWidth;

                              return (
                                <div
                                  key={track.id}
                                  onClick={() => {
                                    if (carouselSuppressClickRef.current) {
                                      carouselSuppressClickRef.current = false;
                                      return;
                                    }
                                    restartCarouselTimer();
                                    if (isCenter) {
                                      playTrack(track, carouselTracks);
                                    } else {
                                      setCarouselIndex(((idx % total) + total) % total);
                                    }
                                  }}
                                  className={`absolute left-1/2 top-1/2 select-none ${
                                    isHidden ? "pointer-events-none" : "cursor-pointer"
                                  }`}
                                  style={{
                                    width: centerSize,
                                    height: centerSize,
                                    borderRadius: cardRadius,
                                    transform: `translate(-50%, -50%) translateX(${translateX}px) translateZ(${
                                      -distance * depthZ
                                    }px) rotateY(${rotateY}deg) scale(${scale})`,
                                    opacity: isHidden ? 0 : 1,
                                    zIndex: 30 - Math.round(distance),
                                    willChange: "transform",
                                    transition: transitionTiming,
                                  }}
                                >
                                  <div
                                    className={`relative w-full h-full overflow-hidden border ${
                                      isCenter
                                        ? "border-emerald-500/40 shadow-[0_32px_64px_rgba(0,0,0,0.6)]"
                                        : "border-white/10 shadow-[0_24px_48px_rgba(0,0,0,0.45)]"
                                    }`}
                                    style={{ borderRadius: cardRadius }}
                                  >
                                    <img
                                      src={getTrackArtworkUrl(track, "max")}
                                      alt={track.title}
                                      crossOrigin="anonymous"
                                      referrerPolicy="no-referrer"
                                      onError={(e) => {
                                        e.currentTarget.src = getTrackArtworkFallbackUrl(track, "hq");
                                      }}
                                      className="w-full h-full object-cover"
                                    />

                                    {/* Per-offset dim overlay (no CSS filter animation) */}
                                    <div
                                      className="absolute inset-0 pointer-events-none bg-black"
                                      style={{
                                        opacity: sampleCarouselCurve(curveDim, distance),
                                        transition: prefersReducedMotion
                                          ? "none"
                                          : `opacity ${isMobileCarousel ? 620 : 800}ms cubic-bezier(0.22, 1, 0.36, 1)`,
                                      }}
                                    />

                                    {/* Center cover actions. Mobile follows the approved
                                        mockup: centred white play disc + top-right heart.
                                        Desktop keeps its original title + green play button. */}
                                    {isCenter && (
                                      <>
                                        <div className="hidden sm:block absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />
                                        <div className="hidden sm:block absolute inset-x-0 bottom-0 z-10 p-5 pr-[84px]">
                                          <h3 className="font-serif font-bold text-white text-[22px] leading-tight truncate">
                                            {track.title}
                                          </h3>
                                          <p className="text-[14px] text-white/80 truncate mt-1">
                                            {track.artist}
                                          </p>
                                        </div>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (carouselSuppressClickRef.current) {
                                              carouselSuppressClickRef.current = false;
                                              return;
                                            }
                                            restartCarouselTimer();
                                            playTrack(track, carouselTracks);
                                          }}
                                          className="absolute z-20 flex items-center justify-center rounded-full cursor-pointer transition-transform hover:scale-105 active:scale-95 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-white/20 border border-white/70 text-white backdrop-blur-sm sm:left-auto sm:top-auto sm:bottom-[18px] sm:right-[18px] sm:translate-x-0 sm:translate-y-0 sm:w-[52px] sm:h-[52px] sm:bg-emerald-500 sm:border-0 sm:text-black sm:shadow-[0_0_24px_rgba(16,185,129,0.45)] hover:bg-[var(--theme-accent-strong)]"
                                          title="Play"
                                        >
                                          <Play className="w-6 h-6 sm:w-5 sm:h-5 fill-white sm:fill-black ml-0.5" />
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (carouselSuppressClickRef.current) {
                                              carouselSuppressClickRef.current = false;
                                              return;
                                            }
                                            void toggleLike(track);
                                          }}
                                          className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full flex items-center justify-center text-white bg-black/20 backdrop-blur-sm cursor-pointer sm:hidden"
                                          title="Save to Liked Songs"
                                        >
                                          <Heart className={`w-6 h-6 ${likedSongIds.has(track.id) ? "fill-white" : ""}`} />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Controls: hidden on mobile (swipe/auto-rotate handles navigation there),
                          desktop keeps the original compact centered cluster. */}
                      <div className="relative z-10 hidden sm:flex items-center justify-between gap-2 px-4 pt-3 pb-4 sm:justify-center sm:gap-3 sm:px-6 sm:pt-4 sm:pb-5">
                        <button
                          onClick={() => {
                            restartCarouselTimer();
                            setCarouselIndex((prev) => (prev - 1 + total) % total);
                          }}
                          className="w-11 h-11 shrink-0 rounded-full bg-black/40 border border-white/10 text-white flex items-center justify-center cursor-pointer hover:bg-black/60 transition-colors sm:w-9 sm:h-9"
                          title="Previous song"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>

                        <div className="flex flex-1 items-center justify-center gap-1.5 sm:flex-none">
                          {Array.from({ length: dotCount }).map((_, i) => {
                            const isActive = i === activeDot;
                            return (
                              <button
                                key={`dot-${i}`}
                                onClick={() => {
                                  restartCarouselTimer();
                                  const target =
                                    total <= 7
                                      ? i
                                      : Math.round((i / Math.max(1, dotCount - 1)) * (total - 1));
                                  setCarouselIndex(target);
                                }}
                                className={`rounded-full cursor-pointer transition-all duration-300 ${
                                  isActive
                                    ? "w-[22px] h-1.5 bg-emerald-500"
                                    : "w-1.5 h-1.5 bg-white/25 hover:bg-white/40"
                                }`}
                                title={`Slide ${i + 1}`}
                              />
                            );
                          })}
                        </div>

                        <button
                          onClick={() => {
                            restartCarouselTimer();
                            setCarouselIndex((prev) => (prev + 1) % total);
                          }}
                          className="w-11 h-11 shrink-0 rounded-full bg-black/40 border border-white/10 text-white flex items-center justify-center cursor-pointer hover:bg-black/60 transition-colors sm:w-9 sm:h-9"
                          title="Next song"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* Popular songs */}
                {displayPopularTracks.length > 0 && (
                  <div className="mb-8">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h2 className="font-display text-lg sm:text-xl font-bold text-white">Popular songs</h2>
                        <p className="text-xs text-neutral-400 mt-0.5">Top trending songs right now</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const container = document.getElementById("popular-songs-scroll");
                            if (container) container.scrollBy({ left: -300, behavior: "smooth" });
                          }}
                          className="w-8 h-8 rounded-full bg-neutral-900 border border-white/10 text-neutral-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                          title="Previous"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            const container = document.getElementById("popular-songs-scroll");
                            if (container) container.scrollBy({ left: 300, behavior: "smooth" });
                          }}
                          className="w-8 h-8 rounded-full bg-neutral-900 border border-white/10 text-neutral-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                          title="Next"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div
                      id="popular-songs-scroll"
                      className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide scroll-smooth"
                    >
                      {displayPopularTracks.map((track) => (
                        <div
                          key={`pop-${track.id}`}
                          onClick={() => playTrack(track, displayPopularTracks)}
                          className="shrink-0 w-[142px] sm:w-40 p-2.5 sm:p-3 bg-neutral-900/50 hover:bg-neutral-800/70 rounded-2xl cursor-pointer group transition-all duration-300 border border-white/5 hover:border-white/10 shadow-sm hover:shadow-xl hover:-translate-y-0.5"
                        >
                          <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-3 bg-neutral-800">
                            <img
                              src={getTrackArtworkUrl(track, "max")}
                              alt={track.title}
                              crossOrigin="anonymous"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.src = getTrackArtworkFallbackUrl(track, "hq");
                              }}
                              className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                            />
                            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                            <div className="absolute bottom-2 right-2 w-9 h-9 bg-emerald-500 rounded-full flex items-center justify-center text-black shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200">
                              <Play className="w-4 h-4 fill-black ml-0.5" />
                            </div>
                          </div>
                          <p className="text-[13px] font-semibold text-white truncate group-hover:text-emerald-400 transition-colors">
                            {track.title}
                          </p>
                          <p className="text-[11px] text-neutral-400 truncate mt-0.5">{track.artist}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* "Your Most Played" Section */}
                {displayMostPlayed.length > 0 && (
                  <div className="mb-8">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h2 className="font-display text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-emerald-400" />
                          Your Most Played
                        </h2>
                        <p className="text-xs text-neutral-400">Most replayed tracks by you</p>
                      </div>
                    </div>
                    <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 scrollbar-hide">
                      {displayMostPlayed.map((track, idx) => (
                        <div
                          key={`most-played-${track.id}-${idx}`}
                          onClick={() => playTrack(track, displayMostPlayed)}
                          className="shrink-0 w-[142px] sm:w-40 p-2.5 sm:p-3 bg-neutral-900/50 hover:bg-neutral-800/70 rounded-2xl cursor-pointer group transition-all duration-300 border border-white/5 hover:border-white/10 shadow-sm hover:shadow-xl hover:-translate-y-0.5"
                        >
                          <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-3 bg-neutral-800">
                            <img
                              src={getTrackArtworkUrl(track, "max")}
                              alt={track.title}
                              crossOrigin="anonymous"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.src = getTrackArtworkFallbackUrl(track, "hq");
                              }}
                              className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                            />
                            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-emerald-400 text-xs font-mono font-bold border border-emerald-500/30">
                              #{idx + 1}
                            </div>
                            <div className="absolute bottom-2 right-2 w-9 h-9 bg-emerald-500 rounded-full flex items-center justify-center text-black shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200">
                              <Play className="w-4 h-4 fill-black ml-0.5" />
                            </div>
                          </div>
                          <p className="text-[13px] font-semibold text-white truncate group-hover:text-emerald-400 transition-colors">
                            {track.title}
                          </p>
                          <p className="text-[11px] text-neutral-400 truncate mt-0.5">{track.artist}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Made For You / Featured Picks Section */}
                {madeForYouTracks.length > 0 && (
                  <div className="mb-8">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-emerald-400" />
                        <h2 className="text-lg sm:text-xl font-bold text-white">
                          {hasListeningHistory ? "Made for you 🎵" : "Featured Picks ✨"}
                        </h2>
                      </div>
                      {hasListeningHistory && topGenres.length > 0 && (
                        <span className="text-xs font-mono text-neutral-400">
                          Based on {topGenres.join(", ")}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 scrollbar-hide">
                      {madeForYouTracks.map((track) => (
                        <div
                          key={track.id}
                          onClick={() => playTrack(track, madeForYouTracks)}
                          className="shrink-0 w-[142px] sm:w-40 p-2.5 sm:p-3 bg-neutral-900/50 hover:bg-neutral-800/70 rounded-2xl cursor-pointer group transition-all duration-300 border border-white/5 hover:border-white/10 shadow-sm hover:shadow-xl hover:-translate-y-0.5"
                        >
                          <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-3 bg-neutral-800">
                            <img
                              src={getTrackArtworkUrl(track, "max")}
                              alt={track.title}
                              crossOrigin="anonymous"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.src = getTrackArtworkFallbackUrl(track, "hq");
                              }}
                              className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                            />
                            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                            <div className="absolute bottom-2 right-2 w-9 h-9 bg-emerald-500 rounded-full flex items-center justify-center text-black shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200">
                              <Play className="w-4 h-4 fill-black ml-0.5" />
                            </div>
                          </div>
                          <p className="text-[13px] font-semibold text-white truncate group-hover:text-emerald-400 transition-colors">
                            {track.title}
                          </p>
                          <p className="text-[11px] text-neutral-400 truncate mt-0.5">{track.artist}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {prioritizedPlaylists.slice(0, 6).map((item) => (
                    <div
                      key={item.id}
                      onClick={() => router.push(`/playlist/${item.playlistId}`)}
                      className="group relative flex items-center bg-neutral-900/40 hover:bg-neutral-800/60 rounded-xl overflow-hidden cursor-pointer transition-all duration-300 border border-white/5 hover:border-white/10 shadow-sm hover:shadow-lg"
                    >
                      <div className="relative w-16 h-16 shrink-0 overflow-hidden">
                        <img
                          src={item.coverUrl || "/placeholder.svg"}
                          alt={item.name}
                          crossOrigin="anonymous"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.src = getDefaultArtworkFallbackUrl();
                          }}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 shadow-md"
                        />
                      </div>
                      <div className="flex-1 px-3 sm:px-4 py-2 flex items-center justify-between gap-2 min-w-0">
                        <span className="font-semibold text-sm text-white truncate group-hover:text-emerald-400 transition-colors">
                          {item.name}
                        </span>
                        <div className="w-9 h-9 shrink-0 rounded-full bg-emerald-500 text-black flex items-center justify-center opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 shadow-lg">
                          <Play className="w-3.5 h-3.5 fill-black ml-0.5" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Featured Curated Playlists Cards — Prioritized by language */}
              {
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Compass className="w-5 h-5 text-emerald-400" />
                      <h2 className="text-lg sm:text-xl font-bold text-white">Featured Playlists</h2>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
                    {prioritizedPlaylists.map((pl) => (
                      <PlaylistCard
                        key={pl.id}
                        playlist={pl}
                        onClick={() => router.push(`/playlist/${pl.playlistId}`)}
                        onPlay={() => router.push(`/playlist/${pl.playlistId}`)}
                      />
                    ))}
                  </div>
                </div>
              }

              {/* Community / Mood Playlists Row (hidden if empty) */}
              {displayPlaylists.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Music className="w-5 h-5 text-emerald-400" />
                      <h2 className="text-lg sm:text-xl font-bold text-white">
                        Community Playlists
                      </h2>
                    </div>
                  </div>

                  <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 scrollbar-hide">
                    {displayPlaylists.map((pl) => (
                      <div
                        key={pl.browseId}
                        onClick={() => router.push(`/playlist/${pl.browseId.replace(/^VL/, "")}`)}
                        title={pl.title}
                        className="shrink-0 w-[142px] sm:w-40 p-2.5 sm:p-3 bg-neutral-900/50 hover:bg-neutral-800/70 rounded-2xl cursor-pointer group transition-all duration-300 border border-white/5 hover:border-white/10 shadow-sm hover:shadow-xl hover:-translate-y-0.5 flex flex-col"
                      >
                        <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-3 bg-neutral-800">
                          <img
                            src={pl.thumbnail || "/placeholder.svg"}
                            alt={pl.title}
                            crossOrigin="anonymous"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              e.currentTarget.src = getDefaultArtworkFallbackUrl();
                            }}
                            className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                          />
                          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                          <div className="absolute bottom-2 right-2 w-9 h-9 bg-emerald-500 rounded-full flex items-center justify-center text-black shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200">
                            <Play className="w-4 h-4 fill-black ml-0.5" />
                          </div>
                        </div>
                        <p className="text-[13px] font-semibold text-white truncate group-hover:text-emerald-400 transition-colors">
                          {pl.title}
                        </p>
                        <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                          {pl.author || "Playlist"}
                        </p>
                        {pl.isCommunity && (
                          <span className="inline-block text-[10px] text-emerald-400 font-medium truncate mt-1">
                            Community playlist
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Trending Chartbusters Table */}
              {displayHomeTracks.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Flame className="w-5 h-5 text-emerald-400" />
                      <h2 className="text-lg sm:text-xl font-bold text-white">
                        Trending Chartbusters
                      </h2>
                    </div>
                    <button
                      onClick={() => {
                        setSearchQuery("trending hits 2026");
                        setCurrentView("search");
                      }}
                      className="text-xs font-semibold text-neutral-400 hover:text-white cursor-pointer"
                    >
                      Show all
                    </button>
                  </div>

                  <div className="bg-neutral-950/40 rounded-xl border border-neutral-900/60 p-2 divide-y divide-neutral-900">
                    {displayHomeTracks.slice(0, 8).map((track, i) => (
                      <TrackRow key={track.id} track={track} index={i} queue={displayHomeTracks} />
                    ))}
                  </div>
                </div>
              )}

              {/* Made For You / Smart Recommendations */}
              {recommendations.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-5 h-5 text-emerald-400" />
                    <h2 className="text-lg sm:text-xl font-bold text-white">Recommended For You</h2>
                  </div>

                  <div className="bg-neutral-950/40 rounded-xl border border-neutral-900/60 p-2 divide-y divide-neutral-900">
                    {recommendations.slice(0, 6).map((track, i) => (
                      <TrackRow key={track.id} track={track} index={i} queue={recommendations} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===================== SEARCH VIEW ===================== */}
          {currentView === "search" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Header Title in serif */}
              <div>
                <h1 className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight">
                  Search
                </h1>
                <p className="text-xs sm:text-sm text-neutral-400 mt-1">
                  Find songs, artists, albums, and curated playlists
                </p>
              </div>

              {/* Loading State */}
              {isSearching && (
                <div className="py-12 text-center text-neutral-400">
                  <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-xs font-mono">Searching millions of songs...</p>
                </div>
              )}

              {/* Results View */}
              {!isSearching &&
                (searchResults.length > 0 ||
                  searchTopResult !== null ||
                  searchPlaylists.length > 0 ||
                  searchArtists.length > 0 ||
                  searchAlbums.length > 0) &&
                (() => {
                const queryLower = searchQuery.toLowerCase().trim();

                // Compute unique artists and albums matching query (combine API + track results)
                const matchingArtistsMap = new Map<string, { name: string; image: string; browseId: string }>();
                const matchingAlbumsMap = new Map<string, { title: string; artist: string; cover: string; browseId: string }>();

                // Add API results first
                searchArtists.forEach((a) => {
                  matchingArtistsMap.set(a.name.toLowerCase(), a);
                });
                searchAlbums.forEach((a) => {
                  matchingAlbumsMap.set(a.title.toLowerCase(), a);
                });

                // Add search tracks matching
                searchResults.forEach((track) => {
                  if (track.artist && (queryLower.length > 2 && track.artist.toLowerCase().includes(queryLower))) {
                    if (!matchingArtistsMap.has(track.artist.toLowerCase())) {
                      matchingArtistsMap.set(track.artist.toLowerCase(), {
                        name: track.artist,
                        image: track.coverUrl,
                        browseId: "",
                      });
                    }
                  }
                  if (track.album && (queryLower.length > 2 && track.album.toLowerCase().includes(queryLower))) {
                    if (!matchingAlbumsMap.has(track.album.toLowerCase())) {
                      matchingAlbumsMap.set(track.album.toLowerCase(), {
                        title: track.album,
                        artist: track.artist,
                        cover: track.coverUrl,
                        browseId: "",
                      });
                    }
                  }
                });

                const matchingArtists = Array.from(matchingArtistsMap.values()).slice(0, 8);
                const matchingAlbums = Array.from(matchingAlbumsMap.values()).slice(0, 8);
                const top5Songs = searchResults.slice(0, 5);
                const remainingSongs = searchResults.slice(5);
                const topResult = searchTopResult || searchResults[0] || null;

                return (
                  <div className="space-y-8">
                    {/* Top Result + Top 5 songs */}
                    {topResult && (
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                      {/* Top Result Card */}
                      <div className="lg:col-span-2 relative bg-neutral-900/40 hover:bg-neutral-900/70 border border-neutral-800/60 hover:border-neutral-700/60 p-6 rounded-2xl flex flex-col justify-between group transition-all duration-300 shadow-sm hover:shadow-xl overflow-hidden">
                        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                        <div className="relative">
                          <p className="text-xs uppercase font-bold text-neutral-400 tracking-wider mb-4">
                            Top Result
                          </p>
                          <div className="relative w-40 h-40 sm:w-44 sm:h-44 rounded-2xl overflow-hidden shadow-2xl mb-5 bg-neutral-800">
                            <img
                              src={getTrackArtworkUrl(topResult, "max")}
                              alt={topResult.title}
                              crossOrigin="anonymous"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.src = getTrackArtworkFallbackUrl(topResult, "hq");
                              }}
                              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                            />
                            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent" />
                          </div>
                          <h2 className="text-2xl sm:text-3xl font-bold text-white truncate group-hover:text-emerald-400 transition-colors">
                            {topResult.title}
                          </h2>
                          <p className="text-sm text-neutral-400 mt-1.5 truncate">
                            {topResult.artist} • <span className="text-neutral-500">{topResult.album}</span>
                          </p>
                        </div>

                        <div className="relative mt-6 flex items-center justify-between gap-3">
                          <span className="text-xs bg-neutral-950 px-3 py-1 rounded-full text-neutral-400 font-mono border border-white/5">
                            Song
                          </span>
                          <button
                            onClick={() => playTrack(topResult, top5Songs.length > 0 ? top5Songs : [topResult])}
                            className="w-12 h-12 rounded-full bg-emerald-500 text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl shadow-emerald-500/20 cursor-pointer"
                          >
                            <Play className="w-5 h-5 fill-black ml-0.5" />
                          </button>
                        </div>
                      </div>

                      {/* Top 5 Songs list: Plays sequentially through top 5 list */}
                      <div className="lg:col-span-3 bg-neutral-950/40 rounded-2xl border border-neutral-900/60 p-2 divide-y divide-neutral-900">
                        <p className="text-xs uppercase font-bold text-neutral-400 tracking-wider px-4 py-2">
                          Songs
                        </p>
                        {top5Songs.map((track, i) => (
                          <TrackRow key={track.id} track={track} index={i} queue={top5Songs} wrapText />
                        ))}
                      </div>
                    </div>
                    )}

                    {/* PLAYLISTS Section (hidden when empty) */}
                    {searchPlaylists.length > 0 && (
                      <div>
                        <h3 className="text-lg font-bold text-white mb-4">Playlists</h3>
                        <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 scrollbar-hide">
                          {searchPlaylists.map((playlist) => (
                            <div
                              key={playlist.browseId}
                              onClick={() => router.push(`/playlist/${playlist.browseId.replace(/^VL/, "")}`)}
                              title={playlist.title}
                              className="shrink-0 w-[142px] sm:w-40 p-2.5 sm:p-3 bg-neutral-900/50 hover:bg-neutral-800/70 rounded-2xl cursor-pointer group transition-all duration-300 border border-white/5 hover:border-white/10 shadow-sm hover:shadow-xl hover:-translate-y-0.5"
                            >
                              <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-3 bg-neutral-800">
                                <img
                                  src={playlist.thumbnail || "/placeholder.svg"}
                                  alt={playlist.title}
                                  crossOrigin="anonymous"
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    e.currentTarget.src = getDefaultArtworkFallbackUrl();
                                  }}
                                  className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                                />
                              </div>
                              <p className="text-[13px] font-semibold text-white truncate group-hover:text-emerald-400 transition-colors">
                                {playlist.title}
                              </p>
                              <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                                {playlist.author || "Playlist"}
                              </p>
                              {playlist.isCommunity && (
                                <span className="inline-block text-[10px] text-emerald-400 font-medium truncate mt-1">
                                  Community playlist
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ARTISTS Section (horizontal scroll when matching artists) */}
                    {matchingArtists.length > 0 && (
                      <div>
                        <h3 className="text-lg font-bold text-white mb-4">Artists</h3>
                        <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 scrollbar-hide">
                          {matchingArtists.map((artist, idx) => (
                            <div
                              key={idx}
                              onClick={() => {
                                if (artist.browseId) {
                                  router.push(`/artist/${artist.browseId}`);
                                }
                              }}
                              className={`shrink-0 w-[142px] sm:w-40 p-2.5 sm:p-3 bg-neutral-900/50 hover:bg-neutral-800/70 rounded-2xl group transition-all duration-300 text-center border border-white/5 hover:border-white/10 shadow-sm hover:shadow-xl hover:-translate-y-0.5 ${artist.browseId ? "cursor-pointer" : "cursor-default"}`}
                              title={artist.name}
                            >
                              <img
                                src={artist.image}
                                alt={artist.name}
                                crossOrigin="anonymous"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  e.currentTarget.src = getDefaultArtworkFallbackUrl();
                                }}
                                className="w-28 h-28 rounded-full object-cover mx-auto mb-3 shadow-lg group-hover:scale-[1.04] transition-transform duration-300"
                              />
                              <p className="text-[13px] font-semibold text-white truncate group-hover:text-emerald-400 transition-colors">
                                {artist.name}
                              </p>
                              <p className="text-[11px] text-neutral-400 mt-0.5">Artist</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ALBUMS Section (horizontal scroll when matching albums) */}
                    {matchingAlbums.length > 0 && (
                      <div>
                        <h3 className="text-lg font-bold text-white mb-4">Albums</h3>
                        <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 scrollbar-hide">
                          {matchingAlbums.map((album, idx) => (
                            <div
                              key={idx}
                              onClick={() => {
                                if (album.browseId) {
                                  router.push(`/album/${album.browseId}`);
                                }
                              }}
                              className={`shrink-0 w-[142px] sm:w-40 p-2.5 sm:p-3 bg-neutral-900/50 hover:bg-neutral-800/70 rounded-2xl group transition-all duration-300 border border-white/5 hover:border-white/10 shadow-sm hover:shadow-xl hover:-translate-y-0.5 ${album.browseId ? "cursor-pointer" : "cursor-default"}`}
                              title={album.title}
                            >
                              <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-3 bg-neutral-800">
                                <img
                                  src={album.cover}
                                  alt={album.title}
                                  crossOrigin="anonymous"
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    e.currentTarget.src = getDefaultArtworkFallbackUrl();
                                  }}
                                  className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                                />
                              </div>
                              <p className="text-[13px] font-semibold text-white truncate group-hover:text-emerald-400 transition-colors">
                                {album.title}
                              </p>
                              <p className="text-[11px] text-neutral-400 truncate mt-0.5">{album.artist}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* All Results section: Numbered starting from 1 independently, clicking plays song with similar queue */}
                    {remainingSongs.length > 0 && (
                      <div>
                        <h3 className="text-lg font-bold text-white mb-3">All Results</h3>
                        <div className="bg-neutral-950/40 rounded-2xl border border-neutral-900/60 p-2 divide-y divide-neutral-900">
                          {remainingSongs.map((track, i) => (
                            <TrackRow
                              key={track.id}
                              track={track}
                              index={i}
                              showSimilarBadge={true}
                              wrapText
                              onPlayOverride={() => {
                                // FIX 8: All Results song click -> plays song and auto-builds similar queue (not sequential)
                                playTrack(track);
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Empty state when no search query: Browse by Mood */}
              {!isSearching &&
                searchResults.length === 0 &&
                searchTopResult === null &&
                searchArtists.length === 0 &&
                searchAlbums.length === 0 &&
                searchPlaylists.length === 0 && (
                <div className="space-y-8">
                  {/* Browse by mood */}
                  <div>
                    <h2 className="font-display text-xl sm:text-2xl font-bold text-white mb-4">
                      Browse by Mood
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                      {[
                        { name: "Chill", query: "chill lofi hits", color: "from-blue-700 to-indigo-900" },
                        { name: "Romantic", query: "romantic hindi songs", color: "from-rose-700 to-pink-900" },
                        { name: "Party", query: "party dance club hits", color: "from-amber-600 to-red-900" },
                        { name: "Workout", query: "high energy workout motivation", color: "from-emerald-700 to-teal-950" },
                        { name: "Focus", query: "deep focus instrumental study", color: "from-purple-700 to-slate-900" },
                        { name: "Heartbreak", query: "sad hindi heartbreak songs", color: "from-sky-800 to-blue-950" },
                        { name: "Retro", query: "90s 2000s retro classic bollywood", color: "from-yellow-700 to-orange-900" },
                        { name: "English Hits", query: "top english pop hits 2026", color: "from-violet-700 to-purple-950" },
                      ].map((mood) => (
                        <button
                          key={mood.name}
                          onClick={() => setSearchQuery(mood.query)}
                          className={`theme-dark-surface p-4 sm:p-6 rounded-2xl bg-gradient-to-br ${mood.color} text-left cursor-pointer transition-all hover:scale-105 active:scale-95 shadow-xl border border-white/10 group`}
                        >
                          <span className="font-display font-bold text-base sm:text-lg text-white block">
                            {mood.name}
                          </span>
                          <span className="text-[11px] sm:text-xs text-white/70 block mt-1">Tap to explore</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h2 className="font-display text-xl font-bold text-white mb-4">Browse All Categories</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
                      {FEATURED_PLAYLISTS.map((pl, i) => {
                        const colors = [
                          "from-purple-600 to-indigo-900",
                          "from-rose-600 to-pink-900",
                          "from-amber-600 to-yellow-900",
                          "from-emerald-600 to-teal-900",
                          "from-blue-600 to-cyan-900",
                          "from-orange-600 to-red-900",
                        ];
                        return (
                          <div
                            key={pl.id}
                            onClick={() => router.push(`/playlist/${pl.playlistId}`)}
                            className={`theme-dark-surface aspect-square p-3 sm:p-4 rounded-xl bg-gradient-to-br ${colors[i % colors.length]} flex flex-col justify-between cursor-pointer hover:scale-102 transition-all shadow-lg overflow-hidden relative group`}
                          >
                            <span className="font-bold text-[13px] sm:text-lg text-white leading-snug break-words">
                              {pl.name}
                            </span>
                            <img
                              src={pl.coverUrl}
                              alt={pl.name}
                              crossOrigin="anonymous"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.src = getDefaultArtworkFallbackUrl();
                              }}
                              className="w-14 h-14 sm:w-16 sm:h-16 rounded-md object-cover absolute -bottom-2 -right-2 shadow-2xl rotate-15 group-hover:rotate-0 group-hover:scale-110 transition-all duration-300"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===================== LIKED SONGS VIEW ===================== */}
          {currentView === "liked" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Spotify-style large purple gradient banner */}
              <div
                style={{
                  background: `linear-gradient(
                    180deg,
                    var(--theme-accent-strong) 0%,
                    var(--theme-accent) 40%,
                    var(--color-neutral-950) 100%
                  )`,
                }}
                className="theme-dark-surface flex flex-col sm:flex-row items-center sm:items-end gap-6 p-6 sm:p-8 rounded-3xl border border-white/10 shadow-2xl transition-all"
              >
                <div className="w-40 h-40 sm:w-[200px] sm:h-[200px] rounded-lg bg-white/20 backdrop-blur-md shadow-2xl flex items-center justify-center shrink-0 border border-white/20">
                  <Heart className="w-24 h-24 text-white fill-white" />
                </div>

                <div className="text-center sm:text-left flex-1 min-w-0">
                  <p className="text-xs uppercase font-bold tracking-wider text-emerald-200">PLAYLIST</p>
                  <h1 className="text-4xl sm:text-5xl font-black text-white mt-1 mb-3 tracking-tight">Liked Songs</h1>
                  <p className="text-sm text-neutral-300 flex items-center justify-center sm:justify-start gap-2">
                    <span className="font-semibold text-white">{user?.username || "You"}</span>
                    <span>•</span>
                    <span>{likedTracks.length} songs</span>
                  </p>
                </div>
              </div>

              {/* Action row: Large green Play button (56px circle) */}
              {likedTracks.length > 0 && (
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => playTrack(likedTracks[0], likedTracks)}
                    className="w-14 h-14 rounded-full bg-emerald-500 text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl shadow-emerald-500/20 cursor-pointer"
                    title="Play all liked songs"
                  >
                    <Play className="w-6 h-6 fill-black ml-0.5" />
                  </button>
                </div>
              )}

              {/* Table of Songs */}
              <div className="bg-neutral-950/40 rounded-2xl border border-neutral-900/60 p-2 divide-y divide-neutral-900">
                {likedTracks.length === 0 ? (
                  <div className="py-20 text-center text-neutral-500">
                    <Heart className="w-20 h-20 mx-auto mb-4 opacity-40 text-neutral-400" />
                    <p className="text-lg font-bold text-white">Songs you like will appear here</p>
                    <p className="text-xs text-neutral-400 mt-1.5">Tap the heart icon on any song to save it.</p>
                  </div>
                ) : (
                  likedTracks.map((track, i) => (
                    <TrackRow key={track.id} track={track} index={i} queue={likedTracks} />
                  ))
                )}
              </div>
            </div>
          )}

          {/* ===================== DOWNLOADS VIEW ===================== */}
          {DOWNLOADS_ENABLED && currentView === "downloads" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div
                style={{
                  background: `linear-gradient(
                    180deg,
                    var(--theme-accent-strong) 0%,
                    var(--theme-accent) 40%,
                    var(--color-neutral-950) 100%
                  )`,
                }}
                className="theme-dark-surface flex flex-col sm:flex-row items-center sm:items-end gap-6 p-6 sm:p-8 rounded-3xl border border-white/10 shadow-2xl"
              >
                <div className="w-40 h-40 sm:w-[200px] sm:h-[200px] rounded-lg bg-white/20 backdrop-blur-md shadow-2xl flex items-center justify-center shrink-0 border border-white/20">
                  <Download className="w-24 h-24 text-white" />
                </div>
                <div className="text-center sm:text-left flex-1 min-w-0">
                  <p className="text-xs uppercase font-bold tracking-wider text-emerald-200">SYNCED WITH YOUR ACCOUNT</p>
                  <h1 className="text-4xl sm:text-5xl font-black text-white mt-1 mb-3 tracking-tight">Downloads</h1>
                  <p className="text-sm text-neutral-300 flex items-center justify-center sm:justify-start gap-2">
                    <span className="font-semibold text-white">{user?.username || "You"}</span>
                    <span>•</span>
                    <span>{downloads.length} songs</span>
                    <span>•</span>
                    <span>{downloads.filter((t) => offlineIds.has(t.id)).length} on this device</span>
                  </p>
                </div>
              </div>

              {downloads.length > 0 && (
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => playTrack(downloads.find((t) => offlineIds.has(t.id)) ?? downloads[0], downloads)}
                    className="w-14 h-14 rounded-full bg-emerald-500 text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl shadow-emerald-500/20 cursor-pointer"
                    title="Play downloads"
                  >
                    <Play className="w-6 h-6 fill-black ml-0.5" />
                  </button>
                  {downloads.some((t) => !offlineIds.has(t.id)) && (
                    <button
                      disabled={Object.keys(downloadProgress).length > 0}
                      onClick={async () => {
                        for (const t of downloads.filter((x) => !offlineIds.has(x.id))) {
                          await downloadTrack(t);
                        }
                      }}
                      className="flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-60 text-white px-4 py-2 rounded-full text-xs font-semibold border border-neutral-800 transition-colors cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      {Object.keys(downloadProgress).length > 0 ? "Downloading…" : "Download all to this device"}
                    </button>
                  )}
                </div>
              )}

              <div className="bg-neutral-950/40 rounded-2xl border border-neutral-900/60 p-2 divide-y divide-neutral-900">
                {downloads.length === 0 ? (
                  <div className="py-20 text-center text-neutral-500">
                    <Download className="w-20 h-20 mx-auto mb-4 opacity-40 text-neutral-400" />
                    <p className="text-lg font-bold text-white">Songs you download will appear here</p>
                    <p className="text-xs text-neutral-400 mt-1.5">
                      Use the ⋮ menu on any song and choose Download. Sign in to see them on all your devices.
                    </p>
                  </div>
                ) : (
                  downloads.map((track, i) => (
                    <TrackRow key={track.id} track={track} index={i} queue={downloads} />
                  ))
                )}
              </div>
            </div>
          )}

          {/* ===================== YOUR LIBRARY VIEW ===================== */}
          {currentView === "library" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <h1 className="text-3xl font-extrabold text-white tracking-tight">Your Library</h1>
                <button
                  onClick={() => openCreatePlaylist(null)}
                  className="flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 text-white px-4 py-2 rounded-full text-xs font-semibold border border-neutral-800 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  New Playlist
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {/* Liked Songs Card - Equal size to PlaylistCard */}
                <div
                  onClick={() => setCurrentView("liked")}
                  className="group relative bg-neutral-900/60 hover:bg-neutral-800/80 p-4 rounded-xl transition-all duration-200 cursor-pointer flex flex-col border border-neutral-800/40 hover:border-neutral-700/60 shadow-sm hover:shadow-xl hover:scale-105"
                >
                  <div className="relative aspect-square w-full rounded-lg overflow-hidden mb-4 bg-gradient-to-br from-[#450af5] to-[#8e8ee5] flex items-center justify-center shadow-md group-hover:scale-105 transition-transform duration-300">
                    <Heart className="w-16 h-16 text-white fill-white shadow-xl" />
                  </div>
                  <h3 className="font-semibold text-white text-base truncate mb-1">
                    Liked Songs
                  </h3>
                  <p className="text-xs text-neutral-400 truncate">
                    {mounted ? likedSongIds.size : 0} songs
                  </p>
                </div>

                {/* Downloads Card */}
                {DOWNLOADS_ENABLED && (
                <div
                  onClick={() => setCurrentView("downloads")}
                  className="group relative bg-neutral-900/60 hover:bg-neutral-800/80 p-4 rounded-xl transition-all duration-200 cursor-pointer flex flex-col border border-neutral-800/40 hover:border-neutral-700/60 shadow-sm hover:shadow-xl hover:scale-105"
                >
                  <div className="relative aspect-square w-full rounded-lg overflow-hidden mb-4 bg-gradient-to-br from-emerald-700 to-teal-400 flex items-center justify-center shadow-md group-hover:scale-105 transition-transform duration-300">
                    <Download className="w-16 h-16 text-white shadow-xl" />
                  </div>
                  <h3 className="font-semibold text-white text-base truncate mb-1">Downloads</h3>
                  <p className="text-xs text-neutral-400 truncate">{mounted ? downloads.length : 0} songs</p>
                </div>
                )}

                {/* Custom Playlists */}
                {mounted && playlists.map((pl) => (
                  <PlaylistCard
                    key={pl.id}
                    playlist={pl}
                    onClick={() => setCurrentView(`playlist:${pl.id}`)}
                    onPlay={
                      pl.tracks && pl.tracks.length > 0
                        ? () => playTrack(pl.tracks![0], pl.tracks)
                        : undefined
                    }
                  />
                ))}

                {/* Saved YouTube Playlists (after user-created playlists) */}
                {mounted && savedPlaylists.map((sp) => (
                  <PlaylistCard
                    key={`saved-${sp.id}`}
                    playlist={{
                      id: sp.id,
                      name: sp.title,
                      coverUrl: sp.thumbnail,
                      trackCount: sp.trackCount,
                    }}
                    onClick={() => router.push(`/playlist/${sp.id}`)}
                  />
                ))}
              </div>

              {/* Followed Artists (local-only, shown only when the user follows someone) */}
              {mounted && followedArtists.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <UserPlus className="w-5 h-5 text-emerald-400" />
                      <h2 className="text-lg font-bold text-white">Followed Artists</h2>
                    </div>
                    <span className="text-xs font-mono text-neutral-500">
                      {followedArtists.length}
                    </span>
                  </div>

                  <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 scrollbar-hide">
                    {followedArtists.map((artist) => (
                      <Link
                        key={artist.browseId}
                        href={`/artist/${artist.browseId}`}
                        title={artist.name}
                        className="shrink-0 w-32 p-3 bg-neutral-900/50 hover:bg-neutral-800/70 rounded-2xl group transition-all duration-300 text-center border border-white/5 hover:border-white/10 shadow-sm hover:shadow-xl hover:-translate-y-0.5"
                      >
                        <img
                          src={artist.thumbnail || "/placeholder.svg"}
                          alt={artist.name}
                          crossOrigin="anonymous"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.src = getDefaultArtworkFallbackUrl();
                          }}
                          className="w-20 h-20 rounded-full object-cover mx-auto mb-3 shadow-lg group-hover:scale-[1.04] transition-transform duration-300"
                        />
                        <p className="text-[13px] font-semibold text-white truncate group-hover:text-emerald-400 transition-colors">
                          {artist.name}
                        </p>
                        <p className="text-[11px] text-neutral-400 mt-0.5">Artist</p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===================== CUSTOM PLAYLIST VIEW ===================== */}
          {activeCustomPlaylist && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Playlist Header with dynamic dominant color gradient to #121212 */}
              <div
                style={{
                  background: `linear-gradient(
                    180deg,
                    rgba(${playlistDominantColor}, 0.8) 0%,
                    rgba(${playlistDominantColor}, 0.3) 60%,
                    var(--color-neutral-950) 100%
                  )`,
                }}
                className="theme-dark-surface relative flex flex-col sm:flex-row items-center sm:items-end gap-6 p-6 sm:p-8 rounded-3xl border border-white/10 shadow-2xl transition-colors duration-500"
              >
                <div className="w-40 h-40 sm:w-[200px] sm:h-[200px] rounded-lg overflow-hidden shadow-2xl shrink-0 bg-neutral-800">
                  <PlaylistCollage
                    tracks={activeCustomPlaylist.tracks}
                    fallbackCoverUrl={activeCustomPlaylist.coverUrl}
                    className="w-full h-full"
                  />
                </div>

                <div className="text-center sm:text-left flex-1 min-w-0">
                  <p className="text-xs uppercase font-bold tracking-wider text-neutral-300">PLAYLIST</p>
                  <h1 className="text-4xl sm:text-5xl font-black text-white mt-1 mb-2 tracking-tight">
                    {activeCustomPlaylist.name}
                  </h1>
                  {activeCustomPlaylist.description && (
                    <p className="text-sm text-neutral-400 mb-2">{activeCustomPlaylist.description}</p>
                  )}
                  <p className="text-sm text-neutral-300 flex items-center justify-center sm:justify-start gap-2">
                    <span className="font-semibold text-white">You</span>
                    <span>•</span>
                    <span>{activeCustomPlaylist.tracks?.length || 0} songs</span>
                  </p>
                </div>

                {/* Header three-dot menu (right side) */}
                <div className="absolute top-4 right-4">
                  <button
                    onClick={() => setPlaylistMenuOpen((value) => !value)}
                    className="p-2 rounded-full text-neutral-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                    title="More options"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>

                  {playlistMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setPlaylistMenuOpen(false)}
                      />
                      <div className="absolute right-0 top-11 w-56 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl p-1 z-40 text-xs text-neutral-200">
                        <button
                          onClick={() => {
                            setPlaylistMenuOpen(false);
                            setIsEditPlaylistOpen(true);
                          }}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-neutral-800 flex items-center gap-2 cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                          Edit details
                        </button>
                        <button
                          onClick={handleSharePlaylist}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-neutral-800 flex items-center gap-2 cursor-pointer"
                        >
                          <Share2 className="w-4 h-4" />
                          Share
                        </button>
                        <div className="border-t border-neutral-800 mt-1 pt-1">
                          <p className="px-2 py-1 text-[10px] uppercase font-semibold text-neutral-500 flex items-center gap-2">
                            <ArrowUpDown className="w-3.5 h-3.5" />
                            Sort by
                          </p>
                          {(["default", "title", "artist", "duration"] as const).map((key) => (
                            <button
                              key={key}
                              onClick={() => {
                                setPlaylistSortKey(key);
                                setPlaylistMenuOpen(false);
                              }}
                              className={`w-full text-left px-3 py-1.5 rounded hover:bg-neutral-800 capitalize cursor-pointer ${
                                playlistSortKey === key ? "text-emerald-400" : ""
                              }`}
                            >
                              {key === "default" ? "Date added" : key}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={handleAddPlaylistToQueue}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-neutral-800 flex items-center gap-2 cursor-pointer border-t border-neutral-800 mt-1"
                        >
                          <ListEnd className="w-4 h-4" />
                          Add to queue
                        </button>
                        <button
                          onClick={handleDeletePlaylist}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-neutral-800 flex items-center gap-2 text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete playlist
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Action row: Large green Play button (56px circle) */}
              {activeCustomPlaylist && (
                <div className="flex items-center gap-4">
                  {activeCustomPlaylist.tracks && activeCustomPlaylist.tracks.length > 0 && (
                    <button
                      onClick={() => playTrack(activeCustomPlaylist.tracks![0], activeCustomPlaylist.tracks)}
                      className="w-14 h-14 rounded-full bg-emerald-500 text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl shadow-emerald-500/20 cursor-pointer"
                      title="Play Playlist"
                    >
                      <Play className="w-6 h-6 fill-black ml-0.5" />
                    </button>
                  )}

                  {shareNotice && (
                    <span className="text-xs text-emerald-400 font-medium">{shareNotice}</span>
                  )}
                </div>
              )}

              {/* Tracks */}
              <div className="bg-neutral-950/40 rounded-2xl border border-neutral-900/60 p-2 divide-y divide-neutral-900">
                {!activeCustomPlaylist.tracks || activeCustomPlaylist.tracks.length === 0 ? (
                  <div className="py-16 text-center text-neutral-500">
                    <Music className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-base font-semibold text-neutral-300">This playlist is empty</p>
                    <p className="text-xs text-neutral-500 mt-1">Search for tracks and add them using the + button.</p>
                  </div>
                ) : (
                  displayedPlaylistTracks.map((track, i) => (
                    <TrackRow
                      key={track.id}
                      track={track}
                      index={i}
                      queue={displayedPlaylistTracks}
                      playlistId={activeCustomPlaylist.id}
                    />
                  ))
                )}
              </div>
            </div>
          )}
      </main>

      {/* Playlist edit modal stays with the Home view it belongs to. */}
      <CreatePlaylistModal
        key={`edit-${isEditPlaylistOpen}-${activeCustomPlaylist?.id ?? ""}`}
        isOpen={isEditPlaylistOpen}
        playlist={activeCustomPlaylist}
        onClose={() => setIsEditPlaylistOpen(false)}
        onUpdated={() => setIsEditPlaylistOpen(false)}
      />
    </>
  );
}
