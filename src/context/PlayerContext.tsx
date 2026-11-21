"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { Track, Playlist, UserProfile, SavedPlaylist, FollowedArtist } from "@/lib/types";
import { CURATED_TRACKS } from "@/lib/musicProvider";
import { getSimilarSongs } from "@/lib/similarity";
import { getDefaultArtworkFallbackUrl } from "@/lib/artwork";
import { isValidVideoId } from "@/lib/videoId";
import {
  getOfflineAudio,
  removeOfflineAudio,
  clearOfflineAudio,
  listOfflineAudio,
} from "@/lib/offlineAudio";
import {
  downloadManager,
  type DownloadBatch,
  type DownloadCompletedRecord,
  type DownloadGroupInfo,
  type DownloadJob,
  type DownloadRecordMeta,
  type EnqueueResult,
} from "@/lib/downloadManager";
import {
  downloadCollections,
  type DownloadCollectionRecord,
} from "@/lib/downloadCollections";
import {
  DOWNLOAD_TEST_PLAYLIST_HIDE_KEY,
  getDownloadTestPlaylist,
  isDownloadTestTrack,
  isDownloadTestTrackId,
  resolveDownloadSource,
} from "@/lib/testDownloadProvider";

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

export type ThemeId = "aurora" | "ocean" | "graphite";

export interface AuthResult {
  ok: boolean;
  error?: string;
}

/** Ordered, device-local collection reference (audio bytes stay in `audio`). */
export type { DownloadCollectionRecord } from "@/lib/downloadCollections";

export interface DownloadBatchResult {
  total: number;
  queued: number;
  alreadyDownloaded: number;
  unavailable: number;
  errors: { trackId: string; error: string }[];
}

export interface OfflineFileInfo {
  size: number;
  savedAt: number;
}

/** One open play, so end/skip/manual-next can be told apart. Never rendered. */
interface PlayContext {
  songId: string;
  instanceId: string;
  startedAt: number;
  lastPosition: number;
  /** Time actually heard (seeks do not count), used to classify a skip. */
  listenedSeconds: number;
  /** Position at the previous tick, so a seek jump is not mistaken for play time. */
  lastTickPosition: number;
  duration: number;
  seeked: boolean;
  track: Track;
}

/** A listening signal on its way to /api/activity. */
interface ActivityEvent {
  kind: "play" | "complete" | "skip" | "like" | "unlike" | "playlist_add";
  songId: string;
  instanceId?: string;
  positionSeconds?: number;
  durationSeconds?: number;
  replay?: boolean;
  negative?: boolean;
  track?: Track;
}

/** Options for the single existing playback entry point. */
interface PlayTrackOptions {
  /** Let Smart Queue append recommendations after playback starts. */
  appendSimilar?: boolean;
  /** The supplied queue is already in the active shuffle order. */
  shuffleOrder?: boolean;
}

