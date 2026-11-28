"use client";

import React from "react";
import { Search } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import { useAppShell } from "@/context/AppShellContext";
import { ShubhuBrand, ShubhuLogo } from "./ShubhuLogo";

interface NavbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSearchSubmit: (q?: string) => void;
  showSearch: boolean;
  onOpenProfile: () => void;
  onOpenSearch: () => void;
  /** Phone Home renders its own header over the night-sky backdrop. */
  hideMobile?: boolean;
}

export function Navbar({ searchQuery, onSearchChange, onSearchSubmit, showSearch, onOpenProfile, onOpenSearch, hideMobile = false }: NavbarProps) {
  const { user } = usePlayer();
  const { sidebarCollapsed } = useAppShell();

  const handleSearchSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    onSearchSubmit(searchQuery);
  };

  return (
    <header className={`shubhu-app-header ${hideMobile ? "hidden sm:flex" : "flex"} h-16 px-4 sm:px-6 items-center justify-between sticky top-0 z-20 backdrop-blur-xl border-b`}>
      {/* Mobile: Top left Shubhu logo icon */}
      <div className="sm:hidden flex items-center gap-2 shrink-0">
        <ShubhuLogo className="w-8 h-8" />
        {!showSearch && (
          <span className="font-display font-bold text-white text-lg tracking-tight">Shubhu</span>
        )}
      </div>

      {/* Desktop brand lives in the header only while the sidebar is collapsed.
          It leaves the flow entirely while expanded: no faded-out copy is left
          behind for the phone scanner to mistake for a blank image frame. */}
      {sidebarCollapsed && (
        <div aria-hidden="true" className="hidden sm:flex shrink-0 items-center">
          <ShubhuBrand />
        </div>
      )}

      {/* Desktop Search bar — width is capped in CSS so it can shrink before
          it ever reaches the profile controls on narrow laptops. */}
      <form onSubmit={handleSearchSubmit} className="hidden sm:flex flex-1 min-w-0 mx-3 lg:mx-6">
        <div className="shubhu-desktop-search relative min-w-0 flex-1">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="global-search"
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSearchSubmit(e.currentTarget.value);
              }
            }}
            placeholder="Search songs, artists, albums…"
            aria-label="Search songs, artists, albums"
            className="w-full rounded-full border border-white/[0.07] bg-white/[0.035] py-2.5 pl-10 pr-4 text-sm text-white placeholder-neutral-400 shadow-inner transition-all hover:border-white/[0.12] focus:border-emerald-500/50 focus:bg-white/[0.06]"
            autoComplete="off"
            enterKeyHint="search"
            name="global-search"
          />
        </div>
      </form>

      {/* Mobile search bar: takes full width between logo and search button */}
      {showSearch && (
        <form onSubmit={handleSearchSubmit} className="sm:hidden flex-1 mx-2">
          <div className="relative w-full">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSearchSubmit(e.currentTarget.value);
                }
              }}
              placeholder="Search songs, artists, albums…"
              className="shubhu-mobile-search-input w-full py-2 pl-3.5 pr-3 text-sm rounded-full"
              autoFocus
              autoComplete="off"
              enterKeyHint="search"
              name="global-search-mobile"
            />
          </div>
        </form>
      )}

      {/* Right controls */}
      <div className="flex items-center gap-2.5 ml-1 sm:ml-4 sm:mr-2 shrink-0">
        {/* Desktop: avatar + username button */}
        <button
          onClick={onOpenProfile}
          className="group hidden cursor-pointer items-center gap-2.5 rounded-full border border-white/[0.07] bg-white/[0.03] py-1 pl-1 pr-3 transition-colors hover:border-white/[0.14] hover:bg-white/[0.06] sm:flex"
        >
          <img
            src={user?.avatar || "https://api.dicebear.com/7.x/bottts/svg?seed=user"}
            alt="Profile"
            className="w-6 h-6 rounded-full border border-neutral-700 bg-neutral-800"
          />
          <span className="text-xs font-semibold text-white group-hover:text-emerald-400">
            {user?.username || "Guest"}
          </span>
        </button>

        {/* Mobile: a small Search icon in the top-right header opens the same
            Search view as the bottom navigation item (via setCurrentView). */}
        {!showSearch && (
          <button
            type="button"
            onClick={onOpenSearch}
            className="sm:hidden w-9 h-9 rounded-full flex items-center justify-center text-white/90 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            title="Search"
            aria-label="Search"
          >
            <Search className="w-5 h-5" />
          </button>
        )}

        {/* Mobile: On search page -> show circular search button (submits search).
            Settings lives in the bottom navigation. */}
        {showSearch && (
          <button
            type="button"
            onClick={() => handleSearchSubmit()}
            className="shubhu-mobile-search-submit sm:hidden shrink-0 cursor-pointer"
            title="Search"
            aria-label="Search"
          >
            <Search className="w-[18px] h-[18px]" strokeWidth={2.2} />
          </button>
        )}
      </div>
    </header>
  );
}
