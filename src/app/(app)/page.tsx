"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Heart,
  Sparkles,
  Music,
  Compass,
  Flame,
  Plus,
  UserPlus,
  MoreVertical,
  Pencil,
  Share2,
  ArrowUpDown,
  ListEnd,
  Trash2,
  Download,
  DownloadCloud,
  History,
  Shuffle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TrackRow } from "@/components/TrackRow";
import { AnimatedShuffle } from "@/components/animations/MotionIcons";
import { PlaylistCard } from "@/components/PlaylistCard";
import { CreatePlaylistModal } from "@/components/CreatePlaylistModal";
import { useAppShell } from "@/context/AppShellContext";
import { usePlayer } from "@/context/PlayerContext";
import type { Track } from "@/lib/types";
import { FEATURED_PLAYLISTS, CURATED_TRACKS } from "@/lib/musicProvider";
import { useDominantColor } from "@/hooks/useDominantColor";
import { getActiveDataMode, useDataMode } from "@/hooks/useDataMode";
import { PlaylistCollage } from "@/components/PlaylistCollage";
import { MobileDownloads } from "@/components/MobileDownloads";
import { MobileHome } from "@/components/home/MobileHome";
import { TopSongsCoverflow } from "@/components/home/TopSongsCoverflow";
import { DOWNLOAD_TEST_NOTE } from "@/lib/testDownloadProvider";
import { getDefaultArtworkFallbackUrl, getTrackArtworkFallbackUrl, getTrackArtworkUrl, getYouTubeArtworkUrl, normalizeArtworkUrl } from "@/lib/artwork";

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
  const { currentView, setCurrentView, searchQuery, setSearchQuery, searchSubmitNonce, submitSearch, openCreatePlaylist } = useAppShell();
  const { user, playlists, savedPlaylists, likedSongIds, followedArtists, playTrack, playShuffledQueue, isShuffle, queue, setAppQueue, deletePlaylist, downloads, downloadTestPlaylist, downloadTestPlaylistVisible, downloadTracks } = usePlayer();
  const { mode } = useDataMode();
  // Low mode turns off the automatic next-track (Smart Queue) prefetch.
  const playOptions = mode === "low" ? { appendSimilar: false } : undefined;

  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [searchArtists, setSearchArtists] = useState<{ name: string; image: string; browseId: string }[]>([]);
  const [searchAlbums, setSearchAlbums] = useState<{ title: string; artist: string; cover: string; browseId: string }[]>([]);
  const [searchPlaylists, setSearchPlaylists] = useState<{ browseId: string; title: string; author: string; thumbnail: string; isCommunity?: boolean }[]>([]);
  const [communityHomePlaylists, setCommunityHomePlaylists] = useState<{ browseId: string; title: string; author: string; thumbnail: string; isCommunity?: boolean }[]>([]);
  const [searchTopResult, setSearchTopResult] = useState<Track | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchRequestRef = useRef<AbortController | null>(null);
  const searchRequestIdRef = useRef(0);
  const lastSubmittedSearchRef = useRef<{ query: string; nonce: number } | null>(null);

  const [homeTracks, setHomeTracks] = useState<Track[]>(CURATED_TRACKS);
  const [recommendations, setRecommendations] = useState<Track[]>([]);
  const [forYou, setForYou] = useState<Track[]>([]);
  const [mostPlayed, setMostPlayed] = useState<Track[]>([]);
  const [likedTracks, setLikedTracks] = useState<Track[]>([]);

  const [isEditPlaylistOpen, setIsEditPlaylistOpen] = useState(false);
  const [playlistMenuOpen, setPlaylistMenuOpen] = useState(false);
  const [playlistSortKey, setPlaylistSortKey] = useState<"default" | "title" | "artist" | "duration">("default");
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>([]);
  const [languagePreference, setLanguagePreference] = useState<string>("Hindi");
  const [mounted, setMounted] = useState(false);

  // Recently played + language preference (SSR-safe, runs only after mount)
  useEffect(() => {
    // Defer first-paint-only state so the hydration effect stays side-effect
    // free for React Compiler while the visible result is unchanged.
    queueMicrotask(() => {
      setMounted(true);
      // Load recently played from localStorage (SSR-safe)
      try {
        const raw = localStorage.getItem("recentlyPlayed");
        if (raw) setRecentlyPlayed(JSON.parse(raw) as Track[]);
        const lang = localStorage.getItem("languagePreference");
        if (lang) setLanguagePreference(lang);
      } catch {}
    });

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
    // Read the pre-paint store so the very first request already honours Low.
    const activeMode = getActiveDataMode();
    const homeLimit = activeMode === "low" ? 25 : 50;
    fetch(`/api/search?q=top+hits+india&limit=${homeLimit}&mode=${activeMode}`)
      .then((res) => res.json())
      .then((data) => {
        const rawTracks = Array.isArray(data) ? data : data.tracks || [];
        if (rawTracks.length > 0) {
          const mapped: Track[] = rawTracks.map((item: { videoId?: string; id?: string; title: string; artist: string; album?: string; thumbnail?: string; coverUrl?: string; duration?: number; artistId?: string }) => {
            const vid = item.videoId || (item.id && /^[A-Za-z0-9_-]{11}$/.test(item.id) ? item.id : undefined);
            const cover = item.thumbnail || item.coverUrl || getYouTubeArtworkUrl(vid, "hq", activeMode) || getDefaultArtworkFallbackUrl();
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
  }, [mode]);

  // Fetch Community Playlists for Home. Aggregates several recent/liked tracks
  // so one song cannot decide the whole row; falls back to the broad default.
  useEffect(() => {
    const activeMode = getActiveDataMode();
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

    fetch(`/api/search?q=${encodeURIComponent(query)}&limit=${activeMode === "low" ? 10 : 20}&mode=${activeMode}`)
      .then((res) => res.json())
      .then((data) => {
        const playlists = Array.isArray(data?.playlists) ? data.playlists : [];
        if (playlists.length > 0) {
          setCommunityHomePlaylists(playlists.slice(0, 10));
        }
      })
      .catch(() => {});
  }, [recentlyPlayed, likedTracks, mode]);

  // Fetch full liked songs when liked view is opened
  useEffect(() => {
    if (typeof window !== "undefined") {
      queueMicrotask(() => {
        try {
          const stored = localStorage.getItem("likedSongs") || localStorage.getItem("shubhu_liked_songs");
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setLikedTracks(parsed);
            }
          }
        } catch {}
      });
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
    const activeMode = getActiveDataMode();
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
      queueMicrotask(() => setRecommendations([]));
      return;
    }

    let cancelled = false;

    const buildFromRadio = () => {
      Promise.all(
        seeds.map(async ({ videoId }) => {
          try {
            const res = await fetch(`/api/next?videoId=${encodeURIComponent(videoId)}&mode=${activeMode}`);
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
                  getYouTubeArtworkUrl(item.videoId, "hq", mode) ||
                  getDefaultArtworkFallbackUrl(),
                duration: item.duration || 180,
                youtubeId: item.videoId,
              });
            }
          }

          setRecommendations(Array.from(merged.values()).slice(0, recommendationLimit));
        })
        .catch((e) => console.error("Error building recommendations:", e));
    };

    const userId = user?.id;
    const recommendationLimit = activeMode === "low" ? 10 : 20;
    if (userId) {
      const params = new URLSearchParams({
        userId,
        section: "recommended",
        limit: String(recommendationLimit),
        session: recommendSessionRef.current,
        mode: activeMode,
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
          setRecommendations(playable.slice(0, recommendationLimit));
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
  }, [recentlyPlayed, likedTracks, user?.id, mode]);

  // Additional Home sources with a single source of truth each:
  //   most  -> real play counts from song_stats
  //   for-you -> overall-taste slate (no seed-track bias)
  useEffect(() => {
    const userId = user?.id;
    const activeMode = getActiveDataMode();
    let cancelled = false;

    const fetchTracks = async (section: "most" | "for-you", limit: number) => {
      const params = new URLSearchParams({
        userId: userId ?? "",
        section,
        limit: String(limit),
        session: recommendSessionRef.current,
        mode: activeMode,
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
      const [most, personal] = await Promise.all([
        fetchTracks("most", activeMode === "low" ? 4 : 8),
        fetchTracks("for-you", activeMode === "low" ? 5 : 10),
      ]);
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
  }, [user?.id, mode]);

  useEffect(() => {
    if (!shareNotice) return;
    const timeout = setTimeout(() => setShareNotice(null), 2500);
    return () => clearTimeout(timeout);
  }, [shareNotice]);

  const clearSearchResults = useCallback(() => {
    searchRequestRef.current?.abort();
    searchRequestRef.current = null;
    setSearchResults([]);
    setSearchArtists([]);
    setSearchAlbums([]);
    setSearchPlaylists([]);
    setSearchTopResult(null);
    setIsSearching(false);
  }, []);

  const runSearch = useCallback((rawQuery: string) => {
    const trimmedQuery = rawQuery.trim();
    if (!trimmedQuery) {
      clearSearchResults();
      return;
    }

    searchRequestRef.current?.abort();
    const controller = new AbortController();
    searchRequestRef.current = controller;
    const requestId = ++searchRequestIdRef.current;
    setIsSearching(true);
    const activeMode = getActiveDataMode();
    const searchLimit = activeMode === "low" ? 25 : 50;

    fetch(`/api/search?q=${encodeURIComponent(trimmedQuery)}&limit=${searchLimit}&mode=${activeMode}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (controller.signal.aborted || requestId !== searchRequestIdRef.current) return;

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
            coverUrl: item.thumbnail || item.coverUrl || getYouTubeArtworkUrl(vid, "hq", activeMode) || getDefaultArtworkFallbackUrl(),
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
      .catch((error) => {
        if (controller.signal.aborted || requestId !== searchRequestIdRef.current) return;
        console.error("Search failed", error);
        setIsSearching(false);
      });
  }, [clearSearchResults, mode]);

  // Search only runs on explicit submission (Enter/Go/icon). Typing updates input only.
  useEffect(() => {
    if (currentView !== "search") return;
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      lastSubmittedSearchRef.current = null;
      queueMicrotask(() => clearSearchResults());
      return;
    }
    if (searchSubmitNonce === 0) return;
    const previous = lastSubmittedSearchRef.current;
    if (previous && previous.query === trimmed && previous.nonce === searchSubmitNonce) return;
    lastSubmittedSearchRef.current = { query: trimmed, nonce: searchSubmitNonce };
    queueMicrotask(() => runSearch(trimmed));
  }, [clearSearchResults, currentView, runSearch, searchQuery, searchSubmitNonce]);

  useEffect(() => () => searchRequestRef.current?.abort(), []);

  // Resolve custom playlist if in view
  const activeCustomPlaylist = currentView.startsWith("playlist:")
    ? playlists.find((p) => p.id === currentView.replace("playlist:", ""))
    : null;

  // Custom playlist dominant color
  const playlistDominantColor = useDominantColor(activeCustomPlaylist?.coverUrl);

  // Playlist page "Sort by" â€” display order only, does not rewrite stored order.
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

  const handleDownloadCustomPlaylist = async () => {
    if (!activeCustomPlaylist?.tracks?.length) return;
    const result = await downloadTracks(activeCustomPlaylist.tracks, {
      kind: "playlist",
      id: `playlist:${activeCustomPlaylist.id}`,
      title: activeCustomPlaylist.name,
      index: 0,
      total: activeCustomPlaylist.tracks.length,
      artworkUrl: activeCustomPlaylist.coverUrl || undefined,
      author: activeCustomPlaylist.userId || undefined,
      description: activeCustomPlaylist.description || undefined,
    });
    setDownloadNotice(
      result.added.length > 0
        ? `Downloading ${result.added.length} of ${activeCustomPlaylist.tracks.length} songsâ€¦`
        : result.duplicates.length > 0
          ? "Those songs are already downloaded or queued."
          : "No songs here have a legal download source.",
    );
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

  // Home data (the "All" feed â€” there is no mood filtering anymore).
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

  return (
    <>
      {/* Scrollable Viewport */}
      <main className="wrap app-scroll-pad flex-1 overflow-y-auto px-4 sm:px-8 py-4 sm:py-6 scrollbar-thin scrollbar-thumb-neutral-800">
          {/* ===================== HOME VIEW ===================== */}
          {currentView === "home" && (
            <>
              {/* Phone-only Home rebuild; desktop keeps the existing layout. */}
              <div className="sm:hidden">
                <MobileHome />
              </div>
              <div className="wrap hidden sm:block space-y-6 sm:space-y-8 animate-in fade-in duration-200">
              {/* Header Greeting */}
              <div>
                <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 mb-4 sm:mb-6">
                  <div className="min-w-0">
                    <h1 className="font-display text-[30px] leading-[1.06] font-semibold tracking-tight text-white sm:text-[46px]">
                      Your music,{" "}
                      <span style={{ color: "var(--theme-accent-strong)" }}>
                        {(user?.username || "Guest").replace(/#.*/, "").trim() || "Guest"}
                      </span>
                    </h1>
                    <p className="mt-2 max-w-xl text-xs leading-relaxed text-neutral-400 sm:text-sm">
                      Your day, set to music. Pick up where you left off or let the queue surprise you.
                    </p>
                  </div>
                  <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
                    <span className="hidden sm:inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-[11px] font-medium text-neutral-300">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--theme-accent)] opacity-60" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--theme-accent)]" />
                      </span>
                      {displayHomeTracks.length} tracks live now
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void playShuffledQueue(
                          displayHomeTracks.length > 0 ? displayHomeTracks : CURATED_TRACKS,
                        )
                      }
                      className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-[var(--theme-accent)] px-5 text-sm font-semibold text-[var(--theme-accent-contrast)] transition-transform hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent)]"
                    >
                      <Shuffle className="h-4 w-4" />
                      Play a mix
                    </button>
                  </div>
                </div>

                {/* Top songs coverflow — desktop only (md and up) */}
                {displayHomeTracks.length > 0 && (
                  <TopSongsCoverflow tracks={displayHomeTracks.slice(0, 9)} className="mb-4 sm:mb-8" />
                )}

                {/* Popular songs */}
                {displayPopularTracks.length > 0 && (
                  <div className="mb-8">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h2 className="font-display text-2xl font-semibold tracking-tight text-white">Popular music</h2>
                        <p className="text-xs text-neutral-400 mt-0.5">Top trending music right now</p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-neutral-300">
                        {displayPopularTracks.length} tracks
                      </span>
                    </div>
                    <div
                      id="popular-songs-scroll"
                      data-edge-free
                      className="flex gap-3 sm:gap-4 overflow-x-auto pb-3 scrollbar-hide"
                    >
                      {displayPopularTracks.map((track, i) => (
                        <div
                          key={`pop-${track.id}`}
                          onClick={() => playTrack(track, displayPopularTracks, playOptions)}
                          className={`card-variant-${i % 4} w-[160px] sm:w-[172px] md:w-[180px] shrink-0 p-2.5 sm:p-3 bg-neutral-900/50 hover:bg-neutral-800/70 rounded-2xl cursor-pointer group transition-all duration-300 border border-white/5 hover:border-white/10 shadow-sm hover:shadow-xl hover:-translate-y-0.5`}
                        >
                          <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-3 bg-neutral-800">
                            <img
                              src={getTrackArtworkUrl(track, "hq", mode)}
                              alt={track.title}
                              crossOrigin="anonymous"
                              referrerPolicy="no-referrer"

                              loading="eager"

                              decoding="async"
                              onError={(e) => {
                                e.currentTarget.src = getTrackArtworkFallbackUrl(track, "hq", mode);
                              }}
                              className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                            />
                            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                            <div className="absolute bottom-2 right-2 w-9 h-9 bg-[var(--theme-accent)] rounded-full flex items-center justify-center text-[var(--theme-accent-contrast)] shadow-lg opacity-100 transition-transform duration-200 sm:opacity-0 sm:translate-y-2 sm:group-hover:opacity-100 sm:group-hover:translate-y-0 sm:group-focus-within:opacity-100 sm:group-focus-within:translate-y-0">
                              <Play className="w-4 h-4 fill-black ml-0.5" />
                            </div>
                          </div>
                          <p className="text-[13px] font-semibold text-white truncate group-hover:text-[var(--theme-accent)] transition-colors">
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
                        <h2 className="font-display text-2xl font-semibold text-white flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-[var(--theme-accent)]" />
                          Your most-played music
                        </h2>
                        <p className="text-xs text-neutral-400">Most replayed tracks by you</p>
                      </div>
                    </div>
                    <div data-edge-free className="flex gap-3 sm:gap-4 overflow-x-auto pb-3 scrollbar-hide">
                      {displayMostPlayed.map((track, idx) => (
                        <div
                          key={`most-played-${track.id}-${idx}`}
                          onClick={() => playTrack(track, displayMostPlayed, playOptions)}
                          className={`card-variant-${idx % 4} w-[160px] sm:w-[172px] md:w-[180px] shrink-0 p-2.5 sm:p-3 bg-neutral-900/50 hover:bg-neutral-800/70 rounded-2xl cursor-pointer group transition-all duration-300 border border-white/5 hover:border-white/10 shadow-sm hover:shadow-xl hover:-translate-y-0.5`}
                        >
                          <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-3 bg-neutral-800">
                            <img
                              src={getTrackArtworkUrl(track, "hq", mode)}
                              alt={track.title}
                              crossOrigin="anonymous"
                              referrerPolicy="no-referrer"

                              loading="eager"

                              decoding="async"
                              onError={(e) => {
                                e.currentTarget.src = getTrackArtworkFallbackUrl(track, "hq", mode);
                              }}
                              className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                            />
                            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[var(--theme-accent)] text-xs font-mono font-bold border border-emerald-500/30">
                              #{idx + 1}
                            </div>
                            <div className="absolute bottom-2 right-2 w-9 h-9 bg-[var(--theme-accent)] rounded-full flex items-center justify-center text-[var(--theme-accent-contrast)] shadow-lg opacity-100 transition-transform duration-200 sm:opacity-0 sm:translate-y-2 sm:group-hover:opacity-100 sm:group-hover:translate-y-0 sm:group-focus-within:opacity-100 sm:group-focus-within:translate-y-0">
                              <Play className="w-4 h-4 fill-black ml-0.5" />
                            </div>
                          </div>
                          <p className="text-[13px] font-semibold text-white truncate group-hover:text-[var(--theme-accent)] transition-colors">
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
                  <div data-edge-free className="mb-8">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-[var(--theme-accent)]" />
                        <h2 className="font-display text-2xl font-semibold tracking-tight text-white">
                          {hasListeningHistory ? "Made-for-you music" : "Featured music picks"}
                        </h2>
                      </div>
                      {hasListeningHistory && topGenres.length > 0 && (
                        <span className="text-xs font-mono text-neutral-400">
                          Based on {topGenres.join(", ")}
                        </span>
                      )}
                    </div>
                    <div data-edge-free className="flex gap-3 sm:gap-4 overflow-x-auto pb-3 scrollbar-hide">
                      {madeForYouTracks.map((track, idx) => (
                        <div
                          key={track.id}
                          onClick={() => playTrack(track, madeForYouTracks, playOptions)}
                          className={`card-variant-${idx % 4} w-[160px] sm:w-[172px] md:w-[180px] shrink-0 p-2.5 sm:p-3 bg-neutral-900/50 hover:bg-neutral-800/70 rounded-2xl cursor-pointer group transition-all duration-300 border border-white/5 hover:border-white/10 shadow-sm hover:shadow-xl hover:-translate-y-0.5`}
                        >
                          <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-3 bg-neutral-800">
                            <img
                              src={getTrackArtworkUrl(track, "hq", mode)}
                              alt={track.title}
                              crossOrigin="anonymous"
                              referrerPolicy="no-referrer"

                              loading="eager"

                              decoding="async"
                              onError={(e) => {
                                e.currentTarget.src = getTrackArtworkFallbackUrl(track, "hq", mode);
                              }}
                              className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                            />
                            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                            <div className="absolute bottom-2 right-2 w-9 h-9 bg-[var(--theme-accent)] rounded-full flex items-center justify-center text-[var(--theme-accent-contrast)] shadow-lg opacity-100 transition-transform duration-200 sm:opacity-0 sm:translate-y-2 sm:group-hover:opacity-100 sm:group-hover:translate-y-0 sm:group-focus-within:opacity-100 sm:group-focus-within:translate-y-0">
                              <Play className="w-4 h-4 fill-black ml-0.5" />
                            </div>
                          </div>
                          <p className="text-[13px] font-semibold text-white truncate group-hover:text-[var(--theme-accent)] transition-colors">
                            {track.title}
                          </p>
                          <p className="text-[11px] text-neutral-400 truncate mt-0.5">{track.artist}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div data-edge-free className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                  {prioritizedPlaylists.slice(0, 6).map((item, idx) => (
                    <div
                      key={item.id}
                      onClick={() => router.push(`/playlist/${item.playlistId}`)}
                      className={`card-variant-${idx % 4} group relative flex items-center bg-neutral-900/40 hover:bg-neutral-800/60 rounded-xl overflow-hidden cursor-pointer transition-all duration-300 border border-white/5 hover:border-white/10 shadow-sm hover:shadow-lg`}
                    >
                      <div className="relative w-12 h-12 sm:w-14 sm:h-14 shrink-0 overflow-hidden">
                        <img
                          src={item.coverUrl || "/placeholder.svg"}
                          alt={item.name}
                          crossOrigin="anonymous"
                          referrerPolicy="no-referrer"

                          loading="eager"

                          decoding="async"
                          onError={(e) => {
                            e.currentTarget.src = getDefaultArtworkFallbackUrl();
                          }}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 shadow-md"
                        />
                        <div className="absolute bottom-1 right-1 w-8 h-8 shrink-0 rounded-full bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] flex items-center justify-center opacity-100 transition-transform duration-200 sm:w-7 sm:h-7 sm:opacity-0 sm:translate-y-1 sm:group-hover:opacity-100 sm:group-hover:translate-y-0 sm:group-focus-within:opacity-100 sm:group-focus-within:translate-y-0 shadow-lg">
                          <Play className="w-3 h-3 fill-black ml-0.5" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 px-2.5 sm:px-3 py-2">
                        <span className="line-clamp-2 text-[13px] font-semibold leading-tight text-white group-hover:text-[var(--theme-accent)] transition-colors">
                          {item.name}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Featured Curated Playlists Cards â€” Prioritized by language */}
              {
                <div data-edge-free>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Compass className="w-5 h-5 text-[var(--theme-accent)]" />
                      <h2 className="font-display text-2xl font-semibold tracking-tight text-white">Featured Playlists</h2>
                    </div>
                  </div>

                  <div data-edge-free className="flex gap-3 sm:gap-4 overflow-x-auto pb-3 scrollbar-hide">
                    {prioritizedPlaylists.map((pl, idx) => (
                      <PlaylistCard
                        key={pl.id}
                        playlist={pl}
                        variant={idx}
                        onClick={() => router.push(`/playlist/${pl.playlistId}`)}
                        onPlay={() => router.push(`/playlist/${pl.playlistId}`)}
                      />
                    ))}
                  </div>
                </div>
              }

              {/* Community / Mood Playlists Row (hidden if empty) */}
              {displayPlaylists.length > 0 && (
                <div data-edge-free>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Music className="w-5 h-5 text-[var(--theme-accent)]" />
                      <h2 className="font-display text-2xl font-semibold tracking-tight text-white">
                        Community Playlists
                      </h2>
                    </div>
                  </div>

                  <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-3 scrollbar-hide">
                    {displayPlaylists.map((pl, idx) => (
                      <div
                        key={pl.browseId}
                        onClick={() => router.push(`/playlist/${pl.browseId.replace(/^VL/, "")}`)}
                        title={pl.title}
                        className={`card-variant-${idx % 4} w-[160px] sm:w-[172px] md:w-[180px] shrink-0 p-2.5 sm:p-3 bg-neutral-900/50 hover:bg-neutral-800/70 rounded-2xl cursor-pointer group transition-all duration-300 border border-white/5 hover:border-white/10 shadow-sm hover:shadow-xl hover:-translate-y-0.5 flex flex-col`}
                      >
                        <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-3 bg-neutral-800">
                          <img
                            src={normalizeArtworkUrl(pl.thumbnail)}
                            alt={pl.title}
                            crossOrigin="anonymous"
                            referrerPolicy="no-referrer"

                            loading="eager"

                            decoding="async"
                            onError={(e) => {
                              e.currentTarget.src = getDefaultArtworkFallbackUrl();
                            }}
                            className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                          />
                          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                          <div className="absolute bottom-2 right-2 w-9 h-9 bg-[var(--theme-accent)] rounded-full flex items-center justify-center text-[var(--theme-accent-contrast)] shadow-lg opacity-100 transition-transform duration-200 sm:opacity-0 sm:translate-y-2 sm:group-hover:opacity-100 sm:group-hover:translate-y-0 sm:group-focus-within:opacity-100 sm:group-focus-within:translate-y-0">
                            <Play className="w-4 h-4 fill-black ml-0.5" />
                          </div>
                        </div>
                        <p className="text-[13px] font-semibold text-white truncate group-hover:text-[var(--theme-accent)] transition-colors">
                          {pl.title}
                        </p>
                        <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                          {pl.author || "Playlist"}
                        </p>
                        {pl.isCommunity && (
                          <span className="inline-block text-[10px] text-[var(--theme-accent)] font-medium truncate mt-1">
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
                <div data-edge-free>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Flame className="w-5 h-5 text-[var(--theme-accent)]" />
                      <h2 className="font-display text-2xl font-semibold tracking-tight text-white">
                        Trending music chartbusters
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
                      <TrackRow key={track.id} track={track} index={i} queue={displayHomeTracks} eagerArtwork variant={i} />
                    ))}
                  </div>
                </div>
              )}

              {/* Made For You / Smart Recommendations */}
              {recommendations.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-5 h-5 text-[var(--theme-accent)]" />
                    <h2 className="font-display text-2xl font-semibold tracking-tight text-white">Recommended For You</h2>
                  </div>

                  <div className="bg-neutral-950/40 rounded-xl border border-neutral-900/60 p-2 divide-y divide-neutral-900">
                    {recommendations.slice(0, 6).map((track, i) => (
                      <TrackRow key={track.id} track={track} index={i} queue={recommendations} eagerArtwork variant={i} />
                    ))}
                  </div>
                </div>
              )}
              </div>
            </>
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
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0 opacity-25 transition-opacity duration-300 group-hover:opacity-40"
                          style={{
                            backgroundImage: `url("${getTrackArtworkUrl(topResult, "hq", mode)}")`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                            filter: "blur(44px) saturate(1.25)",
                          }}
                        />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--background)] via-[var(--background)]/70 to-transparent" />
                        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                        <div className="relative">
                          <p className="text-xs uppercase font-bold text-neutral-400 tracking-wider mb-4">
                            Top Result
                          </p>
                          <div className="relative w-40 h-40 sm:w-44 sm:h-44 rounded-2xl overflow-hidden shadow-2xl mb-5 bg-neutral-800">
                            <img
                              src={getTrackArtworkUrl(topResult, "hq", mode)}
                              alt={topResult.title}
                              crossOrigin="anonymous"
                              referrerPolicy="no-referrer"

                              loading="eager"

                              decoding="async"
                              onError={(e) => {
                                e.currentTarget.src = getTrackArtworkFallbackUrl(topResult, "hq", mode);
                              }}
                              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                            />
                            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent" />
                          </div>
                          <h2 className="text-2xl font-bold text-white truncate group-hover:text-[var(--theme-accent)] transition-colors">
                            {topResult.title}
                          </h2>
                          <p className="text-sm text-neutral-400 mt-1.5 truncate">
                            {topResult.artist} â€¢ <span className="text-neutral-500">{topResult.album}</span>
                          </p>
                        </div>

                        <div className="relative mt-6 flex items-center justify-between gap-3">
                          <span className="text-xs bg-neutral-950 px-3 py-1 rounded-full text-neutral-400 font-mono border border-white/5">
                            Song
                          </span>
                          <button
                            onClick={() => playTrack(topResult, top5Songs.length > 0 ? top5Songs : [topResult], playOptions)}
                            className="w-12 h-12 rounded-full bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl shadow-[0_18px_45px_-20px_rgba(var(--theme-accent-rgb),0.5)] cursor-pointer"
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
                        <h3 className="mb-4 font-display text-lg font-semibold text-white">Playlists</h3>
                        <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 scrollbar-hide">
                          {searchPlaylists.map((playlist) => (
                            <button
                              type="button"
                              key={playlist.browseId}
                              onClick={() => router.push(`/playlist/${playlist.browseId.replace(/^VL/, "")}`)}
                              title={playlist.title}
                              className="shrink-0 w-[142px] sm:w-40 p-2.5 sm:p-3 bg-neutral-900/50 hover:bg-neutral-800/70 rounded-2xl cursor-pointer group text-left transition-all duration-300 border border-white/5 hover:border-white/10 shadow-sm hover:shadow-xl hover:-translate-y-0.5"
                            >
                              <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-3 bg-neutral-800">
                                <img
                                  src={normalizeArtworkUrl(playlist.thumbnail)}
                                  alt={playlist.title}
                                  crossOrigin="anonymous"
                                  referrerPolicy="no-referrer"

                                  loading="eager"

                                  decoding="async"
                                  onError={(e) => {
                                    e.currentTarget.src = getDefaultArtworkFallbackUrl();
                                  }}
                                  className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                                />
                              </div>
                              <p className="text-[13px] font-semibold text-white truncate group-hover:text-[var(--theme-accent)] transition-colors">
                                {playlist.title}
                              </p>
                              <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                                {playlist.author || "Playlist"}
                              </p>
                              {playlist.isCommunity && (
                                <span className="inline-block text-[10px] text-[var(--theme-accent)] font-medium truncate mt-1">
                                  Community playlist
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ARTISTS Section (horizontal scroll when matching artists) */}
                    {matchingArtists.length > 0 && (
                      <div>
                        <h3 className="mb-4 font-display text-lg font-semibold text-white">Artists</h3>
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

                                loading="eager"

                                decoding="async"
                                onError={(e) => {
                                  e.currentTarget.src = getDefaultArtworkFallbackUrl();
                                }}
                                className="w-28 h-28 rounded-full object-cover mx-auto mb-3 shadow-lg group-hover:scale-[1.04] transition-transform duration-300"
                              />
                              <p className="text-[13px] font-semibold text-white truncate group-hover:text-[var(--theme-accent)] transition-colors">
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
                        <h3 className="mb-4 font-display text-lg font-semibold text-white">Albums</h3>
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

                                  loading="eager"

                                  decoding="async"
                                  onError={(e) => {
                                    e.currentTarget.src = getDefaultArtworkFallbackUrl();
                                  }}
                                  className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                                />
                              </div>
                              <p className="text-[13px] font-semibold text-white truncate group-hover:text-[var(--theme-accent)] transition-colors">
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
                        <h3 className="mb-3 font-display text-xl font-semibold text-white">All results</h3>
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
                                playTrack(track, undefined, playOptions);
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
                    <h2 className="font-display text-2xl font-bold text-white mb-4">
                      Browse by Mood
                    </h2>
                    <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-3 scrollbar-hide">
                      {[
                        { name: "Chill", query: "chill lofi hits", color: "var(--home-mood-1)" },
                        { name: "Romantic", query: "romantic hindi songs", color: "var(--home-mood-2)" },
                        { name: "Party", query: "party dance club hits", color: "var(--home-mood-3)" },
                        { name: "Workout", query: "high energy workout motivation", color: "var(--home-mood-4)" },
                        { name: "Focus", query: "deep focus instrumental study", color: "var(--home-mood-5)" },
                        { name: "Heartbreak", query: "sad hindi heartbreak songs", color: "var(--home-mood-6)" },
                        { name: "Retro", query: "90s 2000s retro classic bollywood", color: "var(--home-mood-7)" },
                        { name: "English Hits", query: "top english pop hits 2026", color: "var(--home-mood-8)" },
                      ].map((mood) => (
                        <button
                          key={mood.name}
                          onClick={() => submitSearch(mood.query)}
                          style={{ backgroundImage: mood.color }}
                          className="theme-dark-surface p-4 sm:p-6 rounded-2xl text-left cursor-pointer transition-all hover:scale-105 active:scale-95 shadow-xl border border-white/10 group"
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
                    <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-3 scrollbar-hide">
                      {FEATURED_PLAYLISTS.map((pl, i) => {
                        const colors = [
                          "var(--home-category-1)",
                          "var(--home-category-2)",
                          "var(--home-category-3)",
                          "var(--home-category-4)",
                          "var(--home-category-5)",
                          "var(--home-category-6)",
                        ];
                        return (
                          <div
                            key={pl.id}
                            onClick={() => router.push(`/playlist/${pl.playlistId}`)}
                            style={{ backgroundImage: colors[i % colors.length] }}
                            className="theme-dark-surface aspect-square p-3 sm:p-4 rounded-xl flex flex-col justify-between cursor-pointer hover:scale-102 transition-all shadow-lg overflow-hidden relative group"
                          >
                            <span className="font-bold text-[13px] sm:text-lg text-white leading-snug break-words">
                              {pl.name}
                            </span>
                            <img
                              src={pl.coverUrl}
                              alt={pl.name}
                              crossOrigin="anonymous"
                              referrerPolicy="no-referrer"

                              loading="eager"

                              decoding="async"
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
                    <span>â€¢</span>
                    <span>{likedTracks.length} songs</span>
                  </p>
                </div>
              </div>

              {/* Action row: Large green Play button (56px circle) */}
              {likedTracks.length > 0 && (
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => playTrack(likedTracks[0], likedTracks, playOptions)}
                    className="w-14 h-14 rounded-full bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl shadow-[0_18px_45px_-20px_rgba(var(--theme-accent-rgb),0.5)] cursor-pointer"
                    title="Play all liked songs"
                  >
                    <Play className="w-6 h-6 fill-black ml-0.5" />
                  </button>
                  <button
                    onClick={() => void playShuffledQueue(likedTracks)}
                    aria-pressed={isShuffle}
                    aria-label="Shuffle Liked Songs"
                    className={`w-11 h-11 rounded-full border flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer ${
                      isShuffle
                        ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-300 shadow-lg shadow-emerald-500/10"
                        : "border-white/10 bg-neutral-900 text-neutral-300 hover:text-white hover:border-white/20"
                    }`}
                    title={isShuffle ? "Shuffle is on" : "Shuffle Liked Songs"}
                  >
                    <AnimatedShuffle active={isShuffle} className="w-5 h-5" />
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

          {/* ===================== DOWNLOADS VIEW (MOBILE ONLY) ===================== */}
          {currentView === "downloads" && (
            <div className="sm:hidden">
              <MobileDownloads onBack={() => setCurrentView("library")} />
            </div>
          )}

          {/* ===================== RECENT PLAYED VIEW ===================== */}
          {currentView === "recent" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-[var(--theme-icon)]" />
                <h1 className="text-2xl font-extrabold text-white tracking-tight">Recent Played</h1>
              </div>
              {recentlyPlayed.length === 0 ? (
                <div className="py-16 text-center text-neutral-500">
                  <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-base font-semibold text-neutral-300">Nothing here yet</p>
                  <p className="text-xs text-neutral-500 mt-1">Play something to see it here.</p>
                </div>
              ) : (
                <div className="bg-neutral-950/40 rounded-2xl border border-neutral-900/60 p-2 divide-y divide-neutral-900">
                  {recentlyPlayed.map((track, i) => (
                    <TrackRow key={track.id} track={track} index={i} queue={recentlyPlayed} />
                  ))}
                </div>
              )}
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

              <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 sm:gap-4">
                {/* Liked Songs Card - Equal size to PlaylistCard */}
                <div
                  onClick={() => setCurrentView("liked")}
                  className="group relative bg-neutral-900/60 hover:bg-neutral-800/80 p-4 rounded-xl transition-all duration-200 cursor-pointer flex flex-col border border-neutral-800/40 hover:border-neutral-700/60 shadow-sm hover:shadow-xl hover:scale-105"
                >
                  <div className="relative aspect-square w-full rounded-lg overflow-hidden mb-4 shubhu-home-gradient flex items-center justify-center shadow-md group-hover:scale-105 transition-transform duration-300" style={{ "--home-gradient": "var(--home-category-1)" } as React.CSSProperties}>
                    <Heart className="w-16 h-16 text-white fill-white shadow-xl" />
                  </div>
                  <h3 className="font-semibold text-white text-base truncate mb-1">
                    Liked Songs
                  </h3>
                  <p className="text-xs text-neutral-400 truncate">
                    {mounted ? likedSongIds.size : 0} songs
                  </p>
                </div>

                {/* Downloads Card â€” mobile Library only */}
                <div
                  onClick={() => setCurrentView("downloads")}
                  className="sm:hidden group relative bg-neutral-900/60 hover:bg-neutral-800/80 p-4 rounded-xl transition-all duration-200 cursor-pointer flex flex-col border border-neutral-800/40 hover:border-neutral-700/60 shadow-sm hover:shadow-xl hover:scale-105"
                >
                  <div className="relative aspect-square w-full rounded-lg overflow-hidden mb-4 bg-gradient-to-br from-emerald-700 to-teal-400 flex items-center justify-center shadow-md group-hover:scale-105 transition-transform duration-300">
                    <Download className="w-16 h-16 text-white shadow-xl" />
                  </div>
                  <h3 className="font-semibold text-white text-base truncate mb-1">Downloads</h3>
                  <p className="text-xs text-neutral-400 truncate">{mounted ? downloads.length : 0} songs</p>
                </div>

                {/* Temporary Download Test Playlist â€” mobile Library only */}
                {mounted && downloadTestPlaylistVisible && (
                  <div
                    onClick={() => router.push(`/playlist/${downloadTestPlaylist.id}`)}
                    className="sm:hidden group relative bg-neutral-900/60 hover:bg-neutral-800/80 p-4 rounded-xl transition-all duration-200 cursor-pointer flex flex-col border border-amber-400/30 hover:border-amber-300/60 shadow-sm hover:shadow-xl hover:scale-105"
                  >
                    <div className="relative aspect-square w-full rounded-lg overflow-hidden mb-4 bg-neutral-800 flex items-center justify-center shadow-md group-hover:scale-105 transition-transform duration-300">
                      <img
                        src={downloadTestPlaylist.coverUrl || getDefaultArtworkFallbackUrl()}
                        alt={downloadTestPlaylist.name}
                        loading="eager"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute left-2 top-2 rounded bg-amber-400 px-1.5 py-0.5 text-[9px] font-black text-black">
                        TEST
                      </span>
                    </div>
                    <h3 className="font-semibold text-white text-base truncate mb-1">
                      {downloadTestPlaylist.name}
                    </h3>
                    <p className="text-xs text-amber-200/80 truncate">
                      Temporary â€¢ {downloadTestPlaylist.tracks?.length || 0} songs
                    </p>
                    <p className="sr-only">{DOWNLOAD_TEST_NOTE}</p>
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
                        ? () => playTrack(pl.tracks![0], pl.tracks, playOptions)
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
                      <UserPlus className="w-5 h-5 text-[var(--theme-accent)]" />
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
                          src={normalizeArtworkUrl(artist.thumbnail)}
                          alt={artist.name}
                          crossOrigin="anonymous"
                          referrerPolicy="no-referrer"

                          loading="eager"

                          decoding="async"
                          onError={(e) => {
                            e.currentTarget.src = getDefaultArtworkFallbackUrl();
                          }}
                          className="w-20 h-20 rounded-full object-cover mx-auto mb-3 shadow-lg group-hover:scale-[1.04] transition-transform duration-300"
                        />
                        <p className="text-[13px] font-semibold text-white truncate group-hover:text-[var(--theme-accent)] transition-colors">
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
                    <span>â€¢</span>
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
                                playlistSortKey === key ? "text-[var(--theme-accent)]" : ""
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
                      onClick={() => playTrack(activeCustomPlaylist.tracks![0], activeCustomPlaylist.tracks, playOptions)}
                      className="w-14 h-14 rounded-full bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl shadow-[0_18px_45px_-20px_rgba(var(--theme-accent-rgb),0.5)] cursor-pointer"
                      title="Play Playlist"
                    >
                      <Play className="w-6 h-6 fill-black ml-0.5" />
                    </button>
                  )}

                  {activeCustomPlaylist.tracks && activeCustomPlaylist.tracks.length > 0 && (
                    <button
                      onClick={() => void handleDownloadCustomPlaylist()}
                      className="sm:hidden flex min-h-11 items-center gap-2 rounded-full border border-[rgba(var(--theme-accent-rgb),0.4)] bg-[rgba(var(--theme-accent-rgb),0.1)] px-4 py-2 text-xs font-semibold text-[var(--theme-accent-strong)] cursor-pointer"
                    >
                      <DownloadCloud className="w-4 h-4" />
                      Download Playlist
                    </button>
                  )}

                  {downloadNotice && (
                    <span className="sm:hidden text-xs text-emerald-300 font-medium">{downloadNotice}</span>
                  )}

                  {shareNotice && (
                    <span className="text-xs text-[var(--theme-accent)] font-medium">{shareNotice}</span>
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
