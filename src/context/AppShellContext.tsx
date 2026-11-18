"use client";

import { createContext, useContext } from "react";
import type { Track } from "@/lib/types";

export interface AppShellContextValue {
  currentView: string;
  setCurrentView: (view: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  openProfile: () => void;
  openCreatePlaylist: (track?: Track | null) => void;
  showRightPanel: boolean;
  setShowRightPanel: (open: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const AppShellContext = createContext<AppShellContextValue | null>(null);

export function useAppShell(): AppShellContextValue {
  const context = useContext(AppShellContext);
  if (!context) {
    throw new Error("useAppShell must be used inside AppShell");
  }
  return context;
}
