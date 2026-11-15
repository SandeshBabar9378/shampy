"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { Track, Playlist, UserProfile, SavedPlaylist } from "@/lib/types";
import { CURATED_TRACKS } from "@/lib/musicProvider";
import { getSimilarSongs } from "@/lib/similarity";
import { isValidVideoId } from "@/lib/videoId";

interface YTPlayerInstance {
  loadVideoById: (params: { videoId: string; startSeconds?: number } | string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  setPlaybackRate: (rate: number) => void;
  getPlaybackRate: () => number;
  getAvailablePlaybackRates: () => number[];
  getCurrentTime: () => number;
  getDuration: () => number;
}

export interface SleepTimerOption {
  label: string;
  /** Duration in seconds, or null for "End of song". */
  seconds: number | null;
}

// Temporary test options — switch back to 15/30/45/60 by editing this array.
export const SLEEP_TIMER_OPTIONS: SleepTimerOption[] = [
  { label: "10 sec", seconds: 10 },
  { label: "1 min", seconds: 60 },
  { label: "5 min", seconds: 300 },
  { label: "60 min", seconds: 3600 },
  { label: "End of song", seconds: null },
];

interface PlayerContextType {
  currentTrack: Track | null;
  isPlaying: boolean;
  queue: Track[];
  currentIndex: number;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isShuffle: boolean;
  isRepeat: boolean;
  isResolving: boolean;
  user: UserProfile | null;
  likedSongIds: Set<string>;
  playlists: Playlist[];
  savedPlaylists: SavedPlaylist[];
  mobileExpanded: boolean;
  playbackRate: number;
  availableRates: number[];
  sleepEndsAt: number | null;
  sleepRemainingSeconds: number;
  sleepAtEndOfSong: boolean;
  sleepTimerNotice: string | null;
  setPlaybackRate: (rate: number) => void;
  setMobileExpanded: (v: boolean) => void;
  setAppQueue: (newQueue: Track[]) => void;
  playNext: (track: Track) => void;
  playTrack: (track: Track, newQueue?: Track[]) => Promise<void>;
  togglePlay: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  seek: (seconds: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  selectSleepTimer: (option: SleepTimerOption) => void;
  cancelSleepTimer: () => void;
  toggleLike: (track: Track) => Promise<void>;
  updateUser: (username: string, avatar: string) => Promise<void>;
  refreshLibrary: () => Promise<void>;
  createPlaylist: (name: string, description?: string) => Promise<string | null>;
  addToPlaylist: (playlistId: string, track: Track) => Promise<void>;
  updatePlaylist: (playlistId: string, name: string, description?: string) => Promise<void>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  removeFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  toggleSavedPlaylist: (playlist: SavedPlaylist) => void;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    YT: any;
  }
}

// ─── SSR-safe localStorage helpers ────────────────────────────────────────────
function lsGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, value); } catch {}
}
function lsGetJSON<T>(key: string, fallback: T): T {
  const raw = lsGet(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(1.0);
  const [availableRates, setAvailableRates] = useState<number[]>([0.5, 0.75, 1.0, 1.25, 1.5, 2.0]);

  const [user, setUser] = useState<UserProfile | null>(null);
  const [savedPosition, setSavedPosition] = useState(0);

  // ── Sleep timer (in-memory only; survives page navigation via provider) ──
  const [sleepEndsAt, setSleepEndsAt] = useState<number | null>(null);
  const [sleepRemainingSeconds, setSleepRemainingSeconds] = useState(0);
  const [sleepAtEndOfSong, setSleepAtEndOfSong] = useState(false);
  const [sleepTimerNotice, setSleepTimerNotice] = useState<string | null>(null);

  // Initialise liked songs from localStorage immediately (SSR-safe lazy init)
  const [likedSongIds, setLikedSongIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const ids: string[] = lsGetJSON<string[]>("shubhu_liked_ids", []);
      return new Set(ids);
    } catch { return new Set<string>(); }
  });

  // Initialise playlists from localStorage immediately (SSR-safe lazy init)
  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
    if (typeof window === "undefined") return [];
    return lsGetJSON<Playlist[]>("shubhu_playlists", []);
  });

  // Saved YouTube playlists (keyed by playlist id, stored under "savedPlaylists")
  const [savedPlaylists, setSavedPlaylists] = useState<SavedPlaylist[]>(() => {
    if (typeof window === "undefined") return [];
    const stored = lsGetJSON<SavedPlaylist[]>("savedPlaylists", []);
    return Array.isArray(stored) ? stored : [];
  });

  // YouTube player reference
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const timeUpdateInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sleep timer deadline lives in a ref so the interval can read it without restarting.
  const sleepEndsAtRef = useRef<number | null>(null);
  const sleepAtEndOfSongRef = useRef(false);

  // ── 1. Initialize User & Device ID on mount ──────────────────────────────
  useEffect(() => {
    let deviceId = lsGet("shubhu_device_id");
    if (!deviceId) {
      deviceId = "device_" + Math.random().toString(36).substring(2, 10);
      lsSet("shubhu_device_id", deviceId);
    }

    // Restore user profile from localStorage first (instant)
    const cachedUser = lsGetJSON<UserProfile | null>("shubhu_user", null);
    if (cachedUser) setUser(cachedUser);

    // Restore last played song & position on app reload (paused state)
    try {
      const last = lsGetJSON<{ song: Track; position: number; timestamp: number } | null>(
        "lastPlayedSong",
        null
      );
      if (last?.song) {
        setCurrentTrack(last.song);
        setDuration(last.song.duration || 0);
        setCurrentTime(last.position || 0);
        setSavedPosition(last.position || 0);
        setIsPlaying(false);
      }
    } catch {}

    // Then try to sync with the API (best-effort)
    fetch(`/api/user?id=${deviceId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user);
          lsSet("shubhu_user", JSON.stringify(data.user));
        }
      })
      .catch((err) => console.error("Error fetching user:", err));
  }, []);

  // ── 2. Sync liked songs & playlists from API once user is loaded ──────────
  useEffect(() => {
    if (user?.id) {
      refreshLibrary();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const refreshLibrary = async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/library?userId=${user.id}`);
      const data = await res.json();
      if (data.likedSongs) {
        const ids = (data.likedSongs as Track[]).map((s) => s.id);
        setLikedSongIds(new Set(ids));
        lsSet("shubhu_liked_ids", JSON.stringify(ids));
        lsSet("likedSongs", JSON.stringify(data.likedSongs));
        lsSet("shubhu_liked_songs", JSON.stringify(data.likedSongs));
      }
      if (data.playlists) {
        setPlaylists(data.playlists as Playlist[]);
        lsSet("shubhu_playlists", JSON.stringify(data.playlists));
        lsSet("playlists", JSON.stringify(data.playlists));
      }
    } catch (err) {
      console.error("Error refreshing library (API):", err);
    }
  };

  // ── 3. Load YouTube IFrame API ─────────────────────────────────────────────
  const isRepeatRef = useRef(isRepeat);
  const isShuffleRef = useRef(isShuffle);
  const queueRef = useRef(queue);
  const currentTrackRef = useRef(currentTrack);

  useEffect(() => {
    isRepeatRef.current = isRepeat;
  }, [isRepeat]);

  useEffect(() => {
    isShuffleRef.current = isShuffle;
  }, [isShuffle]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  // Helper to find similar tracks from /api/next and local scoring
  const fetchSimilarTracks = async (track: Track): Promise<Track[]> => {
    const existingIds = new Set(queueRef.current.map((t) => t.id));
    existingIds.add(track.id);

    let nextTracks: Track[] = [];

    // Call /api/next using track's valid videoId
    const targetVideoId = isValidVideoId(track.youtubeId)
      ? track.youtubeId
      : isValidVideoId(track.id)
      ? track.id
      : null;

    if (targetVideoId) {
      try {
        const res = await fetch(`/api/next?videoId=${encodeURIComponent(targetVideoId)}`);
        if (res.ok) {
          const apiNext = await res.json();
          if (Array.isArray(apiNext) && apiNext.length > 0) {
            nextTracks = apiNext
              .filter((item: { videoId?: string }) => isValidVideoId(item.videoId) && item.videoId !== targetVideoId)
              .map((item: { videoId: string; title: string; artist: string; album?: string; thumbnail?: string; duration?: number }) => ({
                id: item.videoId,
                title: item.title,
                artist: item.artist,
                album: item.album || "",
                coverUrl: item.thumbnail || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300",
                duration: item.duration || 180,
                youtubeId: item.videoId,
                audioUrl: "",
              }));
          }
        }
      } catch (err) {
        console.error("Error fetching /api/next:", err);
      }
    }

    // Filter out already queued tracks
    let similar = nextTracks.filter((t) => !existingIds.has(t.id));

    // Fallback to similarity engine if /api/next has fewer than 5 tracks
    if (similar.length < 5) {
      const fallbackScored = getSimilarSongs(track, CURATED_TRACKS).filter(
        (t) => !existingIds.has(t.id) && !similar.some((s) => s.id === t.id)
      );
      similar = [...similar, ...fallbackScored];
    }

    // Last resort fallback
    if (similar.length === 0) {
      similar = CURATED_TRACKS.filter((t) => t.id !== track.id);
    }

    return similar;
  };

  const handleSongEnd = async () => {
    // Sleep timer: "End of song" pauses here and never advances the queue.
    if (sleepAtEndOfSongRef.current) {
      sleepAtEndOfSongRef.current = false;
      setSleepAtEndOfSong(false);
      try {
        ytPlayerRef.current?.pauseVideo();
      } catch { /* player not ready */ }
      setIsPlaying(false);
      setSleepTimerNotice("Sleep timer ended");
      return;
    }

    if (isRepeatRef.current) {
      if (ytPlayerRef.current?.seekTo && ytPlayerRef.current?.playVideo) {
        try {
          ytPlayerRef.current.seekTo(0, true);
          ytPlayerRef.current.playVideo();
          setIsPlaying(true);
        } catch {
          if (currentTrackRef.current) playTrack(currentTrackRef.current);
        }
      } else if (currentTrackRef.current) {
        playTrack(currentTrackRef.current);
      }
      return;
    }

    const currentQueue = queueRef.current;
    if (currentQueue.length === 0) return;

    if (isShuffleRef.current) {
      const randomIndex = Math.floor(Math.random() * currentQueue.length);
      setCurrentIndex(randomIndex);
      playTrack(currentQueue[randomIndex]);
      return;
    }

    const currentSong = currentTrackRef.current;
    const currentIdx = currentQueue.findIndex((s) => s.id === currentSong?.id);
    const nextSong = currentQueue[currentIdx + 1];

    if (nextSong) {
      setCurrentIndex(currentIdx + 1);
      playTrack(nextSong);
    } else if (currentSong) {
      // Reached the end of queue -> auto-fetch similar songs and continue endlessly!
      const similar = await fetchSimilarTracks(currentSong);
      if (similar.length > 0) {
        const extendedQueue = [...currentQueue, ...similar];
        setQueue(extendedQueue);
        setCurrentIndex(currentQueue.length);
        playTrack(similar[0]);
      } else {
        // Reshuffle current queue as infinite fallback
        const reshuffled = [...currentQueue].sort(() => Math.random() - 0.5);
        setQueue(reshuffled);
        setCurrentIndex(0);
        playTrack(reshuffled[0]);
      }
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const initPlayer = () => {
      if (!window.YT || !window.YT.Player) return;
      if (ytPlayerRef.current) return;

      try {
        ytPlayerRef.current = new window.YT.Player("yt-audio-player-host", {
          height: "100",
          width: "100",
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            playsinline: 1,
            origin: typeof window !== "undefined" ? window.location.origin : "",
          },
          events: {
            onReady: () => {
              try {
                if (ytPlayerRef.current) {
                  ytPlayerRef.current.setVolume(volume * 100);
                  const rates = ytPlayerRef.current.getAvailablePlaybackRates();
                  if (Array.isArray(rates) && rates.length > 0) {
                    setAvailableRates(rates);
                  }
                }
              } catch {}
            },
            onStateChange: (event: { data: number }) => {
              // YT.PlayerState: -1 = unstarted, 0 = ended, 1 = playing, 2 = paused, 3 = buffering, 5 = cued
              if (event.data === 1) {
                setIsPlaying(true);
              } else if (event.data === 2) {
                setIsPlaying(false);
              } else if (event.data === 0) {
                setIsPlaying(false);
                handleSongEnd();
              }
            },
          },
        });
      } catch (e) {
        console.error("Error creating YT Player:", e);
      }
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        const first = document.getElementsByTagName("script")[0];
        first.parentNode?.insertBefore(tag, first);
      }
    }

    return () => {
      if (timeUpdateInterval.current) {
        clearInterval(timeUpdateInterval.current);
        timeUpdateInterval.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 4. Time tracker (poll getCurrentTime() every 250ms only while playing) ──
  useEffect(() => {
    if (isPlaying) {
      timeUpdateInterval.current = setInterval(() => {
        if (ytPlayerRef.current?.getCurrentTime) {
          try {
            const time = ytPlayerRef.current.getCurrentTime() || 0;
            const dur = ytPlayerRef.current.getDuration() || currentTrackRef.current?.duration || 0;
            setCurrentTime(time);
            setDuration(dur);

            // Persist position every 5s while playing
            if (currentTrackRef.current && typeof window !== "undefined") {
              lsSet(
                "lastPlayedSong",
                JSON.stringify({
                  song: currentTrackRef.current,
                  position: time,
                  timestamp: Date.now(),
                })
              );
            }
          } catch { /* player state transition */ }
        }
      }, 250);
    } else {
      if (timeUpdateInterval.current) {
        clearInterval(timeUpdateInterval.current);
        timeUpdateInterval.current = null;
      }
    }
    return () => {
      if (timeUpdateInterval.current) {
        clearInterval(timeUpdateInterval.current);
        timeUpdateInterval.current = null;
      }
    };
  }, [isPlaying]);

  // ── Sleep timer: single 1-second interval, deadline read from ref ──────────
  const sleepTimerActive = sleepEndsAt !== null;

  useEffect(() => {
    if (!sleepTimerActive) return;

    const tick = () => {
      const deadline = sleepEndsAtRef.current;
      if (deadline === null) return;
      const remainingMs = deadline - Date.now();

      if (remainingMs <= 0) {
        sleepEndsAtRef.current = null;
        setSleepEndsAt(null);
        setSleepRemainingSeconds(0);
        try {
          ytPlayerRef.current?.pauseVideo();
        } catch { /* player not ready */ }
        setIsPlaying(false);
        setSleepTimerNotice("Sleep timer ended");
        return;
      }

      setSleepRemainingSeconds(Math.ceil(remainingMs / 1000));
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [sleepTimerActive]);

  // Auto-hide the "Sleep timer ended" notice after a few seconds.
  useEffect(() => {
    if (!sleepTimerNotice) return;
    const timeout = setTimeout(() => setSleepTimerNotice(null), 4000);
    return () => clearTimeout(timeout);
  }, [sleepTimerNotice]);

  const selectSleepTimer = (option: SleepTimerOption) => {
    setSleepTimerNotice(null);

    if (option.seconds === null) {
      // End of song is mutually exclusive with the timed countdown.
      sleepEndsAtRef.current = null;
      setSleepEndsAt(null);
      setSleepRemainingSeconds(0);
      sleepAtEndOfSongRef.current = true;
      setSleepAtEndOfSong(true);
      return;
    }

    const now = Date.now();
    const current = sleepEndsAtRef.current;
    const base = current !== null && current > now ? current : now;
    const next = base + option.seconds * 1000;

    sleepEndsAtRef.current = next;
    setSleepEndsAt(next);
    setSleepRemainingSeconds(Math.ceil((next - now) / 1000));
    sleepAtEndOfSongRef.current = false;
    setSleepAtEndOfSong(false);
  };

  const cancelSleepTimer = () => {
    sleepEndsAtRef.current = null;
    sleepAtEndOfSongRef.current = false;
    setSleepEndsAt(null);
    setSleepAtEndOfSong(false);
    setSleepRemainingSeconds(0);
    setSleepTimerNotice(null);
  };

  // ── Playback actions ───────────────────────────────────────────────────────
  const playTrack = async (track: Track, newQueue?: Track[]) => {
    // Determine and validate videoId
    let candidateId = track.youtubeId || (isValidVideoId(track.id) ? track.id : undefined);

    if (!isValidVideoId(candidateId)) {
      console.warn(`[Player] Invalid or missing videoId for song "${track.title}" (id: ${track.id}, youtubeId: ${track.youtubeId}).`);
      return;
    }

    setCurrentTrack(track);
    setCurrentTime(0);
    setDuration(track.duration || 0);

    const activeQueue = newQueue ? [...newQueue] : queueRef.current;
    if (newQueue) {
      const idx = newQueue.findIndex((t) => t.id === track.id);
      setCurrentIndex(idx !== -1 ? idx : 0);
      setQueue(activeQueue);
    }

    // Automatically build Smart Queue: append similar tracks to end of active queue
    fetchSimilarTracks(track).then((similar) => {
      if (similar.length > 0) {
        setQueue((prevQueue) => {
          const currentIds = new Set(prevQueue.map((t) => t.id));
          const toAdd = similar.filter((s) => !currentIds.has(s.id));
          if (toAdd.length === 0) return prevQueue;
          return [...prevQueue, ...toAdd];
        });
      }
    });

    setIsResolving(true);
    try {
      const player = ytPlayerRef.current;
      if (player?.loadVideoById) {
        player.loadVideoById({ videoId: candidateId, startSeconds: 0 });
        player.playVideo();
        setIsPlaying(true);
      }

      // Record in history (best-effort)
      if (user?.id) {
        fetch("/api/library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "record_history", userId: user.id, track }),
        }).catch(() => {});
      }

      // Update recentlyPlayed in localStorage (zero login / local storage safe)
      if (typeof window !== "undefined") {
        try {
          const recent: Track[] = JSON.parse(
            localStorage.getItem("recentlyPlayed") || "[]"
          );
          const updated = [track, ...recent.filter((s) => s.id !== track.id)].slice(0, 6);
          localStorage.setItem("recentlyPlayed", JSON.stringify(updated));
          // Let the home page refresh its recommendation seeds in the same tab.
          window.dispatchEvent(new Event("storage"));
        } catch {}
      }
    } catch (err) {
      console.error("Playback error:", err);
    } finally {
      setIsResolving(false);
    }
  };

  const togglePlay = () => {
    if (!currentTrack) return;
    const player = ytPlayerRef.current;
    if (player) {
      if (isPlaying) {
        player.pauseVideo();
        setIsPlaying(false);
      } else {
        if (savedPosition > 0) {
          playTrack(currentTrack).then(() => {
            setTimeout(() => {
              if (player?.seekTo) {
                player.seekTo(savedPosition, true);
                setSavedPosition(0);
              }
            }, 500);
          });
        } else {
          player.playVideo();
          setIsPlaying(true);
        }
      }
    } else if (!isPlaying && currentTrack) {
      playTrack(currentTrack);
    }
  };

  const nextTrack = async () => {
    if (queue.length === 0) return;
    let nextIdx = isShuffle
      ? Math.floor(Math.random() * queue.length)
      : currentIndex + 1;

    if (!isShuffle && nextIdx >= queue.length) {
      if (isRepeat) {
        nextIdx = 0;
      } else {
        // Queue exhausted -> auto-fetch similar tracks and keep playing!
        const currentSong = currentTrackRef.current;
        if (currentSong) {
          const similar = await fetchSimilarTracks(currentSong);
          if (similar.length > 0) {
            const extendedQueue = [...queueRef.current, ...similar];
            setQueue(extendedQueue);
            setCurrentIndex(queueRef.current.length);
            playTrack(similar[0]);
            return;
          }
        }
        nextIdx = 0; // loop back if completely exhausted
      }
    }
    setCurrentIndex(nextIdx);
    playTrack(queue[nextIdx]);
  };

  const prevTrack = () => {
    if (queue.length === 0) return;
    const prevIdx = currentIndex - 1 < 0 ? queue.length - 1 : currentIndex - 1;
    setCurrentIndex(prevIdx);
    playTrack(queue[prevIdx]);
  };

  const seek = (seconds: number) => {
    const player = ytPlayerRef.current;
    if (player?.seekTo) {
      player.seekTo(seconds, true);
      setCurrentTime(seconds);
    }
  };

  const setVolume = (vol: number) => {
    setVolumeState(vol);
    setIsMuted(vol === 0);
    const player = ytPlayerRef.current;
    if (player?.setVolume) {
      player.setVolume(vol * 100);
    }
  };

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      setVolume(0.8);
    } else {
      setIsMuted(true);
      setVolume(0);
    }
  };

  const setPlaybackRate = (rate: number) => {
    const player = ytPlayerRef.current;
    if (player?.setPlaybackRate) {
      const allowedRates = player.getAvailablePlaybackRates() || availableRates;
      if (allowedRates.includes(rate)) {
        player.setPlaybackRate(rate);
        setPlaybackRateState(rate);
      } else {
        console.warn(`[Player] Requested playback rate ${rate} not in available rates:`, allowedRates);
      }
    }
  };

  const toggleShuffle = () => setIsShuffle((v) => !v);
  const toggleRepeat = () => setIsRepeat((v) => !v);

  // ── Like / Unlike ──────────────────────────────────────────────────────────
  const toggleLike = async (track: Track) => {
    const isLiked = likedSongIds.has(track.id);
    const newLikes = new Set(likedSongIds);
    if (isLiked) newLikes.delete(track.id); else newLikes.add(track.id);

    // Optimistic UI
    setLikedSongIds(newLikes);
    lsSet("shubhu_liked_ids", JSON.stringify([...newLikes]));

    // Sync full liked songs array to localStorage
    if (typeof window !== "undefined") {
      try {
        const stored: Track[] = JSON.parse(
          localStorage.getItem("likedSongs") || localStorage.getItem("shubhu_liked_songs") || "[]"
        );
        let updated: Track[];
        if (isLiked) {
          updated = stored.filter((s) => s.id !== track.id);
        } else {
          updated = [track, ...stored.filter((s) => s.id !== track.id)];
        }
        localStorage.setItem("likedSongs", JSON.stringify(updated));
        localStorage.setItem("shubhu_liked_songs", JSON.stringify(updated));
        window.dispatchEvent(new Event("storage"));
      } catch {}
    }

    // Sync to API (best-effort)
    if (user?.id) {
      try {
        await fetch("/api/library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: isLiked ? "unlike" : "like",
            userId: user.id,
            track,
          }),
        });
        refreshLibrary();
      } catch (e) {
        console.error("Like toggle API failed (kept localStorage):", e);
      }
    }
  };

  // ── Update profile ─────────────────────────────────────────────────────────
  const updateUser = async (username: string, avatar: string) => {
    if (!user?.id) return;
    const updated: UserProfile = { id: user.id, username, avatar };
    setUser(updated);
    lsSet("shubhu_user", JSON.stringify(updated));
    try {
      await fetch("/api/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
    } catch {}
  };

  // ── Create playlist ────────────────────────────────────────────────────────
  const createPlaylist = async (name: string, description?: string): Promise<string | null> => {
    const id = "pl_" + Math.random().toString(36).substring(2, 10);
    const newPl: Playlist = { id, name, description, tracks: [], userId: user?.id ?? "" };

    const updated = [...playlists, newPl];
    setPlaylists(updated);
    lsSet("shubhu_playlists", JSON.stringify(updated));
    lsSet("playlists", JSON.stringify(updated));

    if (user?.id) {
      try {
        const res = await fetch("/api/library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create_playlist",
            userId: user.id,
            playlistName: name,
            playlistDescription: description,
          }),
        });
        const data = await res.json();
        refreshLibrary();
        return data.id || id;
      } catch (e) {
        console.error("Create playlist API failed (kept localStorage):", e);
      }
    }
    return id;
  };

  // ── Add track to playlist ──────────────────────────────────────────────────
  const addToPlaylist = async (playlistId: string, track: Track) => {
    const updated = playlists.map((pl) => {
      if (pl.id !== playlistId) return pl;
      const exists = pl.tracks?.some((t) => t.id === track.id);
      if (exists) return pl;
      return { ...pl, tracks: [...(pl.tracks ?? []), track] };
    });
    setPlaylists(updated);
    lsSet("shubhu_playlists", JSON.stringify(updated));
    lsSet("playlists", JSON.stringify(updated));

    if (user?.id) {
      try {
        await fetch("/api/library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "add_to_playlist",
            userId: user.id,
            playlistId,
            track,
          }),
        });
        refreshLibrary();
      } catch (e) {
        console.error("Add to playlist API failed (kept localStorage):", e);
      }
    }
  };

  // ── Update playlist details ────────────────────────────────────────────────
  const updatePlaylist = async (
    playlistId: string,
    name: string,
    description?: string,
  ) => {
    const updated = playlists.map((pl) =>
      pl.id === playlistId ? { ...pl, name, description } : pl,
    );
    setPlaylists(updated);
    lsSet("shubhu_playlists", JSON.stringify(updated));
    lsSet("playlists", JSON.stringify(updated));

    if (user?.id) {
      try {
        const res = await fetch("/api/library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update_playlist",
            userId: user.id,
            playlistId,
            playlistName: name,
            playlistDescription: description,
          }),
        });
        if (res.ok) refreshLibrary();
      } catch (e) {
        console.error("Update playlist API failed (kept localStorage):", e);
      }
    }
  };

  // ── Delete playlist ────────────────────────────────────────────────────────
  const deletePlaylist = async (playlistId: string) => {
    const updated = playlists.filter((pl) => pl.id !== playlistId);
    setPlaylists(updated);
    lsSet("shubhu_playlists", JSON.stringify(updated));
    lsSet("playlists", JSON.stringify(updated));

    if (user?.id) {
      try {
        const res = await fetch("/api/library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "delete_playlist",
            userId: user.id,
            playlistId,
          }),
        });
        if (res.ok) refreshLibrary();
      } catch (e) {
        console.error("Delete playlist API failed (kept localStorage):", e);
      }
    }
  };

  // ── Remove one track from a playlist ───────────────────────────────────────
  const removeFromPlaylist = async (playlistId: string, trackId: string) => {
    const updated = playlists.map((pl) =>
      pl.id === playlistId
        ? { ...pl, tracks: (pl.tracks ?? []).filter((t) => t.id !== trackId) }
        : pl,
    );
    setPlaylists(updated);
    lsSet("shubhu_playlists", JSON.stringify(updated));
    lsSet("playlists", JSON.stringify(updated));

    if (user?.id) {
      try {
        const res = await fetch("/api/library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "remove_from_playlist",
            userId: user.id,
            playlistId,
            trackId,
          }),
        });
        if (res.ok) refreshLibrary();
      } catch (e) {
        console.error("Remove from playlist API failed (kept localStorage):", e);
      }
    }
  };

  // ── Save / unsave a YouTube playlist (keyed by id, no duplicates) ─────────
  const toggleSavedPlaylist = (playlist: SavedPlaylist) => {
    setSavedPlaylists((prev) => {
      const exists = prev.some((p) => p.id === playlist.id);
      const updated = exists
        ? prev.filter((p) => p.id !== playlist.id)
        : [...prev, {
            id: playlist.id,
            title: playlist.title,
            author: playlist.author,
            thumbnail: playlist.thumbnail,
            trackCount: playlist.trackCount,
          }];
      lsSet("savedPlaylists", JSON.stringify(updated));
      return updated;
    });
  };

  const playNext = (track: Track) => {
    const playing = currentTrackRef.current;
    if (!playing) {
      playTrack(track);
      return;
    }
    if (playing.id === track.id) return;

    const base = queueRef.current.filter((t) => t.id !== track.id);
    const currentIdx = base.findIndex((t) => t.id === playing.id);
    let nextQueue: Track[];
    let nextIndex: number;

    if (currentIdx === -1) {
      // Current track is not in the queue (e.g. a one-off play): keep it first.
      nextQueue = [playing, track, ...base];
      nextIndex = 0;
    } else {
      nextQueue = [...base];
      nextQueue.splice(currentIdx + 1, 0, track);
      nextIndex = currentIdx;
    }

    setQueue(nextQueue);
    setCurrentIndex(nextIndex);
  };

  const setAppQueue = (newQueue: Track[]) => {
    // Only queue songs with valid videoId
    const validTracks = newQueue.filter((t) => {
      const valid = isValidVideoId(t.youtubeId) || isValidVideoId(t.id);
      if (!valid) {
        console.warn(`[Queue] Skipping invalid track "${t.title}" (id: ${t.id}, youtubeId: ${t.youtubeId})`);
      }
      return valid;
    });
    setQueue(validTracks);
  };

  return (
    <PlayerContext.Provider
      value={{
        currentTrack, isPlaying, queue, currentIndex,
        currentTime, duration, volume, isMuted,
        isShuffle, isRepeat, isResolving,
        user, likedSongIds, playlists, savedPlaylists,
        mobileExpanded, playbackRate, availableRates,
        sleepEndsAt, sleepRemainingSeconds, sleepAtEndOfSong, sleepTimerNotice,
        setPlaybackRate, setMobileExpanded, setAppQueue, playNext,
        playTrack, togglePlay, nextTrack, prevTrack,
        seek, setVolume, toggleMute, toggleShuffle, toggleRepeat,
        selectSleepTimer, cancelSleepTimer,
        toggleLike, updateUser, refreshLibrary, createPlaylist, addToPlaylist,
        updatePlaylist, deletePlaylist, removeFromPlaylist, toggleSavedPlaylist,
      }}
    >
      {children}
      {/* Hidden offscreen YouTube host iframe container */}
      <div style={{ position: "fixed", top: -9999, left: -9999, width: 1, height: 1, opacity: 0, pointerEvents: "none" }}>
        <div id="yt-audio-player-host" />
      </div>
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer must be used within PlayerProvider");
  return context;
}
