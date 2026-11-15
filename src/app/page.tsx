"use client";

import React, { useState, useEffect, useMemo } from "react";
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
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Navbar } from "@/components/Navbar";
import { Player } from "@/components/Player";
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
  const [searchArtists, setSearchArtists] = useState<{ name: string; image: string }[]>([]);
  const [searchAlbums, setSearchAlbums] = useState<{ title: string; artist: string; cover: string }[]>([]);
  const [searchPlaylists, setSearchPlaylists] = useState<{ browseId: string; title: string; author: string; thumbnail: string }[]>([]);
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
          const mapped: Track[] = rawTracks.map((item: { videoId?: string; id?: string; title: string; artist: string; album?: string; thumbnail?: string; coverUrl?: string; duration?: number }) => {
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
            };
          });
          setHomeTracks(mapped);
        }
      })
      .catch((e) => console.error(e));
  }, []);

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
          const rawTracks: { videoId?: string; id?: string; title: string; artist: string; album?: string; thumbnail?: string; coverUrl?: string; duration?: number }[] = Array.isArray(data)
            ? data
            : data.tracks || [];
          const toTrack = (item: { videoId?: string; id?: string; title: string; artist: string; album?: string; thumbnail?: string; coverUrl?: string; duration?: number }): Track => {
            const vid = item.videoId || (item.id && /^[A-Za-z0-9_-]{11}$/.test(item.id) ? item.id : undefined);
            return {
              id: vid || item.id || "",
              title: item.title,
              artist: item.artist,
              album: item.album || "",
              coverUrl: item.thumbnail || item.coverUrl || (vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : "/placeholder.svg"),
              duration: item.duration || 180,
              youtubeId: vid,
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
              (data.artists || []).map((artist: { name: string; thumbnail?: string }) => ({
                name: artist.name,
                image: artist.thumbnail || "/placeholder.svg",
              })),
            );
            setSearchAlbums(
              (data.albums || []).map((album: { title: string; artist?: string; thumbnail?: string }) => ({
                title: album.title,
                artist: album.artist || "",
                cover: album.thumbnail || "/placeholder.svg",
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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-black text-white">
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
      />

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-gradient-to-b from-neutral-900 via-neutral-950 to-black">
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
        <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 pb-32 scrollbar-thin scrollbar-thumb-neutral-800">
          {/* ===================== HOME VIEW ===================== */}
          {currentView === "home" && (
            <div className="space-y-8 animate-in fade-in duration-200">
              {/* Header Greeting */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h1 className="text-3xl font-extrabold tracking-tight text-white">
                    {greeting}
                  </h1>
                </div>

                {/* Recently Played — only if array is non-empty */}
                {recentlyPlayed.length > 0 && (
                  <div className="mb-6">
                    <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                      <Clock className="w-5 h-5 text-emerald-400" />
                      Recently Played
                    </h2>
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                      {recentlyPlayed.map((track) => (
                        <div
                          key={track.id}
                          onClick={() => {
                            // Play song and auto-build queue from similar songs (not sequential recently played)
                            playTrack(track);
                          }}
                          className="shrink-0 w-36 cursor-pointer group"
                        >
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
                            className="w-36 h-36 rounded-xl object-cover mb-2 group-hover:opacity-80 transition-opacity shadow-lg"
                          />
                          <p className="text-xs font-semibold text-white truncate">{track.title}</p>
                          <p className="text-xs text-neutral-400 truncate">{track.artist}</p>
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

              {/* Trending Chartbusters Table */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Flame className="w-5 h-5 text-emerald-400" />
                    <h2 className="text-xl font-bold text-white">Trending Chartbusters</h2>
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
                  {homeTracks.slice(0, 8).map((track, i) => (
                    <TrackRow key={track.id} track={track} index={i} queue={homeTracks} />
                  ))}
                </div>
              </div>

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
              {/* Category Pills */}
              <div className="flex flex-wrap items-center gap-2 pb-2">
                {SEARCH_PILLS.map((pill) => (
                  <button
                    key={pill}
                    onClick={() => setSearchQuery(pill)}
                    className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                      searchQuery.toLowerCase() === pill.toLowerCase()
                        ? "bg-white text-black shadow-md"
                        : "bg-neutral-800 hover:bg-neutral-700 text-white"
                    }`}
                  >
                    {pill}
                  </button>
                ))}
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
                const matchingArtistsMap = new Map<string, { name: string; image: string }>();
                const matchingAlbumsMap = new Map<string, { title: string; artist: string; cover: string }>();

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
                      });
                    }
                  }
                  if (track.album && (queryLower.length > 2 && track.album.toLowerCase().includes(queryLower))) {
                    if (!matchingAlbumsMap.has(track.album.toLowerCase())) {
                      matchingAlbumsMap.set(track.album.toLowerCase(), {
                        title: track.album,
                        artist: track.artist,
                        cover: track.coverUrl,
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
                            className="w-28 h-28 rounded-xl object-cover shadow-xl mb-4"
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
                              onClick={() => setSearchQuery(artist.name)}
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
                              onClick={() => setSearchQuery(album.title)}
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

              {/* Empty state when no search query */}
              {!isSearching &&
                searchResults.length === 0 &&
                searchTopResult === null &&
                searchArtists.length === 0 &&
                searchAlbums.length === 0 &&
                searchPlaylists.length === 0 && (
                <div>
                  <h2 className="text-xl font-bold text-white mb-4">Browse All Categories</h2>
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
