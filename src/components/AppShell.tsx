"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Navbar } from "@/components/Navbar";
import { Player } from "@/components/Player";
import { RightPanel } from "@/components/RightPanel";
import { UserProfileModal } from "@/components/UserProfileModal";
import { CreatePlaylistModal } from "@/components/CreatePlaylistModal";
import { AppShellContext, type AppShellContextValue } from "@/context/AppShellContext";
import { usePlayer } from "@/context/PlayerContext";
import type { Track } from "@/lib/types";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { addToPlaylist } = usePlayer();

  const [currentView, setCurrentViewState] = useState<string>("home");
  const [searchQuery, setSearchQuery] = useState("");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [pendingPlaylistTrack, setPendingPlaylistTrack] = useState<Track | null>(null);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  // Shell views live on Home. From a detail route, switch back before applying them.
  const setCurrentView = useCallback((view: string) => {
    setCurrentViewState(view);
    if (pathname !== "/") router.push("/");
  }, [pathname, router]);

  const openProfile = useCallback(() => setIsProfileOpen(true), []);

  const openCreatePlaylist = useCallback((track?: Track | null) => {
    setPendingPlaylistTrack(track ?? null);
    setIsCreatePlaylistOpen(true);
  }, []);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    if (currentView !== "search") setCurrentView("search");
  }, [currentView, setCurrentView]);

  // Bridge events from TrackRow so create-playlist works on every routed page.
  useEffect(() => {
    const handleSearch = (event: Event) => {
      const detail = (event as CustomEvent<{ query?: string }>).detail;
      if (!detail?.query?.trim()) return;
      setSearchQuery(detail.query);
      setCurrentView("search");
    };

    const handleCreatePlaylist = (event: Event) => {
      const detail = (event as CustomEvent<{ track?: Track }>).detail;
      openCreatePlaylist(detail?.track ?? null);
    };

    window.addEventListener("shubhu:search", handleSearch);
    window.addEventListener("shubhu:create-playlist", handleCreatePlaylist);
    return () => {
      window.removeEventListener("shubhu:search", handleSearch);
      window.removeEventListener("shubhu:create-playlist", handleCreatePlaylist);
    };
  }, [openCreatePlaylist, setCurrentView]);

  const contextValue = useMemo<AppShellContextValue>(() => ({
    currentView,
    setCurrentView,
    searchQuery,
    setSearchQuery,
    openProfile,
    openCreatePlaylist,
    showRightPanel,
    setShowRightPanel,
    sidebarCollapsed,
    setSidebarCollapsed,
  }), [
    currentView,
    setCurrentView,
    searchQuery,
    openProfile,
    openCreatePlaylist,
    showRightPanel,
    sidebarCollapsed,
  ]);

  return (
    <AppShellContext.Provider value={contextValue}>
      <div data-theme-region="app" className="flex h-[100dvh] w-full overflow-hidden bg-[var(--background)] text-white shubhu-radial-bg">
        <Sidebar
          currentView={currentView}
          onSelectView={setCurrentView}
          onOpenProfile={openProfile}
          onOpenCreatePlaylist={() => openCreatePlaylist(null)}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((collapsed) => !collapsed)}
        />

        <div className="relative flex-1 flex flex-col h-full overflow-hidden bg-transparent">
          <Navbar
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            showSearch={currentView === "search"}
            onOpenProfile={openProfile}
          />

          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {children}
          </div>

          <Player embedded />
        </div>

        <RightPanel
          isOpen={showRightPanel}
          onClose={() => setShowRightPanel(false)}
        />

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
      </div>
    </AppShellContext.Provider>
  );
}
