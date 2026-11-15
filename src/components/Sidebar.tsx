"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Home, Search, Library, Plus, Heart, Music2, ChevronLeft, ChevronRight } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import { PlaylistCollage } from "./PlaylistCollage";

interface SidebarProps {
  currentView: string;
  onSelectView: (view: string) => void;
  onOpenProfile: () => void;
  onOpenCreatePlaylist: () => void;
}

export function Sidebar({ currentView, onSelectView, onOpenProfile, onOpenCreatePlaylist }: SidebarProps) {
  const { user, likedSongIds, playlists, savedPlaylists, setMobileExpanded, currentTrack } = usePlayer();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const navItems = [
    { id: "home", label: "Home", icon: Home },
    { id: "search", label: "Search", icon: Search },
    { id: "library", label: "Your Library", icon: Library },
  ];

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <aside
        className={`hidden sm:flex flex-col h-full shrink-0 overflow-hidden bg-black border-r border-neutral-900 transition-all duration-300 select-none ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        {/* Brand — collapsed: centered row matching the 64px header height. */}
        {collapsed ? (
          <>
            <div className="h-16 flex items-center justify-center shrink-0">
              <button
                onClick={() => onSelectView("home")}
                className="w-9 h-9 bg-emerald-500 rounded-full flex items-center justify-center text-black shadow-lg shrink-0 cursor-pointer"
                title="Shubhu"
              >
                <Music2 className="w-5 h-5 fill-black" />
              </button>
            </div>
            <div className="flex justify-center pb-3 shrink-0">
              <button
                onClick={() => setCollapsed(false)}
                title="Expand sidebar"
                className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-900 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </>
        ) : (
          <div className="h-16 flex items-center justify-between px-4 shrink-0">
            <div
              className="flex items-center gap-3 cursor-pointer min-w-0"
              onClick={() => onSelectView("home")}
            >
              <div className="w-9 h-9 bg-emerald-500 rounded-full flex items-center justify-center text-black shadow-lg shrink-0">
                <Music2 className="w-5 h-5 fill-black" />
              </div>
              <span className="font-bold text-white text-xl tracking-tight truncate">Shubhu</span>
            </div>
            <button
              onClick={() => setCollapsed(true)}
              title="Collapse sidebar"
              className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-900 transition-colors cursor-pointer shrink-0 ml-1"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Main Nav */}
        <nav className="px-2 space-y-1 shrink-0">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onSelectView(id)}
              title={collapsed ? label : undefined}
              className={`w-full flex items-center gap-4 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                collapsed ? "justify-center px-0" : "px-3"
              } ${
                currentView === id
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!collapsed && label}
            </button>
          ))}
        </nav>

        {/* Collapsed Library tiles (Liked Songs + playlists) */}
        {collapsed && (
          <>
            <div className="h-px bg-neutral-800 my-3 mx-3 shrink-0" />

            <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 scrollbar-thin scrollbar-thumb-neutral-800">
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={() => onSelectView("liked")}
                  title="Liked Songs"
                  className={`w-9 h-9 rounded-lg overflow-hidden bg-gradient-to-br from-indigo-600 to-purple-400 flex items-center justify-center cursor-pointer transition-all ${
                    currentView === "liked"
                      ? "ring-2 ring-emerald-400 ring-offset-2 ring-offset-black"
                      : "hover:opacity-90"
                  }`}
                >
                  <Heart className="w-4 h-4 fill-white text-white" />
                </button>

                {mounted &&
                  playlists.map((pl) => {
                    const cover =
                      pl.coverUrl ||
                      pl.tracks?.find((track) => track.coverUrl)?.coverUrl ||
                      "";
                    const isActive = currentView === `playlist:${pl.id}`;

                    return (
                      <button
                        key={pl.id}
                        onClick={() => onSelectView(`playlist:${pl.id}`)}
                        title={pl.name}
                        className={`w-9 h-9 rounded-lg overflow-hidden cursor-pointer transition-all ${
                          isActive
                            ? "ring-2 ring-emerald-400 ring-offset-2 ring-offset-black"
                            : "hover:opacity-90"
                        }`}
                      >
                        {cover ? (
                          <img
                            src={cover}
                            alt={pl.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src = "/placeholder.svg";
                            }}
                          />
                        ) : (
                          <span className="w-full h-full bg-neutral-800 text-neutral-300 flex items-center justify-center text-sm font-bold">
                            {pl.name.trim().charAt(0).toUpperCase() || "P"}
                          </span>
                        )}
                      </button>
                    );
                  })}

                {mounted &&
                  savedPlaylists.map((sp) => (
                    <button
                      key={`saved-${sp.id}`}
                      onClick={() => router.push(`/playlist/${sp.id}`)}
                      title={sp.title}
                      className="w-9 h-9 rounded-lg overflow-hidden cursor-pointer transition-all hover:opacity-90"
                    >
                      {sp.thumbnail ? (
                        <img
                          src={sp.thumbnail}
                          alt={sp.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = "/placeholder.svg";
                          }}
                        />
                      ) : (
                        <span className="w-full h-full bg-neutral-800 text-neutral-300 flex items-center justify-center text-sm font-bold">
                          {sp.title.trim().charAt(0).toUpperCase() || "P"}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            </div>

            {/* Profile bar stays pinned at the bottom while tiles scroll. */}
            <div
              className={`p-2 border-t border-neutral-900 shrink-0 transition-all duration-300 ${
                currentTrack ? "pb-28" : "pb-2"
              }`}
            >
              <button
                onClick={onOpenProfile}
                title={user?.username || "Guest User"}
                className="w-full flex items-center justify-center p-1 rounded-lg hover:bg-neutral-900/80 transition-colors cursor-pointer"
              >
                <img
                  src={user?.avatar || "https://api.dicebear.com/7.x/bottts/svg?seed=music"}
                  alt="Avatar"
                  crossOrigin="anonymous"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.src = "https://api.dicebear.com/7.x/bottts/svg?seed=music";
                  }}
                  className="w-9 h-9 rounded-full bg-neutral-800 border border-neutral-700 object-cover shrink-0"
                />
              </button>
            </div>
          </>
        )}

        {!collapsed && (
          <>
            {/* Create Playlist + Liked Songs */}
            <div className="mt-4 px-2 space-y-1">
              <button
                onClick={onOpenCreatePlaylist}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-neutral-400 hover:text-white transition-colors group cursor-pointer"
              >
                <div className="w-6 h-6 rounded bg-neutral-800 group-hover:bg-neutral-700 flex items-center justify-center transition-colors shrink-0">
                  <Plus className="w-4 h-4 text-white" />
                </div>
                Create Playlist
              </button>

              <button
                onClick={() => onSelectView("liked")}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                  currentView === "liked" ? "bg-neutral-900 text-white" : "text-neutral-400 hover:text-white"
                }`}
              >
                <div className="w-6 h-6 rounded bg-gradient-to-br from-indigo-600 to-purple-400 flex items-center justify-center shrink-0">
                  <Heart className="w-3.5 h-3.5 fill-white text-white" />
                </div>
                <span className="flex-1 text-left">Liked Songs</span>
                <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded-full font-mono">
                  {mounted ? likedSongIds.size : 0}
                </span>
              </button>
            </div>

            <div className="h-px bg-neutral-800 my-4 mx-4" />

            {/* Playlist list */}
            <div className="flex-1 min-h-0 overflow-y-auto px-2 space-y-1 scrollbar-thin scrollbar-thumb-neutral-800">
              <p className="text-xs uppercase font-semibold text-neutral-500 tracking-wider px-3 py-1">
                Playlists
              </p>
              {!mounted || playlists.length === 0 ? (
                <p className="text-xs text-neutral-600 px-3 py-2 italic">No playlists yet</p>
              ) : (
                playlists.map((pl) => (
                  <button
                    key={pl.id}
                    onClick={() => onSelectView(`playlist:${pl.id}`)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer text-left ${
                      currentView === `playlist:${pl.id}`
                        ? "bg-neutral-900 text-emerald-400 font-medium"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    <div className="w-6 h-6 rounded overflow-hidden shrink-0">
                      <PlaylistCollage
                        tracks={pl.tracks}
                        fallbackCoverUrl={pl.coverUrl}
                        className="w-full h-full"
                      />
                    </div>
                    <span className="truncate flex-1">{pl.name}</span>
                  </button>
                ))
              )}
              {mounted &&
                savedPlaylists.map((sp) => (
                  <button
                    key={`saved-${sp.id}`}
                    onClick={() => router.push(`/playlist/${sp.id}`)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer text-left text-neutral-400 hover:text-white"
                  >
                    <div className="w-6 h-6 rounded overflow-hidden shrink-0 bg-neutral-800">
                      {sp.thumbnail ? (
                        <img
                          src={sp.thumbnail}
                          alt={sp.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = "/placeholder.svg";
                          }}
                        />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center text-[10px] font-bold text-neutral-300">
                          {sp.title.trim().charAt(0).toUpperCase() || "P"}
                        </span>
                      )}
                    </div>
                    <span className="truncate flex-1">{sp.title}</span>
                  </button>
                ))}
            </div>

            {/* Profile bar - Stays fixed at bottom of sidebar, moves up by 90px when player appears */}
            <div
              className={`p-3 border-t border-neutral-900 shrink-0 transition-all duration-300 ${
                currentTrack ? "pb-28" : "pb-4"
              }`}
            >
              <button
                onClick={onOpenProfile}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-neutral-900/80 transition-colors text-left group cursor-pointer"
              >
                <img
                  src={user?.avatar || "https://api.dicebear.com/7.x/bottts/svg?seed=music"}
                  alt="Avatar"
                  crossOrigin="anonymous"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.src = "https://api.dicebear.com/7.x/bottts/svg?seed=music";
                  }}
                  className="w-9 h-9 rounded-full bg-neutral-800 border border-neutral-700 object-cover shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate group-hover:text-emerald-400 transition-colors">
                    {user?.username || "Guest User"}
                  </p>
                  <p className="text-xs text-neutral-500 font-mono truncate">
                    {user?.id ? `${user.id.slice(0, 10)}…` : "Local Profile"}
                  </p>
                </div>
              </button>
            </div>
          </>
        )}
      </aside>

      {/* ── Mobile bottom navigation bar ─────────────────────────────────── */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-neutral-950 border-t border-neutral-800 flex justify-around py-2 pb-safe">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => {
              setMobileExpanded(false);
              onSelectView(id);
            }}
            className={`flex flex-col items-center gap-0.5 px-3 cursor-pointer transition-colors ${
              currentView === id ? "text-emerald-400" : "text-neutral-400"
            }`}
          >
            <Icon className="w-6 h-6" />
            <span className="text-[10px] font-semibold">{label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
