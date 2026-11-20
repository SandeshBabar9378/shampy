"use client";

import React from "react";
import { Search } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";

interface NavbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  showSearch: boolean;
  onOpenProfile: () => void;
  onOpenSearch: () => void;
}

export function Navbar({ searchQuery, onSearchChange, showSearch, onOpenProfile, onOpenSearch }: NavbarProps) {
  const { user } = usePlayer();

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    // Search is handled reactively through onSearchChange
  };

  return (
    <header className="h-16 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20 bg-neutral-950/80 backdrop-blur-xl border-b border-white/5">
      {/* Mobile: Top left Shubhu logo icon */}
      <div className="sm:hidden flex items-center gap-2 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/shubhu-logo.png"
          alt="Shubhu"
          width={32}
          height={32}
          className="w-8 h-8 shrink-0 object-contain"
        />
        {!showSearch && (
          <span className="font-display font-bold text-white text-lg tracking-tight">Shubhu</span>
        )}
      </div>

      {/* Desktop Search bar */}
      <div className="hidden sm:flex flex-1 max-w-md">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search songs, artists, albums…"
            className="w-full bg-neutral-900/70 text-white placeholder-neutral-400 pl-10 pr-4 py-2 rounded-xl text-sm border border-white/5 focus:border-emerald-500/50 focus:outline-none focus:bg-neutral-900 transition-all shadow-inner"
          />
        </div>
      </div>

      {/* Mobile search bar: takes full width between logo and search button */}
      {showSearch && (
        <form onSubmit={handleSearchSubmit} className="sm:hidden flex-1 mx-2">
          <div className="relative w-full">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search songs, artists, albums…"
              className="w-full bg-neutral-900 text-white placeholder-neutral-500 pl-3 pr-3 py-2 rounded-full text-sm border border-transparent focus:border-neutral-700 focus:outline-none focus:bg-neutral-800 transition-all"
              autoFocus
            />
          </div>
        </form>
      )}

      {/* Right controls */}
      <div className="flex items-center gap-2.5 ml-1 sm:ml-4 shrink-0">
        {/* Desktop: avatar + username button */}
        <button
          onClick={onOpenProfile}
          className="hidden sm:flex items-center gap-2.5 bg-transparent hover:bg-neutral-900/40 border border-transparent hover:border-white/5 pl-1 pr-2 py-1.5 rounded-full transition-colors group cursor-pointer"
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
            className="sm:hidden rounded-full bg-emerald-500 text-black p-2 hover:bg-[var(--theme-accent-strong)] transition-colors cursor-pointer shrink-0"
            title="Search"
          >
            <Search className="w-4 h-4 fill-black" />
          </button>
        )}
      </div>
    </header>
  );
}