/** Fisher–Yates: a genuinely randomized queue, not a comparison sort. */
function randomizedQueue(tracks: Track[]): Track[] {
  const result = [...tracks];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Wraps an <audio> element in the same interface as the YouTube player, so
 *  downloaded songs play through the exact same transport code. */
function createAudioPlayer(audio: HTMLAudioElement): YTPlayerInstance {
  return {
    loadVideoById: () => {},
    playVideo: () => {
      audio.play().catch(() => {});
    },
    pauseVideo: () => audio.pause(),
    seekTo: (seconds) => {
      audio.currentTime = seconds;
    },
    setVolume: (v) => {
      audio.volume = Math.min(1, Math.max(0, v / 100));
    },
    getVolume: () => audio.volume * 100,
    setPlaybackRate: (r) => {
      audio.playbackRate = r;
    },
    getPlaybackRate: () => audio.playbackRate,
    getAvailablePlaybackRates: () => [0.5, 0.75, 1, 1.25, 1.5, 2],
    getCurrentTime: () => audio.currentTime,
    getDuration: () => (Number.isFinite(audio.duration) ? audio.duration : 0),
  };
}

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
  followedArtists: FollowedArtist[];
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
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
  playTrack: (track: Track, newQueue?: Track[], options?: PlayTrackOptions) => Promise<void>;
  /** Starts a playlist from a random track with its queue shuffled in place. */
  playShuffledQueue: (tracks: Track[]) => Promise<void>;
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
  toggleFollowArtist: (artist: FollowedArtist) => void;
  /** Songs in the account's synced Downloads list (on any device). */
  downloads: Track[];
  /** Track ids whose audio is stored on THIS device and plays offline. */
  offlineIds: Set<string>;
  /** 0..1 while a download is in progress, keyed by track id. */
  downloadProgress: Record<string, number>;
  /** Live central-manager jobs (queued/downloading/failed/…). */
  downloadJobs: DownloadJob[];
  /** Metadata for audio actually stored on this device. */
  downloadRecords: DownloadRecordMeta[];
  /** One card per downloaded playlist/album plus Downloaded Songs. */
  downloadCollections: DownloadCollectionRecord[];
  /** Outcomes of individual download requests (including partial batches). */
  downloadBatches: DownloadBatch[];
  downloadOnline: boolean;
  /** User-visible playback failure (e.g. a missing/corrupt local file). */
  playbackError: string | null;
  clearPlaybackError: () => void;
  /** Dedicated temporary test playlist (never part of the synced library). */
  downloadTestPlaylist: Playlist;
  downloadTestPlaylistVisible: boolean;
  hideDownloadTestPlaylist: () => void;
  downloadTrack: (track: Track, group?: DownloadGroupInfo) => Promise<AuthResult>;
  downloadTracks: (tracks: Track[], group?: DownloadGroupInfo) => Promise<EnqueueResult>;
  retryDownload: (id: string) => boolean;
  cancelDownload: (id: string) => boolean;
  clearFinishedDownloads: () => void;
  /** Removes the song from one collection only; stored audio is kept. */
  removeTrackFromDownloadCollection: (collectionId: string, trackId: string) => Promise<void>;
  /** Explicit permanent-delete action (removes the stored audio Blob). */
  deleteDownloadedAudio: (track: Track) => Promise<void>;
  removeDownload: (track: Track) => Promise<void>;
  signIn: (email: string, pin: string) => Promise<AuthResult>;
  signUp: (email: string, pin: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
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
/** Writes only when the value differs; returns whether it changed. */
function lsSetIfChanged(key: string, value: string): boolean {
  if (lsGet(key) === value) return false;
  lsSet(key, value);
  return true;
}

// Everything cached from the signed-in library. "[]" rather than removal so
// the home page's storage listener (which ignores missing keys) also clears.
const LIBRARY_CACHE_KEYS = [
  "shubhu_liked_ids",
  "likedSongs",
  "shubhu_liked_songs",
  "shubhu_playlists",
  "playlists",
  "savedPlaylists",
  "shubhu_followed_artists",
  "recentlyPlayed",
  "shubhu_downloads",
];
function clearLibraryCaches() {
  LIBRARY_CACHE_KEYS.forEach((key) => lsSet(key, "[]"));
  if (typeof window !== "undefined") window.dispatchEvent(new Event("storage"));
}

const REFRESH_MIN_GAP_MS = 4000;
const REFRESH_INTERVAL_MS = 45_000;
const RECENT_KEEP = 6;
// Don't prune a just-saved local download before the server list has caught up.
const DOWNLOAD_PRUNE_GRACE_MS = 2 * 60_000;

const DOWNLOAD_TEST_PLAYLIST = getDownloadTestPlaylist();

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  // Start on Aurora Glow so SSR and the first client render match. The
  // pre-paint script in layout.tsx has already put the stored theme on <html>;
  // this effect only re-syncs React state and re-applies it (no flash).
  const [theme, setThemeValue] = useState<ThemeId>("aurora");
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    const stored = lsGet("shubhu_theme");
    setThemeValue(stored === "ocean" || stored === "graphite" ? stored : "aurora");
    setThemeReady(true);
  }, []);

  useEffect(() => {
    if (!themeReady) return;
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme, themeReady]);

  const setTheme = (next: ThemeId) => {
    setThemeValue(next);
    lsSet("shubhu_theme", next);
    // Apply immediately; the effect below keeps React state and <html> in sync.
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", next);
    }
  };

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

  // Followed artists (local-only, same storage approach as playlists/likes)
  const [followedArtists, setFollowedArtists] = useState<FollowedArtist[]>(() => {
    if (typeof window === "undefined") return [];
    const stored = lsGetJSON<FollowedArtist[]>("shubhu_followed_artists", []);
    return Array.isArray(stored) ? stored : [];
  });

  // Synced Downloads list (any device) and which of those are on this device.
  const [downloads, setDownloads] = useState<Track[]>(() => {
    if (typeof window === "undefined") return [];
    const stored = lsGetJSON<Track[]>("shubhu_downloads", []);
    return Array.isArray(stored) ? stored : [];
  });
  const [offlineIds, setOfflineIds] = useState<Set<string>>(new Set());
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [downloadJobs, setDownloadJobs] = useState<DownloadJob[]>(
    () => downloadManager.getSnapshot().jobs,
  );
  const [downloadRecords, setDownloadRecords] = useState<DownloadRecordMeta[]>(
    () => downloadManager.getSnapshot().records,
  );
  const [downloadCollectionsState, setDownloadCollectionsState] = useState<DownloadCollectionRecord[]>(
    () => downloadCollections.getSnapshot(),
  );
  const [downloadBatches, setDownloadBatches] = useState<DownloadBatch[]>(
    () => downloadManager.getSnapshot().batches,
  );
  const [downloadOnline, setDownloadOnline] = useState<boolean>(
    () => downloadManager.getSnapshot().online,
  );
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [downloadTestPlaylistVisible, setDownloadTestPlaylistVisible] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return lsGet(DOWNLOAD_TEST_PLAYLIST_HIDE_KEY) !== "1";
  });
  const offlineIdsRef = useRef<Set<string>>(new Set());
  const downloadsRef = useRef<Track[]>(downloads);

  // Library sync bookkeeping.
  const refreshSeqRef = useRef(0);         // newest request wins; stale responses are dropped
  const lastRefreshAtRef = useRef(0);
  const pendingWritesRef = useRef(0);      // in-flight local changes the server hasn't seen yet
  const userIdRef = useRef<string | null>(null);

  // ── Recommendation signals ────────────────────────────────────────────────
  // Handlers below record what happened; nothing here renders, and playback /
  // queue state stays exactly as it is above. Sends are best-effort.
  const playCtxRef = useRef<PlayContext | null>(null);
  const closePlayRef = useRef<(kind: "complete" | "skip", negative?: boolean) => void>(() => {});
  const sessionIdRef = useRef<string>("");
  const sessionPlayedRef = useRef<Set<string>>(new Set());
  const activityBufferRef = useRef<ActivityEvent[]>([]);
  const activityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // YouTube player reference. `ytPlayerRef` is the ACTIVE engine: either the
  // real YouTube player or the <audio> adapter used for downloaded songs.
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const ytRealRef = useRef<YTPlayerInstance | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioPlayerRef = useRef<YTPlayerInstance | null>(null);
  const audioObjectUrlRef = useRef<string | null>(null);
  const handleSongEndRef = useRef<() => void>(() => {});
  const timeUpdateInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sleep timer deadline lives in a ref so the interval can read it without restarting.
  const sleepEndsAtRef = useRef<number | null>(null);
  const sleepAtEndOfSongRef = useRef(false);

  const resetLibraryState = () => {
    refreshSeqRef.current++; // drop any response still in flight
    clearLibraryCaches();
    setLikedSongIds(new Set());
    setPlaylists([]);
    setSavedPlaylists([]);
    setFollowedArtists([]);
    setDownloads([]);
  };

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

    // Which downloaded songs are stored on this device.
    listOfflineAudio()
      .then((rows) => {
        const ids = new Set(rows.map((r) => r.id));
        offlineIdsRef.current = ids;
        setOfflineIds(ids);
      })
      .catch(() => {});

    // Then ask the server who we are: the signed-in account if the session
    // cookie is valid, otherwise this device's guest profile (best-effort).
    fetch(`/api/user?id=${deviceId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.user) return;
        // Signed in before, but the session is gone (expired or revoked): the
        // cached library belongs to that account, so don't show it to a guest.
        if (cachedUser?.email && !data.user.email) resetLibraryState();
        setUser(data.user);
        lsSet("shubhu_user", JSON.stringify(data.user));
      })
      .catch((err) => console.error("Error fetching user:", err));
  }, []);

  // ── 2. Library sync ────────────────────────────────────────────────────────
  // The server is the source of truth. We pull on login, when the tab regains
  // focus, when the network returns, and every 45 s while visible, so changes
  // made on another device show up here.

  /** POST to /api/library as the current identity; tracks in-flight writes. */
  const postLibrary = async (body: Record<string, unknown>): Promise<boolean> => {
    pendingWritesRef.current++;
    try {
      const res = await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userIdRef.current, ...body }),
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      pendingWritesRef.current--;
    }
  };

  const postLibraryRef = useRef(postLibrary);
  useEffect(() => {
    postLibraryRef.current = postLibrary;
  });
  useEffect(() => {
    downloadsRef.current = downloads;
  }, [downloads]);

  // Mirror the singleton download manager into React state. All progress comes
  // from real streamed bytes; this subscription never writes fake progress.
  useEffect(() => {
    const unsubscribe = downloadManager.subscribe(() => {
      const snapshot = downloadManager.getSnapshot();
      setDownloadJobs(snapshot.jobs);
      setDownloadRecords(snapshot.records);
      setDownloadBatches(snapshot.batches);
      setDownloadOnline(snapshot.online);
      const progress: Record<string, number> = {};
      for (const job of snapshot.jobs) {
        if (job.status === "downloading" && job.total > 0) {
          progress[job.id] = Math.min(1, job.loaded / job.total);
        }
      }
      setDownloadProgress(progress);
    });
    void downloadManager.hydrate();
    return unsubscribe;
  }, []);

  // Mirror the collection registry. It only stores ordered references, never
  // audio bytes, and is hydrated from existing records for backward compatibility.
  useEffect(() => {
    let cancelled = false;
    const unsubscribe = downloadCollections.subscribe(() => {
      setDownloadCollectionsState(downloadCollections.getSnapshot());
    });
    void (async () => {
      await downloadManager.hydrate();
      if (!cancelled) {
        await downloadCollections.hydrate(downloadManager.getSnapshot().records);
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Completion/removal persistence. The manager owns the Blob; this context
  // owns the account's Downloads list and the local id set used by playback.
  useEffect(() => {
    const handleCompleted = async (record: DownloadCompletedRecord) => {
      const existing = downloadsRef.current.find((track) => track.id === record.id);
      const track: Track = existing
        ? {
            ...existing,
            youtubeId: existing.youtubeId ?? record.youtubeId,
            coverUrl: existing.coverUrl || record.coverUrl || getDefaultArtworkFallbackUrl(),
          }
        : {
            id: record.id,
            title: record.title ?? record.id,
            artist: record.artist ?? "Unknown artist",
            album: record.album ?? "Downloads",
            coverUrl: record.coverUrl ?? getDefaultArtworkFallbackUrl(),
            duration: record.duration ?? 0,
            youtubeId: record.youtubeId,
          };
      offlineIdsRef.current = new Set(offlineIdsRef.current).add(track.id);
      setOfflineIds(new Set(offlineIdsRef.current));
      // Collection membership is a reference only; the Blob stays in audioStorage.
      void downloadCollections.addCompleted(record);

      // Temporary test fixtures stay on this device only. They must never
      // enter the account's synced Downloads library.
      if (isDownloadTestTrackId(record.id)) return;

      const next = [track, ...downloadsRef.current.filter((item) => item.id !== track.id)];
      downloadsRef.current = next;
      setDownloads(next);
      lsSet("shubhu_downloads", JSON.stringify(next));
      if (!(await postLibraryRef.current({ action: "add_download", track }))) {
        const pending = lsGetJSON<Track[]>("shubhu_download_pending", []);
        lsSet("shubhu_download_pending", JSON.stringify([track, ...pending.filter((t) => t.id !== track.id)]));
      }
    };

    const handleRemoved = async (id: string) => {
      const track = downloadsRef.current.find((item) => item.id === id);
      offlineIdsRef.current = new Set([...offlineIdsRef.current].filter((item) => item !== id));
      setOfflineIds(new Set(offlineIdsRef.current));
      void downloadCollections.purgeTrack(id);

      // Stop a removed file immediately; the persisted blob is already deleted
      // by the manager. Queue/index/currentTrack are left untouched.
      const audio = audioElRef.current;
      if (currentTrackRef.current?.id === id && audio) {
        ytPlayerRef.current?.pauseVideo();
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        if (audioObjectUrlRef.current) {
          URL.revokeObjectURL(audioObjectUrlRef.current);
          audioObjectUrlRef.current = null;
        }
        if (ytRealRef.current) ytPlayerRef.current = ytRealRef.current;
        setIsPlaying(false);
      }

      if (isDownloadTestTrackId(id)) return;
      const next = downloadsRef.current.filter((item) => item.id !== id);
      downloadsRef.current = next;
      setDownloads(next);
      lsSet("shubhu_downloads", JSON.stringify(next));
      const pending = lsGetJSON<Track[]>("shubhu_download_pending", []);
      lsSet("shubhu_download_pending", JSON.stringify(pending.filter((item) => item.id !== id)));
      if (track) await postLibraryRef.current({ action: "remove_download", trackId: id });
    };

    const offCompleted = downloadManager.onCompleted(handleCompleted);
    const offRemoved = downloadManager.onRemoved(handleRemoved);
    return () => {
      offCompleted();
      offRemoved();
    };
  }, []);

  /** Sends buffered listening signals. Never throws, never blocks playback. */
  const flushActivity = () => {
    if (activityTimerRef.current) {
      clearTimeout(activityTimerRef.current);
      activityTimerRef.current = null;
    }
    const events = activityBufferRef.current;
    if (events.length === 0) return;
    activityBufferRef.current = [];
    const userId = userIdRef.current;
    if (!userId) return;
    fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, sessionId: sessionIdRef.current, events }),
      keepalive: true,
    }).catch(() => {});
  };

  const queueActivity = (event: ActivityEvent) => {
    if (!userIdRef.current) return;
    activityBufferRef.current.push(event);
    if (activityBufferRef.current.length >= 20) {
      flushActivity();
      return;
    }
    if (activityTimerRef.current) return;
    activityTimerRef.current = setTimeout(flushActivity, 1500);
  };

  /** Opens a play instance. Resuming the same song keeps the open instance. */
  const startPlayContext = (track: Track) => {
    const open = playCtxRef.current;
    if (open && open.songId === track.id) return;
    if (open) closePlay("skip");

    const instanceId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const replay = sessionPlayedRef.current.has(track.id);
    sessionPlayedRef.current.add(track.id);
    playCtxRef.current = {
      songId: track.id,
      instanceId,
      startedAt: Date.now(),
      lastPosition: 0,
      listenedSeconds: 0,
      lastTickPosition: 0,
      duration: track.duration || 0,
      seeked: false,
      track,
    };
    queueActivity({
      kind: "play",
      songId: track.id,
      instanceId,
      positionSeconds: 0,
      durationSeconds: track.duration || 0,
      replay,
      track,
    });
  };

  /** Closes the open play exactly once; a completed or skipped play. */
  const closePlay = (kind: "complete" | "skip", negative = false) => {
    const ctx = playCtxRef.current;
    if (!ctx) return;
    playCtxRef.current = null;
    // A skip is classified by how much was genuinely heard, so seeking to the
    // end does not turn an early bail-out into a "late" (positive) skip.
    const heard =
      kind === "skip"
        ? Math.max(0, Math.min(ctx.duration || Number.POSITIVE_INFINITY, ctx.listenedSeconds))
        : ctx.lastPosition;
    queueActivity({
      kind,
      songId: ctx.songId,
      instanceId: ctx.instanceId,
      positionSeconds: Math.round(heard),
      durationSeconds: ctx.duration || ctx.track.duration || 0,
      negative,
      track: ctx.track,
    });
  };

  // Per-tab session id, used to dedupe instances and to keep Home stable.
  useEffect(() => {
    closePlayRef.current = closePlay;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    let sessionId: string | null = null;
    try {
      sessionId = sessionStorage.getItem("shubhu_session_id");
    } catch {
      sessionId = null;
    }
    if (!sessionId) {
      sessionId = `s_${Math.random().toString(36).slice(2, 10)}`;
      try {
        sessionStorage.setItem("shubhu_session_id", sessionId);
      } catch {}
    }
    sessionIdRef.current = sessionId;

    const flush = () => flushActivity();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    // Leaving the page ends the open play: record what was heard instead of
    // dropping the signal, then flush in one keepalive request.
    const onPageHide = () => {
      if (playCtxRef.current) closePlayRef.current("skip");
      flush();
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, []);

  // Keep the identity ref in step with the resolved user (guests included).
  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);

  /** Uploads data that only ever lived in this browser, once per identity. */
  const importLocalOnce = async (userId: string): Promise<boolean> => {
    if (lsGet("shubhu_imported_for") === userId) return true;
    const payload = {
      savedPlaylists: lsGetJSON<SavedPlaylist[]>("savedPlaylists", []),
      followedArtists: lsGetJSON<FollowedArtist[]>("shubhu_followed_artists", []),
      recentlyPlayed: lsGetJSON<Track[]>("recentlyPlayed", []),
    };
    const hasData = Object.values(payload).some((v) => Array.isArray(v) && v.length > 0);
    if (hasData && !(await postLibrary({ action: "import_local", ...payload }))) return false;
    lsSet("shubhu_imported_for", userId);
    return true;
  };

  /** Re-sends downloads whose server write failed (e.g. while offline). */
  const flushPendingDownloads = async () => {
    const pending = lsGetJSON<Track[]>("shubhu_download_pending", []);
    if (!Array.isArray(pending) || pending.length === 0) return;
    const stillPending: Track[] = [];
    for (const track of pending) {
      if (!(await postLibrary({ action: "add_download", track }))) stillPending.push(track);
    }
    lsSet("shubhu_download_pending", JSON.stringify(stillPending));
  };

  const pullLibrary = async (force: boolean) => {
    const userId = user?.id;
    if (!userId) return;
    if (!force) {
      if (pendingWritesRef.current > 0) return;
      if (Date.now() - lastRefreshAtRef.current < REFRESH_MIN_GAP_MS) return;
    }
    lastRefreshAtRef.current = Date.now();
    userIdRef.current = userId;

    try {
      // Never overwrite local-only data with the server's copy before it has
      // been uploaded; if the upload fails, keep the local copy and retry later.
      if (!(await importLocalOnce(userId))) return;
      await flushPendingDownloads();

      const seq = ++refreshSeqRef.current;
      const res = await fetch(`/api/library?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      // Superseded by a newer request, a sign-out/in, or a local change that
      // happened while we were waiting: skip, the next pull will converge.
      if (seq !== refreshSeqRef.current || userIdRef.current !== userId) return;
      if (!force && pendingWritesRef.current > 0) return;

      applyLibrary(data);
    } catch (err) {
      console.error("Error refreshing library (API):", err);
    }
  };

  const applyLibrary = (data: {
    likedSongs?: Track[];
    playlists?: Playlist[];
    recentlyPlayed?: Track[];
    savedPlaylists?: SavedPlaylist[];
    followedArtists?: FollowedArtist[];
    downloads?: Track[];
  }) => {
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    let notifyHome = false;

    if (data.likedSongs) {
      const ids = data.likedSongs.map((s) => s.id);
      setLikedSongIds((prev) =>
        prev.size === ids.length && ids.every((id) => prev.has(id)) ? prev : new Set(ids),
      );
      lsSetIfChanged("shubhu_liked_ids", JSON.stringify(ids));
      const json = JSON.stringify(data.likedSongs);
      if (lsSetIfChanged("likedSongs", json)) notifyHome = true;
      lsSetIfChanged("shubhu_liked_songs", json);
    }

    if (data.playlists) {
      const next = data.playlists;
      setPlaylists((prev) => (same(prev, next) ? prev : next));
      const json = JSON.stringify(next);
      lsSetIfChanged("shubhu_playlists", json);
      lsSetIfChanged("playlists", json);
    }

    if (data.recentlyPlayed && pendingWritesRef.current === 0) {
      // Recently played drives the home page's recommendations; it listens for
      // "storage" events, so only fire one when it actually changed.
      const recents = data.recentlyPlayed.slice(0, RECENT_KEEP);
      if (lsSetIfChanged("recentlyPlayed", JSON.stringify(recents))) notifyHome = true;
    }

    if (data.savedPlaylists) {
      const next = data.savedPlaylists;
      setSavedPlaylists((prev) => (same(prev, next) ? prev : next));
      lsSetIfChanged("savedPlaylists", JSON.stringify(next));
    }

    if (data.followedArtists) {
      const next = data.followedArtists;
      setFollowedArtists((prev) => (same(prev, next) ? prev : next));
      lsSetIfChanged("shubhu_followed_artists", JSON.stringify(next));
    }

    if (data.downloads) {
      const next = data.downloads;
      setDownloads((prev) => (same(prev, next) ? prev : next));
      lsSetIfChanged("shubhu_downloads", JSON.stringify(next));

      // A song removed from Downloads on another device: free its audio here.
      const keep = new Set(next.map((t) => t.id));
      const pending = new Set(lsGetJSON<Track[]>("shubhu_download_pending", []).map((t) => t.id));
      listOfflineAudio()
        .then(async (rows) => {
          const stale = rows.filter(
            (r) =>
              !isDownloadTestTrackId(r.id) &&
              !keep.has(r.id) &&
              !pending.has(r.id) &&
              Date.now() - r.savedAt > DOWNLOAD_PRUNE_GRACE_MS,
          );
          if (stale.length === 0) return;
          await Promise.all(stale.map((r) => removeOfflineAudio(r.id)));
          const gone = new Set(stale.map((r) => r.id));
          offlineIdsRef.current = new Set([...offlineIdsRef.current].filter((id) => !gone.has(id)));
          setOfflineIds(new Set(offlineIdsRef.current));
          await downloadManager.refreshFromStorage();
        })
        .catch(() => {});
    }

    if (notifyHome && typeof window !== "undefined") window.dispatchEvent(new Event("storage"));
  };

  // Public API: a forced pull (used right after local writes).
  const refreshLibrary = () => pullLibrary(true);

  // Always call the freshest pullLibrary from long-lived listeners.
  const pullRef = useRef(pullLibrary);
  useEffect(() => {
    pullRef.current = pullLibrary;
  });

  useEffect(() => {
    userIdRef.current = user?.id ?? null;
    if (!user?.id) return;

    pullRef.current(true);

    const poll = () => {
      if (document.visibilityState === "visible") pullRef.current(false);
    };
    document.addEventListener("visibilitychange", poll);
    window.addEventListener("focus", poll);
    window.addEventListener("online", poll);
    const interval = setInterval(poll, REFRESH_INTERVAL_MS);
    return () => {
      document.removeEventListener("visibilitychange", poll);
      window.removeEventListener("focus", poll);
      window.removeEventListener("online", poll);
      clearInterval(interval);
    };
  }, [user?.id]);

  // ── 3. Load YouTube IFrame API ─────────────────────────────────────────────
  const isRepeatRef = useRef(isRepeat);
  const isShuffleRef = useRef(isShuffle);
  const queueRef = useRef(queue);
  const currentIndexRef = useRef(currentIndex);
  const currentTrackRef = useRef(currentTrack);
  /** True only when the active queue itself was randomized by Shuffle Play. */
  const shuffleQueueRef = useRef(false);

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
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

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

    // Personalized seeds first. Same queue, same append path below; on any
    // problem this falls straight through to /api/next as before.
    const recommendUserId = userIdRef.current;
    if (recommendUserId && targetVideoId) {
      try {
        const queueIds = queueRef.current
          .map((t) => t.id)
          .filter(isValidVideoId)
          .slice(0, 40)
          .join(",");
        const params = new URLSearchParams({
          userId: recommendUserId,
          section: "queue",
          limit: "12",
          seedVideoId: targetVideoId,
          session: sessionIdRef.current,
          queueIds,
        });
        const res = await fetch(`/api/recommend?${params.toString()}`);
        if (res.ok) {
          const data = (await res.json()) as { queueSeeds?: Track[] };
          if (Array.isArray(data?.queueSeeds)) {
            nextTracks = data.queueSeeds.filter(
              (item) =>
                Boolean(item) &&
                (isValidVideoId(item.youtubeId) || isValidVideoId(item.id)) &&
                !existingIds.has(item.id)
            );
          }
        }
      } catch {
        /* fall through to /api/next */
      }
    }

    if (nextTracks.length < 5 && targetVideoId) {
      try {
        const res = await fetch(`/api/next?videoId=${encodeURIComponent(targetVideoId)}`);
        if (res.ok) {
          const apiNext = await res.json();
          if (Array.isArray(apiNext) && apiNext.length > 0) {
            const knownIds = new Set([...existingIds, ...nextTracks.map((t) => t.id)]);
            const mapped = apiNext
              .filter((item: { videoId?: string }) => isValidVideoId(item.videoId) && item.videoId !== targetVideoId)
              .map((item: { videoId: string; title: string; artist: string; album?: string; thumbnail?: string; duration?: number }) => ({
                id: item.videoId,
                title: item.title,
                artist: item.artist,
                album: item.album || "",
                coverUrl: item.thumbnail || getDefaultArtworkFallbackUrl(),
                duration: item.duration || 180,
                youtubeId: item.videoId,
                audioUrl: "",
              }))
              .filter((item: Track) => !knownIds.has(item.id));
            nextTracks = [...nextTracks, ...mapped];
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
    // The track genuinely finished: this is a completion, not a skip.
    closePlay("complete");

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
      let nextIndex: number;
      if (shuffleQueueRef.current) {
        // Shuffle Play already randomized the queue, so advance through that
        // order (wrapping at the end) instead of picking again at random.
        const queuedIndex = currentIndexRef.current;
        const fallbackIndex = currentQueue.findIndex(
          (song) => song.id === currentTrackRef.current?.id,
        );
        const startIndex =
          queuedIndex >= 0 && queuedIndex < currentQueue.length
            ? queuedIndex
            : Math.max(0, fallbackIndex);
        nextIndex = (startIndex + 1) % currentQueue.length;
      } else {
        nextIndex = Math.floor(Math.random() * currentQueue.length);
      }
      currentIndexRef.current = nextIndex;
      setCurrentIndex(nextIndex);
      playTrack(
        currentQueue[nextIndex],
        undefined,
        shuffleQueueRef.current ? { appendSimilar: false } : undefined,
      );
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
      if (ytRealRef.current) return;

      try {
        const created = new window.YT.Player("yt-audio-player-host", {
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
                if (ytRealRef.current) {
                  ytRealRef.current.setVolume(volume * 100);
                  const rates = ytRealRef.current.getAvailablePlaybackRates();
                  if (Array.isArray(rates) && rates.length > 0) {
                    setAvailableRates(rates);
                  }
                }
              } catch {}
            },
            onStateChange: (event: { data: number }) => {
              // Ignore the iframe's events while a downloaded song plays through <audio>.
              if (ytPlayerRef.current !== ytRealRef.current) return;
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
        ytRealRef.current = created;
        // Don't steal the active engine if a downloaded song is already playing.
        if (ytPlayerRef.current !== audioPlayerRef.current) ytPlayerRef.current = created;
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

  // Keep the latest handleSongEnd reachable from long-lived listeners.
  useEffect(() => {
    handleSongEndRef.current = handleSongEnd;
  });

  // <audio> engine for downloaded songs (works with no network at all).
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioElRef.current = audio;
    audioPlayerRef.current = createAudioPlayer(audio);

    const active = () => ytPlayerRef.current === audioPlayerRef.current;
    const onPlay = () => active() && setIsPlaying(true);
    const onPause = () => active() && !audio.ended && setIsPlaying(false);
    const onEnded = () => {
      if (!active()) return;
      setIsPlaying(false);
      handleSongEndRef.current();
    };
    const onError = () => {
      if (!active()) return;
      setIsPlaying(false);
      setPlaybackError("This downloaded file can't be played. Remove it and download again.");
    };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.pause();
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      if (audioObjectUrlRef.current) URL.revokeObjectURL(audioObjectUrlRef.current);
    };
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

            // Position the play instance will be closed with.
            if (playCtxRef.current) {
              const ctx = playCtxRef.current;
              const delta = time - ctx.lastTickPosition;
              // A normal 250ms tick advances by a fraction of a second; a seek
              // (or a resumed tab) produces a jump that must not count as time
              // genuinely listened to.
              if (delta > 0 && delta < 2) ctx.listenedSeconds += delta;
              ctx.lastTickPosition = time;
              ctx.lastPosition = time;
              if (dur > 0) ctx.duration = dur;
            }

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
  const playTrack = async (
    track: Track,
    newQueue?: Track[],
    options?: PlayTrackOptions,
  ) => {
    const isTestTrack = isDownloadTestTrack(track);
    const localRecord = offlineIdsRef.current.has(track.id) || downloadManager.hasCompleted(track.id);
    let audioSrc: string | null = null;
    let audioSrcIsObjectUrl = false;

    // Prefer real stored bytes. This read works with no network at all.
    if (localRecord && audioElRef.current && audioPlayerRef.current) {
      try {
        const blob = await getOfflineAudio(track.id);
        if (blob) {
          audioSrc = URL.createObjectURL(blob);
          audioSrcIsObjectUrl = true;
        }
      } catch {
        audioSrc = null;
      }
    }

    // Bundled test tracks can stream from their local file before download.
    if (!audioSrc && isTestTrack) {
      const source = resolveDownloadSource(track);
      if (source && (typeof navigator === "undefined" || navigator.onLine !== false)) {
        audioSrc = source.url;
      }
    }

    if (!audioSrc && (isTestTrack || localRecord)) {
      setIsPlaying(false);
      setPlaybackError(
        typeof navigator !== "undefined" && navigator.onLine === false
          ? "You are offline and this song is not downloaded. Reconnect or download it first."
          : "This download is missing or unreadable. Remove it and download again.",
      );
      return;
    }

    // A streaming videoId is only needed when there is no local audio file.
    const candidateId = track.youtubeId || (isValidVideoId(track.id) ? track.id : undefined);
    if (!audioSrc && !isValidVideoId(candidateId)) {
      console.warn(`[Player] Invalid or missing videoId for song "${track.title}" (id: ${track.id}, youtubeId: ${track.youtubeId}).`);
      setIsPlaying(false);
      setPlaybackError("This song has no playable audio source.");
      return;
    }
    setPlaybackError(null);

    // Keep richer metadata for the same song. Downloads views can reconstruct a
    // reduced Track from IndexedDB; merging prevents artwork from switching
    // between a YouTube thumbnail and coverUrl for the same playing song.
    const previous = currentTrackRef.current;
    const playbackTrack: Track =
      previous?.id === track.id
        ? {
            ...previous,
            ...track,
            youtubeId: track.youtubeId ?? previous.youtubeId,
            coverUrl: track.coverUrl || previous.coverUrl,
            artistId: track.artistId ?? previous.artistId,
          }
        : track;

    // Signal bookkeeping only: closing the previous play and opening this one
    // changes no playback or queue state.
    startPlayContext(playbackTrack);

    setCurrentTrack(playbackTrack);
    setCurrentTime(0);
    setDuration(playbackTrack.duration || 0);

    const activeQueue = newQueue ? [...newQueue] : queueRef.current;
    if (newQueue) {
      const idx = newQueue.findIndex((t) => t.id === track.id);
      currentIndexRef.current = idx !== -1 ? idx : 0;
      setCurrentIndex(currentIndexRef.current);
      setQueue(activeQueue);
      // A plain queue replacement disables the "queue is shuffled" mode;
      // Shuffle Play opts back in explicitly via shuffleOrder.
      if (!options?.shuffleOrder) shuffleQueueRef.current = false;
    }

    // Test fixtures stay isolated from recommendations and repair queues.
    if (
      options?.appendSimilar !== false &&
      // A Shuffle Play queue stays exactly the randomized playlist; incidental
      // plays must not append Smart Queue recommendations to it.
      !shuffleQueueRef.current &&
      !isTestTrack &&
      typeof navigator !== "undefined" &&
      navigator.onLine !== false
    ) {
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
    }

    setIsResolving(true);
    try {
      // Downloaded on this device? Play the stored audio, no network needed.
      const audioEl = audioElRef.current;
      if (audioSrc && audioEl && audioPlayerRef.current) {
        try {
          ytRealRef.current?.pauseVideo();
        } catch { /* iframe not ready */ }
        ytPlayerRef.current = audioPlayerRef.current;
        if (audioObjectUrlRef.current) URL.revokeObjectURL(audioObjectUrlRef.current);
        audioObjectUrlRef.current = audioSrcIsObjectUrl ? audioSrc : null;
        audioEl.src = audioSrc;
        audioEl.volume = isMuted ? 0 : volume;
        audioEl.playbackRate = playbackRate;
        audioPlayerRef.current.playVideo();
        setIsPlaying(true);
      } else {
        // Hand control back to the YouTube player (stop any offline audio first).
        if (audioEl && ytPlayerRef.current === audioPlayerRef.current) {
          ytPlayerRef.current = ytRealRef.current ?? audioPlayerRef.current;
          audioEl.pause();
          audioEl.removeAttribute("src");
          audioEl.load();
          if (audioObjectUrlRef.current) {
            URL.revokeObjectURL(audioObjectUrlRef.current);
            audioObjectUrlRef.current = null;
          }
        }
        const player = ytPlayerRef.current;
        if (player?.loadVideoById) {
          player.loadVideoById({ videoId: candidateId as string, startSeconds: 0 });
          player.playVideo();
          setIsPlaying(true);
        } else {
          setPlaybackError("The player is still loading. Try again in a moment.");
        }
      }

      // Test fixtures never pollute listening history or recommendations.
      if (!isTestTrack && user?.id) {
        void postLibrary({ action: "record_history", track: playbackTrack });
      }

      // Update recentlyPlayed in localStorage (zero login / local storage safe)
      if (!isTestTrack && typeof window !== "undefined") {
        try {
          const recent: Track[] = JSON.parse(
            localStorage.getItem("recentlyPlayed") || "[]"
          );
          const updated = [playbackTrack, ...recent.filter((s) => s.id !== playbackTrack.id)].slice(0, 6);
          localStorage.setItem("recentlyPlayed", JSON.stringify(updated));
          // Let the home page refresh its recommendation seeds in the same tab.
          window.dispatchEvent(new Event("storage"));
        } catch {}
      }
    } catch (err) {
      console.error("Playback error:", err);
      setIsPlaying(false);
      setPlaybackError(err instanceof Error ? err.message : "Playback failed. Please retry.");
    } finally {
      setIsResolving(false);
    }
  };

  // The playlist Shuffle action goes through the same playTrack/queue path as
  // Play. It only randomizes the queue first and enables the shared shuffle
  // state so every player control sees the same order.
  const playShuffledQueue = async (tracks: Track[]) => {
    if (tracks.length === 0) return;
    const shuffled = randomizedQueue(tracks);
    currentIndexRef.current = 0;
    shuffleQueueRef.current = true;
    isShuffleRef.current = true;
    setIsShuffle(true);
    await playTrack(shuffled[0], shuffled, {
      appendSimilar: false,
      shuffleOrder: true,
    });
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
    // Advancing while a track is open is a skip (the player decides otherwise
    // on a natural end, which routes through handleSongEnd instead).
    closePlay("skip");
    const currentQueue = queueRef.current;
    if (currentQueue.length === 0) return;
    const shuffleActive = isShuffleRef.current;

    if (shuffleActive && shuffleQueueRef.current) {
      // Follow the shuffled playlist order rather than re-rolling each press.
      const queuedIndex = currentIndexRef.current;
      const fallbackIndex = currentQueue.findIndex(
        (song) => song.id === currentTrackRef.current?.id,
      );
      const startIndex =
        queuedIndex >= 0 && queuedIndex < currentQueue.length
          ? queuedIndex
          : Math.max(0, fallbackIndex);
      const nextIndex = (startIndex + 1) % currentQueue.length;
      currentIndexRef.current = nextIndex;
      setCurrentIndex(nextIndex);
      playTrack(currentQueue[nextIndex], undefined, { appendSimilar: false });
      return;
    }

    let nextIdx = shuffleActive
      ? Math.floor(Math.random() * currentQueue.length)
      : currentIndexRef.current + 1;

    if (!shuffleActive && nextIdx >= currentQueue.length) {
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
            currentIndexRef.current = queueRef.current.length;
            setCurrentIndex(currentIndexRef.current);
            playTrack(similar[0]);
            return;
          }
        }
        nextIdx = 0; // loop back if completely exhausted
      }
    }
    currentIndexRef.current = nextIdx;
    setCurrentIndex(nextIdx);
    playTrack(currentQueue[nextIdx]);
  };

  const prevTrack = () => {
    // Going back is both a skip and an explicit negative signal.
    closePlay("skip", true);
    const currentQueue = queueRef.current;
    if (currentQueue.length === 0) return;
    const previousIndex = currentIndexRef.current;
    const prevIdx = previousIndex - 1 < 0 ? currentQueue.length - 1 : previousIndex - 1;
    currentIndexRef.current = prevIdx;
    setCurrentIndex(prevIdx);
    playTrack(currentQueue[prevIdx]);
  };

  const seek = (seconds: number) => {
    const player = ytPlayerRef.current;
    if (player?.seekTo) {
      player.seekTo(seconds, true);
      setCurrentTime(seconds);
      if (playCtxRef.current) {
        playCtxRef.current.lastPosition = seconds;
        // Do not credit the jump as listening time.
        playCtxRef.current.lastTickPosition = seconds;
        playCtxRef.current.seeked = true;
      }
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

  const toggleShuffle = () => {
    const next = !isShuffleRef.current;
    isShuffleRef.current = next;
    // The header/player toggle keeps the classic random-next behaviour; only
    // the playlist Shuffle action marks the queue itself as shuffled.
    shuffleQueueRef.current = false;
    setIsShuffle(next);
  };
  const toggleRepeat = () => setIsRepeat((v) => !v);

  // ── Like / Unlike ──────────────────────────────────────────────────────────
  const toggleLike = async (track: Track) => {
    const isLiked = likedSongIds.has(track.id);
    const newLikes = new Set(likedSongIds);
    if (isLiked) newLikes.delete(track.id); else newLikes.add(track.id);

    // Optimistic UI
    setLikedSongIds(newLikes);
    lsSet("shubhu_liked_ids", JSON.stringify([...newLikes]));
    // An unlike is a negative signal; a like is a strong positive one.
    queueActivity({ kind: isLiked ? "unlike" : "like", songId: track.id, track });

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
    const alreadyAdded = Boolean(
      playlists.find((pl) => pl.id === playlistId)?.tracks?.some((t) => t.id === track.id)
    );
    const updated = playlists.map((pl) => {
      if (pl.id !== playlistId) return pl;
      const exists = pl.tracks?.some((t) => t.id === track.id);
      if (exists) return pl;
      return { ...pl, tracks: [...(pl.tracks ?? []), track] };
    });
    setPlaylists(updated);
    lsSet("shubhu_playlists", JSON.stringify(updated));
    lsSet("playlists", JSON.stringify(updated));
    if (!alreadyAdded) {
      queueActivity({ kind: "playlist_add", songId: track.id, track });
    }

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
    const exists = savedPlaylists.some((p) => p.id === playlist.id);
    const entry: SavedPlaylist = {
      id: playlist.id,
      title: playlist.title,
      author: playlist.author,
      thumbnail: playlist.thumbnail,
      trackCount: playlist.trackCount,
    };
    const updated = exists ? savedPlaylists.filter((p) => p.id !== playlist.id) : [...savedPlaylists, entry];
    setSavedPlaylists(updated);
    lsSet("savedPlaylists", JSON.stringify(updated));

    void postLibrary(
      exists
        ? { action: "unsave_playlist", savedPlaylistId: playlist.id }
        : { action: "save_playlist", savedPlaylist: entry },
    );
  };

  // ── Follow / unfollow an artist (de-duplicated by browseId) ───────────────
  const toggleFollowArtist = (artist: FollowedArtist) => {
    if (!artist.browseId) return;
    const exists = followedArtists.some((a) => a.browseId === artist.browseId);
    const entry: FollowedArtist = { browseId: artist.browseId, name: artist.name, thumbnail: artist.thumbnail };
    const updated = exists
      ? followedArtists.filter((a) => a.browseId !== artist.browseId)
      : [...followedArtists, entry];
    setFollowedArtists(updated);
    lsSet("shubhu_followed_artists", JSON.stringify(updated));

    void postLibrary(
      exists
        ? { action: "unfollow_artist", browseId: artist.browseId }
        : { action: "follow_artist", artist: entry },
    );
  };

  // ── Downloads (mobile only) ───────────────────────────────────────────────
  // The manager streams and stores real bytes; this context keeps the synced
  // Downloads list in step with whatever is actually on this device.
  const downloadsAvailable = () =>
    typeof window === "undefined" || !window.matchMedia?.("(min-width: 640px)").matches;

  const downloadTracks = async (
    tracks: Track[],
    group?: DownloadGroupInfo,
  ): Promise<EnqueueResult> => {
    if (!downloadsAvailable()) {
      return {
        added: [],
        duplicates: [],
        unavailable: tracks.map((track) => track.id),
        batchId: "mobile-only",
      };
    }
    if (group) {
      await downloadCollections.registerGroup(group, tracks);
    }
    return downloadManager.enqueue(tracks, group);
  };

  const downloadTrack = async (track: Track, group?: DownloadGroupInfo): Promise<AuthResult> => {
    if (!downloadsAvailable()) {
      return { ok: false, error: "Downloads are available in the mobile app only." };
    }
    if (!resolveDownloadSource(track)) {
      return { ok: false, error: "This song has no legal download source available." };
    }
    if (group) {
      await downloadCollections.registerGroup(group, [track]);
    }
    const result = await downloadManager.enqueue([track], group);
    if (result.unavailable.length > 0) {
      return { ok: false, error: "This song has no legal download source available." };
    }
    return { ok: true };
  };

  const retryDownload = (id: string) => downloadManager.retry(id);
  const cancelDownload = (id: string) => downloadManager.cancel(id);
  const clearFinishedDownloads = () => downloadManager.clearFinished();
  const clearPlaybackError = () => setPlaybackError(null);
  const hideDownloadTestPlaylist = () => {
    lsSet(DOWNLOAD_TEST_PLAYLIST_HIDE_KEY, "1");
    setDownloadTestPlaylistVisible(false);
  };

  const removeDownload = async (track: Track) => {
    const id = track.id;
    try {
      await downloadManager.remove(id);
      return;
    } catch {
      // Fall through to a local-only cleanup so the UI never gets stuck.
    }
    await downloadCollections.purgeTrack(id);
    offlineIdsRef.current = new Set([...offlineIdsRef.current].filter((item) => item !== id));
    setOfflineIds(new Set(offlineIdsRef.current));
    const next = downloadsRef.current.filter((item) => item.id !== id);
    downloadsRef.current = next;
    setDownloads(next);
    lsSet("shubhu_downloads", JSON.stringify(next));
    const pending = lsGetJSON<Track[]>("shubhu_download_pending", []);
    lsSet("shubhu_download_pending", JSON.stringify(pending.filter((item) => item.id !== id)));
    await postLibrary({ action: "remove_download", trackId: id });
  };

  /** Remove a reference only. The shared Blob stays available to other collections. */
  const removeTrackFromDownloadCollection = async (collectionId: string, trackId: string) => {
    await downloadCollections.removeFromCollection(collectionId, trackId);
  };

  /** Explicit permanent delete; kept separate from membership removal. */
  const deleteDownloadedAudio = async (track: Track) => {
    await removeDownload(track);
  };

  // ── Accounts (email + 4-digit PIN) ─────────────────────────────────────────
  const authRequest = async (action: "signup" | "signin", email: string, pin: string): Promise<AuthResult> => {
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, email, pin, guestId: lsGet("shubhu_device_id") }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.user) return { ok: false, error: data.error || "Could not sign in. Please try again." };
      // The user.id change triggers a pull, which first uploads this device's
      // local-only data to the account, then loads the account's library.
      setUser(data.user);
      lsSet("shubhu_user", JSON.stringify(data.user));
      return { ok: true };
    } catch {
      return { ok: false, error: "Can't reach the server. Check your connection." };
    }
  };

  const signIn = (email: string, pin: string) => authRequest("signin", email, pin);
  const signUp = (email: string, pin: string) => authRequest("signup", email, pin);

  const signOut = async () => {
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "signout" }),
      });
    } catch {}

    // Leave nothing of the account on this device: library caches, downloaded
    // audio, and the identity itself. A fresh guest id starts clean.
    resetLibraryState();
    await clearOfflineAudio().catch(() => {});
    await downloadCollections.clear();
    downloadManager.reset();
    offlineIdsRef.current = new Set();
    setOfflineIds(new Set());
    lsSet("shubhu_download_pending", "[]");
    lsSet("shubhu_user", "null");

    const guestId = "device_" + Math.random().toString(36).substring(2, 10);
    lsSet("shubhu_device_id", guestId);
    setUser(null);
    userIdRef.current = null;
    try {
      const data = await (await fetch(`/api/user?id=${guestId}`)).json();
      if (data.user) {
        setUser(data.user);
        lsSet("shubhu_user", JSON.stringify(data.user));
      }
    } catch {}
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
    // Keep normal YouTube tracks plus anything playable from this device.
    const validTracks = newQueue.filter((t) => {
      const valid =
        isValidVideoId(t.youtubeId) ||
        isValidVideoId(t.id) ||
        isDownloadTestTrack(t) ||
        downloadManager.hasCompleted(t.id);
      if (!valid) {
        console.warn(`[Queue] Skipping invalid track "${t.title}" (id: ${t.id}, youtubeId: ${t.youtubeId})`);
      }
      return valid;
    });
    shuffleQueueRef.current = false;
    setQueue(validTracks);
  };

  // ── Lock screen / notification / headset controls (Media Session API) ─────
  // Handlers are registered once and call the latest actions through a ref.
  const mediaActionsRef = useRef({ isPlaying, togglePlay, nextTrack, prevTrack, seek });
  useEffect(() => {
    mediaActionsRef.current = { isPlaying, togglePlay, nextTrack, prevTrack, seek };
  });

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => !mediaActionsRef.current.isPlaying && mediaActionsRef.current.togglePlay()],
      ["pause", () => mediaActionsRef.current.isPlaying && mediaActionsRef.current.togglePlay()],
      ["previoustrack", () => mediaActionsRef.current.prevTrack()],
      ["nexttrack", () => mediaActionsRef.current.nextTrack()],
      ["seekto", (details) => typeof details.seekTime === "number" && mediaActionsRef.current.seek(details.seekTime)],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        /* action not supported on this browser */
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {}
      }
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = currentTrack
      ? new MediaMetadata({
          title: currentTrack.title,
          artist: currentTrack.artist,
          album: currentTrack.album || "",
          artwork: currentTrack.coverUrl ? [{ src: currentTrack.coverUrl, sizes: "512x512" }] : [],
        })
      : null;
  }, [currentTrack]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = currentTrack ? (isPlaying ? "playing" : "paused") : "none";
  }, [isPlaying, currentTrack]);

  return (
    <PlayerContext.Provider
      value={{
        currentTrack, isPlaying, queue, currentIndex,
        currentTime, duration, volume, isMuted,
        isShuffle, isRepeat, isResolving,
        user, likedSongIds, playlists, savedPlaylists,
        followedArtists, theme, mobileExpanded, playbackRate, availableRates,
        sleepEndsAt, sleepRemainingSeconds, sleepAtEndOfSong, sleepTimerNotice,
        setPlaybackRate, setMobileExpanded, setAppQueue, playNext,
        playTrack, playShuffledQueue, togglePlay, nextTrack, prevTrack,
        seek, setVolume, toggleMute, toggleShuffle, toggleRepeat,
        selectSleepTimer, cancelSleepTimer,
        toggleLike, updateUser, refreshLibrary, createPlaylist, addToPlaylist,
        updatePlaylist, deletePlaylist, removeFromPlaylist, toggleSavedPlaylist,
        toggleFollowArtist, setTheme,
        downloads, offlineIds, downloadProgress, downloadJobs, downloadRecords,
        downloadCollections: downloadCollectionsState,
        downloadBatches, downloadOnline, playbackError, clearPlaybackError,
        downloadTestPlaylist: DOWNLOAD_TEST_PLAYLIST,
        downloadTestPlaylistVisible, hideDownloadTestPlaylist,
        downloadTrack, downloadTracks, retryDownload, cancelDownload,
        clearFinishedDownloads, removeTrackFromDownloadCollection,
        deleteDownloadedAudio, removeDownload,
        signIn, signUp, signOut,
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
