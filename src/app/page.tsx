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
  Clock,
  Plus,
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
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Navbar } from "@/components/Navbar";
import { Player } from "@/components/Player";
import { RightPanel } from "@/components/RightPanel";
import { TrackRow } from "@/components/TrackRow";
import { PlaylistCard } from "@/components/PlaylistCard";
import { UserProfileModal } from "@/components/UserProfileModal";
import { CreatePlaylistModal } from "@/components/CreatePlaylistModal";
import { usePlayer } from "@/context/PlayerContext";
import { Track, Playlist } from "@/lib/types";
import { FEATURED_PLAYLISTS, CURATED_TRACKS } from "@/lib/musicProvider";
import { useDominantColor } from "@/hooks/useDominantColor";
import { PlaylistCollage } from "@/components/PlaylistCollage";

const SEARCH_PILLS = [
  "Trending",
  "Bollywood",
  "Punjabi",
  "Lofi",
  "Hip-Hop",
  "Arijit Singh",
  "Karan Aujla",
  "The Weeknd",
  "Romantic",
  "Party",
];

// Cinematic carousel per-offset values (index = distance from the active cover).
const CAROUSEL_SCALE = [1, 0.96, 0.9, 0.82];
const CAROUSEL_DIM = [0, 0.15, 0.28, 0.4];
const CAROUSEL_ROTATE_Y = [0, 53, 58, 63];
// Horizontal distance from the exact center as a fraction of the container width.
const CAROUSEL_X_FRACTION = [0, 0.23, 0.37, 0.45];

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
  const { user, playlists, savedPlaylists, likedSongIds, playTrack, currentTrack, isPlaying, togglePlay, queue, setAppQueue, addToPlaylist, deletePlaylist } = usePlayer();

  const [currentView, setCurrentView] = useState<string>("home");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [searchArtists, setSearchArtists] = useState<{ name: string; image: string; browseId: string }[]>([]);
  const [searchAlbums, setSearchAlbums] = useState<{ title: string; artist: string; cover: string; browseId: string }[]>([]);
  const [searchPlaylists, setSearchPlaylists] = useState<{ browseId: string; title: string; author: string; thumbnail: string; isCommunity?: boolean }[]>([]);
  const [communityHomePlaylists, setCommunityHomePlaylists] = useState<{ browseId: string; title: string; author: string; thumbnail: string; isCommunity?: boolean }[]>([]);
  const [searchTopResult, setSearchTopResult] = useState<Track | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const [homeTracks, setHomeTracks] = useState<Track[]>(CURATED_TRACKS);
  const [recommendations, setRecommendations] = useState<Track[]>([]);
  const [likedTracks, setLikedTracks] = useState<Track[]>([]);

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [isEditPlaylistOpen, setIsEditPlaylistOpen] = useState(false);
  const [pendingPlaylistTrack, setPendingPlaylistTrack] = useState<Track | null>(null);
  const [playlistMenuOpen, setPlaylistMenuOpen] = useState(false);
  const [playlistSortKey, setPlaylistSortKey] = useState<"default" | "title" | "artist" | "duration">("default");
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>([]);
  const [languagePreference, setLanguagePreference] = useState<string>("Hindi");
  const [showRightPanel, setShowRightPanel] = useState(true);
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
            const cover = item.thumbnail || item.coverUrl || (vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : "/placeholder.svg");
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

  // Fetch Community Playlists for Home (based on recentlyPlayed artist/genre or trending default)
  useEffect(() => {
    let query = "hindi playlist";
    try {
      const raw = localStorage.getItem("recentlyPlayed");
      if (raw) {
        const recents: Track[] = JSON.parse(raw);
        if (Array.isArray(recents) && recents.length > 0) {
          const artistCounts = new Map<string, number>();
          recents.forEach((t) => {
            if (t.artist && t.artist !== "Unknown Artist") {
              artistCounts.set(t.artist, (artistCounts.get(t.artist) || 0) + 1);
            }
          });
          if (artistCounts.size > 0) {
            const topArtist = Array.from(artistCounts.entries()).sort((a, b) => b[1] - a[1])[0][0];
            query = `${topArtist} playlist`;
          } else if (recents[0]?.genre) {
            query = `${recents[0].genre} playlist`;
          }
        }
      }
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
  }, [recentlyPlayed]);

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

  // Recommended For You: seed from the last 3 liked or recently played songs.
  // Each seed asks /api/next for its radio results; merge and dedupe them.
  useEffect(() => {
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
                `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
              duration: item.duration || 180,
              youtubeId: item.videoId,
            });
          }
        }

        setRecommendations(Array.from(merged.values()).slice(0, 20));
      })
      .catch((e) => console.error("Error building recommendations:", e));

    return () => {
      cancelled = true;
    };
  }, [recentlyPlayed, likedTracks]);

  // Bridge events from TrackRow: search navigation and "Create new playlist".
  useEffect(() => {
    const handleSearch = (event: Event) => {
      const detail = (event as CustomEvent<{ query?: string }>).detail;
      if (!detail?.query?.trim()) return;
      setSearchQuery(detail.query);
      setCurrentView("search");
    };

    const handleCreatePlaylist = (event: Event) => {
      const detail = (event as CustomEvent<{ track?: Track }>).detail;
      setPendingPlaylistTrack(detail?.track ?? null);
      setIsCreatePlaylistOpen(true);
    };

    window.addEventListener("shubhu:search", handleSearch);
    window.addEventListener("shubhu:create-playlist", handleCreatePlaylist);
    return () => {
      window.removeEventListener("shubhu:search", handleSearch);
      window.removeEventListener("shubhu:create-playlist", handleCreatePlaylist);
    };
  }, []);

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
          const toTrack = (item: { videoId?: string; id?: string; title: string; artist: string; album?: string; thumbnail?: string; coverUrl?: string; duration?: number; artistId?: string }): Track => {
            const vid = item.videoId || (item.id && /^[A-Za-z0-9_-]{11}$/.test(item.id) ? item.id : undefined);
            return {
              id: vid || item.id || "",
              title: item.title,
              artist: item.artist,
              album: item.album || "",
              coverUrl: item.thumbnail || item.coverUrl || (vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : "/placeholder.svg"),
              duration: item.duration || 180,
              youtubeId: vid,
              artistId: item.artistId,
            };
          };
          const mappedTracks: Track[] = rawTracks.map(toTrack);
          setSearchResults(mappedTracks);
          if (Array.isArray(data)) {
            setSearchArtists([]);
            setSearchAlbums([]);
            setSearchPlaylists([]);
            setSearchTopResult(null);
          } else {
            setSearchTopResult(
              data.topResult ? toTrack(data.topResult) : null,
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
  }, [likedTracks, recentlyPlayed, languagePreference, homeTracks, recommendations]);

  // Home data (the "All" feed — there is no mood filtering anymore).
  const displayHomeTracks = homeTracks;
  const displayPopularTracks = homeTracks.slice(0, 10);
  const displayMostPlayed = recentlyPlayed.length > 0 ? recentlyPlayed.slice(0, 8) : homeTracks.slice(0, 8);
  const displayRecentlyPlayed = recentlyPlayed;
  const displayPlaylists = communityHomePlaylists;

  // Cinematic carousel: auto-advance, hover pause, tab visibility, reduced motion.
  const [carouselHovered, setCarouselHovered] = useState(false);
  const [carouselTabVisible, setCarouselTabVisible] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  // Bumped on every interaction so the 4s auto-advance restarts.
  const [carouselResetKey, setCarouselResetKey] = useState(0);
  const restartCarouselTimer = () => setCarouselResetKey((key) => key + 1);

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
    if (prefersReducedMotion || !carouselTabVisible || carouselHovered || carouselCount <= 1) return;
    const id = window.setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % carouselCount);
    }, 4000);
    return () => window.clearInterval(id);
  }, [prefersReducedMotion, carouselTabVisible, carouselHovered, carouselCount, carouselIndex, carouselResetKey]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#08090a] text-white shubhu-radial-bg">
      {/* 1. Left Sidebar */}
      <Sidebar
        currentView={currentView}
        onSelectView={(view) => {
          setCurrentView(view);
          if (view === "search") {
            // Keep existing query or leave ready
          }
        }}
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenCreatePlaylist={() => setIsCreatePlaylistOpen(true)}
        onOpenSettings={() => router.push("/settings")}
      />

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-transparent">
        <Navbar
          searchQuery={searchQuery}
          onSearchChange={(q) => {
            setSearchQuery(q);
            if (currentView !== "search") setCurrentView("search");
          }}
          showSearch={currentView === "search"}
          onOpenProfile={() => setIsProfileOpen(true)}
        />

        {/* Scrollable Viewport */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 pb-[calc(var(--player-height)+24px)] scrollbar-thin scrollbar-thumb-neutral-800">
          {/* ===================== HOME VIEW ===================== */}
          {currentView === "home" && (
            <div className="space-y-8 animate-in fade-in duration-200">
              {/* Header Greeting */}
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-white">
                    {greeting}
                  </h1>
                </div>

                {/* Trending Carousel / "Top songs right now" Box */}
                {displayHomeTracks.length > 0 && (() => {
                  const carouselTracks = displayHomeTracks.slice(0, 9);
                  const total = carouselTracks.length;
                  const activeIdx = ((carouselIndex % total) + total) % total;
                  // Center cover: area height minus ~48px, capped at 30% of the container width.
                  const centerSize =
                    carouselBox.width > 0 && carouselBox.height > 0
                      ? Math.min(carouselBox.height - 48, carouselBox.width * 0.3)
                      : 220;
                  const containerWidth = carouselBox.width || 900;
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
                    : "transform 800ms cubic-bezier(0.22, 1, 0.36, 1), opacity 800ms cubic-bezier(0.22, 1, 0.36, 1)";

                  return (
                    <div
                      className="mb-8 relative overflow-hidden rounded-[28px] border border-white/[0.06] shadow-2xl"
                      style={{
                        background:
                          "radial-gradient(120% 130% at 50% 115%, rgba(76, 29, 149, 0.38) 0%, rgba(17, 20, 31, 0.94) 55%, rgba(10, 12, 18, 0.99) 100%)",
                      }}
                      onMouseEnter={() => setCarouselHovered(true)}
                      onMouseLeave={() => setCarouselHovered(false)}
                    >
                      {/* Ambient color layers: one per visible song (max 7), blurred cover art */}
                      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
                        {ambientLayers.map(({ track, offset }) => (
                          <div
                            key={`ambient-${track.id}`}
                            className="absolute inset-0"
                            style={{
                              backgroundImage: track.coverUrl ? `url("${track.coverUrl}")` : undefined,
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
                            "linear-gradient(180deg, rgba(8, 10, 16, 0.82) 0%, rgba(8, 10, 16, 0.52) 42%, rgba(8, 10, 16, 0.9) 100%)",
                        }}
                      />
                      {/* Faint purple bottom glow, blue right glow, subtle light behind the center */}
                      <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-[70%] h-64 rounded-full bg-fuchsia-600/20 blur-[90px] pointer-events-none" />
                      <div className="absolute top-1/2 -right-24 -translate-y-1/2 w-64 h-[70%] rounded-full bg-blue-600/15 blur-[90px] pointer-events-none" />
                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[46%] h-[62%] rounded-full bg-white/[0.05] blur-3xl pointer-events-none" />

                      {/* Header */}
                      <div className="relative z-10 px-5 pt-5 sm:px-6 sm:pt-6">
                        <h2 className="font-serif text-2xl sm:text-3xl font-bold text-white tracking-tight">
                          Top songs right now
                        </h2>
                        <p className="text-xs text-neutral-400 mt-1">
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
                              const rawOffset = idx - activeIdx;
                              const offset =
                                rawOffset > total / 2
                                  ? rawOffset - total
                                  : rawOffset < -total / 2
                                  ? rawOffset + total
                                  : rawOffset;
                              const distance = Math.abs(offset);
                              const level = Math.min(3, distance);
                              const isCenter = offset === 0;
                              const isHidden = distance > 3;
                              const scale = CAROUSEL_SCALE[level];
                              // Left covers tilt with a positive angle, right covers negative.
                              const rotateY = -Math.sign(offset) * CAROUSEL_ROTATE_Y[level];
                              const translateX =
                                Math.sign(offset) * CAROUSEL_X_FRACTION[level] * containerWidth;

                              return (
                                <div
                                  key={track.id}
                                  onClick={() => {
                                    restartCarouselTimer();
                                    if (isCenter) {
                                      playTrack(track, carouselTracks);
                                    } else {
                                      setCarouselIndex(idx);
                                    }
                                  }}
                                  className={`absolute left-1/2 top-1/2 select-none ${
                                    isHidden ? "pointer-events-none" : "cursor-pointer"
                                  }`}
                                  style={{
                                    width: centerSize,
                                    height: centerSize,
                                    borderRadius: 28,
                                    transform: `translate(-50%, -50%) translateX(${translateX}px) translateZ(${
                                      -distance * 60
                                    }px) rotateY(${rotateY}deg) scale(${scale})`,
                                    opacity: isHidden ? 0 : 1,
                                    zIndex: 30 - distance,
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
                                    style={{ borderRadius: 28 }}
                                  >
                                    <img
                                      src={track.coverUrl || "/placeholder.svg"}
                                      alt={track.title}
                                      crossOrigin="anonymous"
                                      referrerPolicy="no-referrer"
                                      onError={(e) => {
                                        e.currentTarget.src = "/placeholder.svg";
                                      }}
                                      className="w-full h-full object-cover"
                                    />

                                    {/* Per-offset dim overlay (no CSS filter animation) */}
                                    <div
                                      className="absolute inset-0 pointer-events-none bg-black"
                                      style={{
                                        opacity: CAROUSEL_DIM[level],
                                        transition: prefersReducedMotion
                                          ? "none"
                                          : "opacity 800ms cubic-bezier(0.22, 1, 0.36, 1)",
                                      }}
                                    />

                                    {/* Center cover only: gradient, real title/artist, green play */}
                                    {isCenter && (
                                      <>
                                        <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />
                                        <div className="absolute inset-x-0 bottom-0 z-10 p-5 pr-[84px]">
                                          <h3 className="font-serif font-bold text-white text-[22px] sm:text-[26px] leading-tight truncate">
                                            {track.title}
                                          </h3>
                                          <p className="text-[14px] text-white/80 truncate mt-1">
                                            {track.artist}
                                          </p>
                                        </div>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            restartCarouselTimer();
                                            playTrack(track, carouselTracks);
                                          }}
                                          className="absolute bottom-[18px] right-[18px] z-20 w-[52px] h-[52px] rounded-full bg-emerald-500 hover:bg-emerald-400 text-black flex items-center justify-center shadow-[0_0_24px_rgba(16,185,129,0.45)] hover:scale-105 active:scale-95 transition-transform cursor-pointer"
                                          title="Play"
                                        >
                                          <Play className="w-5 h-5 fill-black ml-0.5" />
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

                      {/* Controls: prev, dots, next — one centered compact row */}
                      <div className="relative z-10 flex items-center justify-center gap-3 px-5 pt-4 pb-5 sm:px-6">
                        <button
                          onClick={() => {
                            restartCarouselTimer();
                            setCarouselIndex((prev) => (prev - 1 + total) % total);
                          }}
                          className="w-9 h-9 rounded-full bg-black/40 border border-white/10 text-white flex items-center justify-center cursor-pointer hover:bg-black/60 transition-colors"
                          title="Previous song"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>

                        <div className="flex items-center gap-1.5">
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
                          className="w-9 h-9 rounded-full bg-black/40 border border-white/10 text-white flex items-center justify-center cursor-pointer hover:bg-black/60 transition-colors"
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
                        <h2 className="font-display text-xl font-bold text-white">Popular songs</h2>
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
                          className="shrink-0 w-36 p-3 bg-neutral-900/60 hover:bg-neutral-800/80 rounded-2xl cursor-pointer group transition-all border border-neutral-800/40 hover:border-neutral-700/60 shadow-md"
                        >
                          <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-2 bg-neutral-800">
                            <img
                              src={track.coverUrl || "/placeholder.svg"}
                              alt={track.title}
                              crossOrigin="anonymous"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.src = "/placeholder.svg";
                              }}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            <div className="absolute bottom-2 right-2 w-9 h-9 bg-emerald-500 rounded-full flex items-center justify-center text-black shadow-xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200">
                              <Play className="w-4 h-4 fill-black ml-0.5" />
                            </div>
                          </div>
                          <p className="text-xs font-semibold text-white truncate group-hover:text-emerald-400 transition-colors">
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
                        <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-emerald-400" />
                          Your Most Played
                        </h2>
                        <p className="text-xs text-neutral-400">Most replayed tracks by you</p>
                      </div>
                    </div>
                    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                      {displayMostPlayed.map((track, idx) => (
                        <div
                          key={`most-played-${track.id}-${idx}`}
                          onClick={() => playTrack(track, displayMostPlayed)}
                          className="shrink-0 w-36 p-3 bg-neutral-900/60 hover:bg-neutral-800/80 rounded-2xl cursor-pointer group transition-all border border-neutral-800/40 hover:border-neutral-700/60 shadow-md relative"
                        >
                          <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-2 bg-neutral-800">
                            <img
                              src={track.coverUrl || "/placeholder.svg"}
                              alt={track.title}
                              crossOrigin="anonymous"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.src = "/placeholder.svg";
                              }}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-emerald-400 text-xs font-mono font-bold border border-emerald-500/30">
                              #{idx + 1}
                            </div>
                            <div className="absolute bottom-2 right-2 w-9 h-9 bg-emerald-500 rounded-full flex items-center justify-center text-black shadow-xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200">
                              <Play className="w-4 h-4 fill-black ml-0.5" />
                            </div>
                          </div>
                          <p className="text-xs font-semibold text-white truncate group-hover:text-emerald-400">
                            {track.title}
                          </p>
                          <p className="text-[11px] text-neutral-400 truncate">{track.artist}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recently Played — with PLAYING / PAUSED badge */}
                {displayRecentlyPlayed.length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
                          <Clock className="w-5 h-5 text-emerald-400" />
                          Recently Played
                        </h2>
                        <p className="text-xs text-neutral-400">Jump back into what you were listening to</p>
                      </div>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                      {displayRecentlyPlayed.map((track) => {
                        const isCurrent = currentTrack?.id === track.id;
                        return (
                          <div
                            key={track.id}
                            onClick={() => {
                              playTrack(track, displayRecentlyPlayed);
                            }}
                            className="shrink-0 w-36 cursor-pointer group relative"
                          >
                            <div className="relative w-36 h-36 rounded-2xl overflow-hidden mb-2 bg-neutral-800 shadow-lg">
                              <img
                                src={
                                  track.coverUrl ||
                                  (track.youtubeId ? `https://i.ytimg.com/vi/${track.youtubeId}/hqdefault.jpg` : "/placeholder.svg")
                                }
                                alt={track.title}
                                crossOrigin="anonymous"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  e.currentTarget.src = "/placeholder.svg";
                                }}
                                className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
                              />
                              {isCurrent && (
                                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-emerald-500/90 text-black text-[10px] font-bold tracking-wider shadow">
                                  {isPlaying ? "PLAYING" : "PAUSED"}
                                </div>
                              )}
                            </div>
                            <p className="text-xs font-semibold text-white truncate">{track.title}</p>
                            <p className="text-xs text-neutral-400 truncate">{track.artist}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Made For You / Featured Picks Section */}
                {madeForYouTracks.length > 0 && (
                  <div className="mb-8">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-emerald-400" />
                        <h2 className="text-xl font-bold text-white">
                          {hasListeningHistory ? "Made for you 🎵" : "Featured Picks ✨"}
                        </h2>
                      </div>
                      {hasListeningHistory && topGenres.length > 0 && (
                        <span className="text-xs font-mono text-neutral-400">
                          Based on {topGenres.join(", ")}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                      {madeForYouTracks.map((track) => (
                        <div
                          key={track.id}
                          onClick={() => playTrack(track, madeForYouTracks)}
                          className="shrink-0 w-[150px] p-3 bg-neutral-900/60 hover:bg-neutral-800/80 rounded-xl cursor-pointer group transition-all border border-neutral-800/40 hover:border-neutral-700/60 shadow-md hover:shadow-xl"
                        >
                          <div className="relative w-[126px] h-[126px] mx-auto rounded-lg overflow-hidden mb-3 bg-neutral-800">
                            <img
                              src={
                                track.coverUrl ||
                                (track.youtubeId ? `https://i.ytimg.com/vi/${track.youtubeId}/hqdefault.jpg` : "/placeholder.svg")
                              }
                              alt={track.title}
                              crossOrigin="anonymous"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.src = "/placeholder.svg";
                              }}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            <div className="absolute bottom-2 right-2 w-9 h-9 bg-emerald-500 rounded-full flex items-center justify-center text-black shadow-xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200">
                              <Play className="w-4 h-4 fill-black ml-0.5" />
                            </div>
                          </div>
                          <p className="text-sm font-semibold text-white truncate group-hover:text-emerald-400 transition-colors">
                            {track.title}
                          </p>
                          <p className="text-xs text-neutral-400 truncate mt-0.5">{track.artist}</p>
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
                      className="group flex items-center bg-neutral-900/60 hover:bg-neutral-800/80 rounded-md overflow-hidden cursor-pointer transition-all border border-neutral-800/40 hover:border-neutral-700/60 shadow-sm"
                    >
                      <img
                        src={item.coverUrl || "/placeholder.svg"}
                        alt={item.name}
                        crossOrigin="anonymous"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.src = "/placeholder.svg";
                        }}
                        className="w-16 h-16 object-cover shrink-0 shadow-md"
                      />
                      <div className="flex-1 px-4 py-2 flex items-center justify-between min-w-0">
                        <span className="font-bold text-sm text-white truncate group-hover:text-emerald-400 transition-colors">
                          {item.name}
                        </span>
                        <div className="w-10 h-10 rounded-full bg-emerald-500 text-black flex items-center justify-center opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all shadow-lg hover:scale-105">
                          <Play className="w-4 h-4 fill-black ml-0.5" />
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
                      <h2 className="text-xl font-bold text-white">Featured Playlists</h2>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
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
                      <h2 className="text-xl font-bold text-white">
                        Community Playlists
                      </h2>
                    </div>
                  </div>

                  <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                    {displayPlaylists.map((pl) => (
                      <div
                        key={pl.browseId}
                        onClick={() => router.push(`/playlist/${pl.browseId.replace(/^VL/, "")}`)}
                        title={pl.title}
                        className="shrink-0 w-36 p-3 bg-neutral-900/50 hover:bg-neutral-800/80 rounded-2xl cursor-pointer group transition-all border border-neutral-800/40 flex flex-col"
                      >
                        <img
                          src={pl.thumbnail || "/placeholder.svg"}
                          alt={pl.title}
                          crossOrigin="anonymous"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.src = "/placeholder.svg";
                          }}
                          className="w-28 h-28 rounded-xl object-cover mb-3 shadow-lg group-hover:scale-105 transition-transform"
                        />
                        <p className="text-sm font-semibold text-white truncate group-hover:text-emerald-400">
                          {pl.title}
                        </p>
                        <p className="text-xs text-neutral-400 truncate mt-0.5">
                          {pl.author || "Playlist"}
                        </p>
                        {pl.isCommunity && (
                          <span className="inline-block text-[10px] text-emerald-400 font-medium truncate mt-0.5">
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
                      <h2 className="text-xl font-bold text-white">
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
                    <h2 className="text-xl font-bold text-white">Recommended For You</h2>
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
                      <div className="lg:col-span-2 bg-neutral-900/40 hover:bg-neutral-900/70 border border-neutral-800/60 p-6 rounded-2xl flex flex-col justify-between group transition-colors">
                        <div>
                          <p className="text-xs uppercase font-bold text-neutral-400 tracking-wider mb-4">
                            Top Result
                          </p>
                          <img
                            src={topResult.coverUrl || "/placeholder.svg"}
                            alt={topResult.title}
                            crossOrigin="anonymous"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              e.currentTarget.src = "/placeholder.svg";
                            }}
                            className="w-40 h-40 rounded-2xl object-cover shadow-2xl mb-4"
                          />
                          <h2 className="text-2xl font-bold text-white group-hover:text-emerald-400 transition-colors">
                            {topResult.title}
                          </h2>
                          <p className="text-sm text-neutral-400 mt-1">
                            {topResult.artist} • <span className="text-neutral-500">{topResult.album}</span>
                          </p>
                        </div>

                        <div className="mt-6 flex items-center justify-between">
                          <span className="text-xs bg-neutral-950 px-3 py-1 rounded-full text-neutral-400 font-mono">
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
                          <TrackRow key={track.id} track={track} index={i} queue={top5Songs} />
                        ))}
                      </div>
                    </div>
                    )}

                    {/* PLAYLISTS Section (hidden when empty) */}
                    {searchPlaylists.length > 0 && (
                      <div>
                        <h3 className="text-xl font-bold text-white mb-4">Playlists</h3>
                        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                          {searchPlaylists.map((playlist) => (
                            <div
                              key={playlist.browseId}
                              onClick={() => router.push(`/playlist/${playlist.browseId.replace(/^VL/, "")}`)}
                              title={playlist.title}
                              className="shrink-0 w-36 p-3 bg-neutral-900/50 hover:bg-neutral-800/80 rounded-2xl cursor-pointer group transition-all border border-neutral-800/40"
                            >
                              <img
                                src={playlist.thumbnail || "/placeholder.svg"}
                                alt={playlist.title}
                                crossOrigin="anonymous"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  e.currentTarget.src = "/placeholder.svg";
                                }}
                                className="w-28 h-28 rounded-xl object-cover mb-3 shadow-lg group-hover:scale-105 transition-transform"
                              />
                              <p className="text-sm font-semibold text-white truncate group-hover:text-emerald-400">
                                {playlist.title}
                              </p>
                              <p className="text-xs text-neutral-400 truncate mt-0.5">
                                {playlist.author || "Playlist"}
                              </p>
                              {playlist.isCommunity && (
                                <span className="inline-block text-[10px] text-emerald-400 font-medium truncate mt-0.5">
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
                        <h3 className="text-xl font-bold text-white mb-4">Artists</h3>
                        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                          {matchingArtists.map((artist, idx) => (
                            <div
                              key={idx}
                              onClick={() => {
                                if (artist.browseId) {
                                  router.push(`/artist/${artist.browseId}`);
                                }
                              }}
                              className="shrink-0 w-36 p-3 bg-neutral-900/50 hover:bg-neutral-800/80 rounded-2xl cursor-pointer group transition-all text-center border border-neutral-800/40"
                            >
                              <img
                                src={artist.image}
                                alt={artist.name}
                                crossOrigin="anonymous"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  e.currentTarget.src = "/placeholder.svg";
                                }}
                                className="w-24 h-24 rounded-full object-cover mx-auto mb-3 shadow-lg group-hover:scale-105 transition-transform"
                              />
                              <p className="text-sm font-semibold text-white truncate group-hover:text-emerald-400">
                                {artist.name}
                              </p>
                              <p className="text-xs text-neutral-400 mt-0.5">Artist</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ALBUMS Section (horizontal scroll when matching albums) */}
                    {matchingAlbums.length > 0 && (
                      <div>
                        <h3 className="text-xl font-bold text-white mb-4">Albums</h3>
                        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                          {matchingAlbums.map((album, idx) => (
                            <div
                              key={idx}
                              onClick={() => {
                                if (album.browseId) {
                                  router.push(`/album/${album.browseId}`);
                                }
                              }}
                              className="shrink-0 w-36 p-3 bg-neutral-900/50 hover:bg-neutral-800/80 rounded-2xl cursor-pointer group transition-all border border-neutral-800/40"
                            >
                              <img
                                src={album.cover}
                                alt={album.title}
                                crossOrigin="anonymous"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  e.currentTarget.src = "/placeholder.svg";
                                }}
                                className="w-28 h-28 rounded-xl object-cover mb-3 shadow-lg group-hover:scale-105 transition-transform"
                              />
                              <p className="text-sm font-semibold text-white truncate group-hover:text-emerald-400">
                                {album.title}
                              </p>
                              <p className="text-xs text-neutral-400 truncate mt-0.5">{album.artist}</p>
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
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
                          className={`p-6 rounded-2xl bg-gradient-to-br ${mood.color} text-left cursor-pointer transition-all hover:scale-105 active:scale-95 shadow-xl border border-white/10 group`}
                        >
                          <span className="font-display font-bold text-lg text-white block">
                            {mood.name}
                          </span>
                          <span className="text-xs text-white/70 block mt-1">Tap to explore</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h2 className="font-display text-xl font-bold text-white mb-4">Browse All Categories</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
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
                            className={`aspect-square p-4 rounded-xl bg-gradient-to-br ${colors[i % colors.length]} flex flex-col justify-between cursor-pointer hover:scale-102 transition-all shadow-lg overflow-hidden relative group`}
                          >
                            <span className="font-bold text-lg text-white leading-tight">
                              {pl.name}
                            </span>
                            <img
                              src={pl.coverUrl}
                              alt={pl.name}
                              crossOrigin="anonymous"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.src = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=200&auto=format";
                              }}
                              className="w-16 h-16 rounded-md object-cover absolute -bottom-2 -right-2 shadow-2xl rotate-15 group-hover:rotate-0 group-hover:scale-110 transition-all duration-300"
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
                    #450af5 0%,
                    #8e8ee5 40%,
                    #121212 100%
                  )`,
                }}
                className="flex flex-col sm:flex-row items-center sm:items-end gap-6 p-6 sm:p-8 rounded-3xl border border-white/10 shadow-2xl transition-all"
              >
                <div className="w-40 h-40 sm:w-[200px] sm:h-[200px] rounded-lg bg-white/20 backdrop-blur-md shadow-2xl flex items-center justify-center shrink-0 border border-white/20">
                  <Heart className="w-24 h-24 text-white fill-white" />
                </div>

                <div className="text-center sm:text-left flex-1 min-w-0">
                  <p className="text-xs uppercase font-bold tracking-wider text-purple-200">PLAYLIST</p>
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

          {/* ===================== YOUR LIBRARY VIEW ===================== */}
          {currentView === "library" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <h1 className="text-3xl font-extrabold text-white tracking-tight">Your Library</h1>
                <button
                  onClick={() => setIsCreatePlaylistOpen(true)}
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
                    #121212 100%
                  )`,
                }}
                className="relative flex flex-col sm:flex-row items-center sm:items-end gap-6 p-6 sm:p-8 rounded-3xl border border-white/10 shadow-2xl transition-colors duration-500"
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
      </div>

      {/* Right "Now Playing" Panel */}
      <RightPanel
        isOpen={showRightPanel}
        onClose={() => setShowRightPanel(false)}
      />

      {/* 3. Bottom Player Bar */}
      <Player />

      {/* 4. Modals */}
      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
      />

      <CreatePlaylistModal
        key={`create-${isCreatePlaylistOpen}`}
        isOpen={isCreatePlaylistOpen}
        onClose={() => {
          setIsCreatePlaylistOpen(false);
          setPendingPlaylistTrack(null);
        }}
        onCreated={(id) => {
          if (pendingPlaylistTrack) {
            addToPlaylist(id, pendingPlaylistTrack);
            setPendingPlaylistTrack(null);
          }
          setCurrentView(`playlist:${id}`);
        }}
      />

      <CreatePlaylistModal
        key={`edit-${isEditPlaylistOpen}-${activeCustomPlaylist?.id ?? ""}`}
        isOpen={isEditPlaylistOpen}
        playlist={activeCustomPlaylist}
        onClose={() => setIsEditPlaylistOpen(false)}
        onUpdated={() => setIsEditPlaylistOpen(false)}
      />
    </div>
  );
}
