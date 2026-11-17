"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Home, Search, Library, Plus, Heart, Music2, ChevronLeft, ChevronRight, Settings } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import { PlaylistCollage } from "./PlaylistCollage";

interface SidebarProps {
  currentView: string;
  onSelectView: (view: string) => void;
  onOpenProfile: () => void;
  onOpenCreatePlaylist: () => void;
  onOpenSettings?: () => void;
}

export function Sidebar({ currentView, onSelectView, onOpenProfile, onOpenCreatePlaylist, onOpenSettings }: SidebarProps) {
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
    { id: "liked", label: "Liked songs", icon: Heart },
    { id: "library", label: "Your library", icon: Library },
  ];

  const renderNavItem = ({ id, label, icon: Icon }: (typeof navItems)[number]) => {
    const active = currentView === id;
    return (
      <button
        key={id}
        onClick={() => onSelectView(id)}
        aria-current={active ? "page" : undefined}
        className={`group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all cursor-pointer ${
          active
            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 shadow-sm"
            : "text-neutral-400 hover:text-white hover:bg-white/5 border border-transparent"
        } ${collapsed ? "justify-center px-0" : ""}`}
        title={label}
      >
        {active && (
          <span className={`absolute top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-emerald-400 ${collapsed ? "-left-1" : "left-1"}`} />
        )}
        <Icon className={`w-5 h-5 shrink-0 ${active ? "text-emerald-400" : ""}`} />
        {!collapsed && <span>{label}</span>}
        {collapsed && (
          <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
            {label}
          </span>
        )}
      </button>
    );
  };

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <aside
        className={`hidden sm:flex flex-col h-[calc(100vh-1.5rem)] my-3 ml-3 shrink-0 rounded-2xl bg-neutral-950/80 backdrop-blur-xl border border-white/5 shadow-2xl transition-all duration-300 select-none z-20 ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        {/* Brand */}
        <div className="h-16 px-4 flex items-center justify-between shrink-0 border-b border-white/5">
          {!collapsed ? (
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center text-black shadow-lg shadow-emerald-500/20 shrink-0">
                <Music2 className="w-5 h-5 fill-black" />
              </div>
              <div>
                <span className="font-display font-bold text-white text-lg tracking-tight block leading-tight">Shubhu</span>
                <span className="text-[10px] text-emerald-400 font-mono tracking-wider block">MUSIC</span>
              </div>
            </div>
          ) : (
            <button
              onClick={() => onSelectView("home")}
              className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center text-black shadow-lg shadow-emerald-500/20 mx-auto cursor-pointer"
              title="Shubhu"
            >
              <Music2 className="w-5 h-5 fill-black" />
            </button>
          )}

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation items */}
        <div className="p-2 space-y-1">
          {navItems.slice(0, 2).map(renderNavItem)}
          <div className="my-2 border-t border-white/5" role="separator" />
          {navItems.slice(2).map(renderNavItem)}
        </div>

        {/* Separator & Playlists Header */}
        {!collapsed && (
          <div className="px-4 pt-4 pb-2 flex items-center justify-between border-t border-white/5 mt-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 font-mono">
              Your Playlists
            </span>
            <button
              onClick={onOpenCreatePlaylist}
              className="p-1 rounded-lg text-neutral-400 hover:text-emerald-400 hover:bg-white/5 transition-colors cursor-pointer"
              title="Create playlist"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Playlists List */}
        <div className="flex-1 overflow-y-auto px-2 pt-1 pb-3 space-y-1 scrollbar-hide">
          {/* User playlists */}
          {mounted &&
            playlists.map((pl) => {
              const active = currentView === `playlist:${pl.id}`;
              const count = pl.tracks ? pl.tracks.length : (pl.trackCount || 0);
              return (
                <button
                  key={pl.id}
                  onClick={() => onSelectView(`playlist:${pl.id}`)}
                  className={`relative w-full flex items-center gap-3 p-2 rounded-xl text-left transition-all cursor-pointer group ${
                    active
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                      : "text-neutral-400 hover:text-white hover:bg-white/5 border border-transparent"
                  } ${collapsed ? "justify-center px-0" : ""}`}
                  title={pl.name}
                >
                  {active && (
                    <span className={`absolute top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-emerald-400 ${collapsed ? "-left-1" : "left-0.5"}`} />
                  )}
                  <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-neutral-800 shadow-md">
                    <PlaylistCollage
                      tracks={pl.tracks}
                      fallbackCoverUrl={pl.coverUrl}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {!collapsed && (
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate group-hover:text-emerald-400 transition-colors">
                        {pl.name}
                      </p>
                      <p className="text-[11px] text-neutral-400 truncate">
                        {count} {count === 1 ? "song" : "songs"}
                      </p>
                    </div>
                  )}
                </button>
              );
            })}

          {/* Saved YouTube playlists */}
          {mounted &&
            savedPlaylists.map((sp) => {
              const active = currentView === `saved-playlist:${sp.id}`;
              return (
                <button
                  key={sp.id}
                  onClick={() => router.push(`/playlist/${sp.id}`)}
                  className={`relative w-full flex items-center gap-3 p-2 rounded-xl text-left transition-all cursor-pointer group ${
                    active
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                      : "text-neutral-400 hover:text-white hover:bg-white/5 border border-transparent"
                  } ${collapsed ? "justify-center px-0" : ""}`}
                  title={sp.title}
                >
                  {active && (
                    <span className={`absolute top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-emerald-400 ${collapsed ? "-left-1" : "left-0.5"}`} />
                  )}
                  <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-neutral-800 shadow-md">
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
                      <span className="w-full h-full flex items-center justify-center text-xs font-bold text-neutral-300">
                        {sp.title.trim().charAt(0).toUpperCase() || "P"}
                      </span>
                    )}
                  </div>
                  {!collapsed && (
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate group-hover:text-emerald-400 transition-colors">
                        {sp.title}
                      </p>
                      <p className="text-[11px] text-neutral-400 truncate">
                        {sp.trackCount || 0} songs
                      </p>
                    </div>
                  )}
                </button>
              );
            })}
        </div>

        {/* User profile row at bottom */}
        <div className="p-2 border-t border-white/5 shrink-0 bg-neutral-950/40">
          <div className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-white/5 transition-colors">
            <button
              onClick={onOpenProfile}
              className={`flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer ${
                collapsed ? "justify-center" : ""
              }`}
              title="Profile"
            >
              <img
                src={user?.avatar || "https://api.dicebear.com/7.x/bottts/svg?seed=music"}
                alt="Avatar"
                crossOrigin="anonymous"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.src = "https://api.dicebear.com/7.x/bottts/svg?seed=music";
                }}
                className="w-8 h-8 rounded-full bg-neutral-800 border border-white/10 object-cover shrink-0"
              />
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white truncate hover:text-emerald-400 transition-colors">
                    {user?.username || "Guest User"}
                  </p>
                  <p className="text-[10px] text-neutral-400 font-mono truncate">
                    {user?.id ? `${user.id.slice(0, 8)}…` : "Free Plan"}
                  </p>
                </div>
              )}
            </button>

            {!collapsed && (
              <button
                onClick={() => {
                  if (onOpenSettings) onOpenSettings();
                  else router.push("/settings");
                }}
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ── Mobile bottom navigation bar ─────────────────────────────────── */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-neutral-950/90 backdrop-blur-xl border-t border-white/10 flex justify-around py-2 pb-safe shadow-2xl">
        {[
          navItems.find((n) => n.id === "home")!,
          navItems.find((n) => n.id === "search")!,
          navItems.find((n) => n.id === "library")!,
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => {
              setMobileExpanded(false);
              onSelectView(id);
            }}
            className={`flex flex-col items-center gap-1 px-4 py-1 rounded-xl cursor-pointer transition-colors ${
              currentView === id
                ? "text-emerald-400 font-semibold"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] tracking-tight">{label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
