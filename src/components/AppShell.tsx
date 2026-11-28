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

export function AppShell({
  children,
  phoneChromeOnly = false,
}: {
  children: React.ReactNode;
  /** Keep only the phone nav + mini-player (used by the standalone /settings route). */
  phoneChromeOnly?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { addToPlaylist } = usePlayer();

  const [currentView, setCurrentViewState] = useState<string>("home");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSubmitNonce, setSearchSubmitNonce] = useState(0);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [pendingPlaylistTrack, setPendingPlaylistTrack] = useState<Track | null>(null);
  const [showRightPanel, setShowRightPanel] = useState(true);
  // Desktop opens with the full library visible; narrow windows collapse it
  // after mount so the content column never gets squeezed.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1180px)").matches) {
      queueMicrotask(() => setSidebarCollapsed(true));
    }
  }, []);

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
    if (query.trim() && currentView !== "search") setCurrentView("search");
  }, [currentView, setCurrentView]);

  const submitSearch = useCallback((query?: string) => {
    const nextQuery = (query ?? searchQuery).trim();
    if (!nextQuery) return;
    setSearchQuery(nextQuery);
    setSearchSubmitNonce((nonce) => nonce + 1);
    setCurrentView("search");
  }, [searchQuery, setCurrentView]);

  // Bridge events from TrackRow so create-playlist works on every routed page.
  useEffect(() => {
    const handleSearch = (event: Event) => {
      const detail = (event as CustomEvent<{ query?: string }>).detail;
      if (!detail?.query?.trim()) return;
      submitSearch(detail.query);
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
  }, [openCreatePlaylist, submitSearch]);

  const contextValue = useMemo<AppShellContextValue>(() => ({
    currentView,
    setCurrentView,
    searchQuery,
    setSearchQuery,
    searchSubmitNonce,
    submitSearch,
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
    searchSubmitNonce,
    submitSearch,
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
          hideDesktop={phoneChromeOnly}
        />

        <div className="relative flex-1 flex flex-col h-full overflow-hidden bg-transparent">
          {/* Phone Home sits on the themed background; the night-sky scene lives inside MobileHome. */}
          {currentView === "home" && !phoneChromeOnly && (
            <div className="sm:hidden absolute inset-0 z-0 bg-[var(--background)] pointer-events-none" aria-hidden="true" />
          )}
          {!phoneChromeOnly && (
            <Navbar
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              onSearchSubmit={submitSearch}
              showSearch={currentView === "search"}
              onOpenProfile={openProfile}
              onOpenSearch={() => setCurrentView("search")}
              hideMobile={currentView === "home"}
            />
          )}

          <div className="relative z-10 flex-1 min-h-0 flex flex-col overflow-hidden">
            {children}
          </div>

          <Player embedded hideDesktop={phoneChromeOnly} />
        </div>

        {!phoneChromeOnly && (
          <RightPanel
            isOpen={showRightPanel}
            onClose={() => setShowRightPanel(false)}
          />
        )}

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
