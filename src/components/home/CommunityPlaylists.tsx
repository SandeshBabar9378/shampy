"use client";

/**
 * Home Step 2 — Community Playlists.
 *
 * Playlists come from the existing /api/search community-playlist results;
 * song counts and tracks come from /api/playlist. Nothing is invented. The
 * per-card menu is portalled to <body> because the row scrolls horizontally
 * and would otherwise clip a menu rendered inside it.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { MoreVertical, Users } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import type { Track } from "@/lib/types";
import { getDefaultArtworkFallbackUrl } from "@/lib/artwork";
import { LAVENDER, PlaceholderRow, SectionHeader } from "./homeUi";

const CARD_CLASS = "w-[37%] min-w-[128px]";
const MENU_WIDTH = 192;

interface CommunityPlaylist {
  browseId: string;
  title: string;
  author: string;
  thumbnail: string;
  trackCount: number | null;
  tracks: Track[];
}

interface MenuState {
  playlist: CommunityPlaylist;
  top: number;
  left: number;
}

interface PlaylistDetailTrack {
  videoId: string;
  title: string;
  artist: string;
  album?: string;
  thumbnail?: string;
  duration?: number;
}

function detailToTrack(item: PlaylistDetailTrack): Track {
  return {
    id: item.videoId,
    title: item.title,
    artist: item.artist,
    album: item.album || "",
    coverUrl: item.thumbnail || getDefaultArtworkFallbackUrl(),
    duration: item.duration || 0,
    youtubeId: item.videoId,
  };
}

export function CommunityPlaylists({ history }: { history: Track[] }) {
  const router = useRouter();
  const { playlists, savedPlaylists, toggleSavedPlaylist, addToPlaylist } = usePlayer();

  const [items, setItems] = useState<CommunityPlaylist[]>([]);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // A real signal from history narrows the public search; the broad query is
  // only a search term, never presented as playlist data.
  const query = useMemo(() => {
    const artistCounts = new Map<string, number>();
    const genreCounts = new Map<string, number>();
    history.forEach((track) => {
      if (track.artist) artistCounts.set(track.artist, (artistCounts.get(track.artist) ?? 0) + 1);
      if (track.genre) genreCounts.set(track.genre, (genreCounts.get(track.genre) ?? 0) + 1);
    });
    const topArtist = [...artistCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const topGenre = [...genreCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topArtist && topArtist[1] >= 2) return `${topArtist[0]} playlist`;
    if (topGenre && topGenre[1] >= 2) return `${topGenre[0]} playlist`;
    return "hindi playlist";
  }, [history]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then(async (data: unknown) => {
        const raw = (data as { playlists?: unknown } | null)?.playlists;
        if (!Array.isArray(raw)) {
          if (!cancelled) setItems([]);
          return;
        }
        const community: CommunityPlaylist[] = raw
          .filter((entry): entry is {
            browseId: string;
            title: string;
            author: string;
            thumbnail?: string;
            isCommunity?: boolean;
          } => {
            if (!entry || typeof entry !== "object") return false;
            const item = entry as { browseId?: unknown; title?: unknown; isCommunity?: unknown };
            return (
              item.isCommunity === true &&
              typeof item.browseId === "string" &&
              item.browseId.length > 0 &&
              typeof item.title === "string" &&
              item.title.length > 0
            );
          })
          .slice(0, 6)
          .map((item) => ({
            browseId: item.browseId,
            title: item.title,
            author: item.author || "Unknown creator",
            thumbnail: item.thumbnail || "",
            trackCount: null,
            tracks: [],
          }));

        const detailed = await Promise.all(
          community.map(async (playlist) => {
            try {
              const id = playlist.browseId.replace(/^VL/, "");
              const res = await fetch(`/api/playlist?id=${encodeURIComponent(id)}`, {
                signal: controller.signal,
              });
              if (!res.ok) return playlist;
              const detail = (await res.json()) as {
                trackCount?: unknown;
                tracks?: PlaylistDetailTrack[];
              };
              const count =
                typeof detail.trackCount === "number" && detail.trackCount > 0
                  ? detail.trackCount
                  : Array.isArray(detail.tracks) && detail.tracks.length > 0
                    ? detail.tracks.length
                    : null;
              const tracks = Array.isArray(detail.tracks)
                ? detail.tracks
                    .filter((track) => Boolean(track?.videoId && track?.title))
                    .slice(0, 50)
                    .map(detailToTrack)
                : [];
              return { ...playlist, trackCount: count, tracks };
            } catch {
              return playlist;
            }
          }),
        );
        if (!cancelled) setItems(detailed);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (menuRef.current?.contains(target)) return;
      if (target?.closest("[data-community-menu-button]")) return;
      setMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    const onScroll = () => setMenu(null);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [menu]);

  const openMenu = (event: React.MouseEvent<HTMLButtonElement>, playlist: CommunityPlaylist) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - MENU_WIDTH - 8);
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, maxLeft));
    setAddMode(false);
    setMenu({ playlist, top: rect.bottom + 6, left });
  };

  const handleSave = () => {
    if (!menu) return;
    const { playlist } = menu;
    toggleSavedPlaylist({
      id: playlist.browseId,
      title: playlist.title,
      author: playlist.author,
      thumbnail: playlist.thumbnail || getDefaultArtworkFallbackUrl(),
      trackCount: playlist.trackCount ?? 0,
    });
    setMenu(null);
  };

  const handleAddToPlaylist = async (targetId: string, targetName: string) => {
    if (!menu || menu.playlist.tracks.length === 0) return;
    const tracks = menu.playlist.tracks;
    for (const track of tracks) {
      await addToPlaylist(targetId, track);
    }
    setNotice(`Added ${tracks.length} songs to ${targetName}`);
    setMenu(null);
  };

  return (
    <div className="relative mt-6">
      <SectionHeader icon={Users} title="Community Playlists" />
      {items.length > 0 ? (
        <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
          {items.map((playlist) => (
            <div key={playlist.browseId} className={`${CARD_CLASS} shrink-0`}>
              <div className="relative block aspect-square w-full">
                <button
                  type="button"
                  onClick={() => router.push(`/playlist/${playlist.browseId.replace(/^VL/, "")}`)}
                  className="shubhu-art-placeholder block h-full w-full overflow-hidden rounded-xl border text-left cursor-pointer shubhu-press"
                  title={playlist.title}
                >
                  {playlist.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={playlist.thumbnail}
                      alt={playlist.title}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="shubhu-placeholder-gradient-1 flex h-full w-full items-center justify-center text-2xl font-bold text-white/70">
                      {playlist.title.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  data-community-menu-button
                  onClick={(event) => openMenu(event, playlist)}
                  className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--theme-card-strong)] text-[var(--color-white)] shubhu-press"
                  title="Playlist options"
                  aria-label={`Options for ${playlist.title}`}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => router.push(`/playlist/${playlist.browseId.replace(/^VL/, "")}`)}
                className="mt-1.5 block w-full cursor-pointer text-left"
                title={playlist.title}
              >
                <span className="block truncate text-[12px] font-semibold text-white">
                  {playlist.title}
                </span>
                <span className="block truncate text-[11px]" style={{ color: LAVENDER }}>
                  {playlist.author}
                  {playlist.trackCount !== null ? ` · ${playlist.trackCount} songs` : ""}
                </span>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <PlaceholderRow
          count={3}
          note="Community playlists will appear here"
          cardClassName={CARD_CLASS}
        />
      )}
      {notice && (
        <p className="px-4 text-xs" style={{ color: LAVENDER }}>
          {notice}
        </p>
      )}

      {menu &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            className="shubhu-menu-surface fixed w-48 rounded-xl border p-1.5 text-xs shadow-2xl z-[60]"
            style={{ top: menu.top, left: menu.left }}
            role="menu"
          >
            {addMode ? (
              <>
                <button
                  type="button"
                  onClick={() => setAddMode(false)}
                  className="w-full rounded-lg px-3 py-2 text-left text-white/70 hover:bg-white/10"
                >
                  ← Back
                </button>
                {playlists.length > 0 ? (
                  playlists.map((playlist) => (
                    <button
                      key={playlist.id}
                      type="button"
                      disabled={menu.playlist.tracks.length === 0}
                      onClick={() => void handleAddToPlaylist(playlist.id, playlist.name)}
                      className="block w-full truncate rounded-lg px-3 py-2 text-left text-white hover:bg-white/10 disabled:opacity-40"
                    >
                      {playlist.name}
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-2" style={{ color: LAVENDER }}>
                    Create a playlist first
                  </p>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleSave}
                  className="block w-full rounded-lg px-3 py-2 text-left text-white hover:bg-white/10"
                >
                  {savedPlaylists.some((item) => item.id === menu.playlist.browseId)
                    ? "Remove from library"
                    : "Save to library"}
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode(true)}
                  className="block w-full rounded-lg px-3 py-2 text-left text-white hover:bg-white/10"
                >
                  Add to a playlist
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
