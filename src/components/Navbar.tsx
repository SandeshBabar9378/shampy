"use client";

import React from "react";
import { Search, Settings, Music2 } from "lucide-react";
import Link from "next/link";
import { usePlayer } from "@/context/PlayerContext";

interface NavbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  showSearch: boolean;
  onOpenProfile: () => void;
  onOpenSettings?: () => void;
}

export function Navbar({ searchQuery, onSearchChange, showSearch, onOpenProfile, onOpenSettings }: NavbarProps) {
  const { user } = usePlayer();

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    // Search is handled reactively through onSearchChange
  };

  return (
    <header className="h-16 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20 bg-neutral-950/80 backdrop-blur-md border-b border-neutral-900/40">
      {/* Mobile: Top left Shubhu logo icon */}
      <div className="sm:hidden flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-black shadow-lg shrink-0">
          <Music2 className="w-4 h-4 fill-black" />
        </div>
        {!showSearch && (
          <span className="font-bold text-white text-lg tracking-tight">Shubhu</span>
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
            placeholder="What do you want to play?"
            className="w-full bg-neutral-900 text-white placeholder-neutral-500 pl-10 pr-4 py-2 rounded-full text-sm border border-transparent focus:border-neutral-700 focus:outline-none focus:bg-neutral-800 transition-all"
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
          className="hidden sm:flex items-center gap-2.5 bg-black/60 hover:bg-neutral-900 border border-neutral-800/80 pl-2 pr-3 py-1.5 rounded-full transition-colors group cursor-pointer"
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

        {/* Mobile: On search page -> show circular search button (submits search). On other pages -> show settings gear */}
        {showSearch ? (
          <button
            type="button"
            onClick={() => handleSearchSubmit()}
            className="sm:hidden rounded-full bg-emerald-500 text-black p-2 hover:bg-emerald-400 transition-colors cursor-pointer shrink-0"
            title="Search"
          >
            <Search className="w-4 h-4 fill-black" />
          </button>
        ) : (
          <Link
            href="/settings"
            className="sm:hidden rounded-full border border-neutral-600 p-1.5 text-neutral-400 hover:text-white hover:border-neutral-400 transition-colors cursor-pointer shrink-0"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </Link>
        )}

        {/* Desktop Settings icon */}
        {onOpenSettings ? (
          <button
            onClick={onOpenSettings}
            className="hidden sm:flex rounded-full border border-neutral-600 p-1.5 text-neutral-400 hover:text-white hover:border-neutral-400 transition-colors cursor-pointer"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        ) : (
          <Link
            href="/settings"
            className="hidden sm:flex rounded-full border border-neutral-600 p-1.5 text-neutral-400 hover:text-white hover:border-neutral-400 transition-colors cursor-pointer"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </Link>
        )}
      </div>
    </header>
  );
}
