"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_THEME,
  isThemeId,
  THEME_STORAGE_KEY,
  type ThemeId,
} from "@/lib/theme";

export type { ThemeId } from "@/lib/theme";

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * The single source of truth for Shubhu's theme.
 *
 * The inline script in app/layout.tsx applies the stored value before first
 * paint and then removes the attribute so React hydrates the exact server
 * markup. After hydration this provider adopts the stored value from
 * localStorage, re-applies data-theme, and drops the temporary stylesheet.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);

  useEffect(() => {
    let storedTheme: string | null = null;
    try {
      storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      // Storage can be unavailable in private browsing; fall back to Aurora.
    }

    const initial = isThemeId(storedTheme) ? storedTheme : DEFAULT_THEME;

    setThemeState(initial);
    document.documentElement.setAttribute("data-theme", initial);
    document.getElementById("shubhu-theme-prepaint")?.remove();

    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const next = isThemeId(event.newValue) ? event.newValue : DEFAULT_THEME;
      document.documentElement.setAttribute("data-theme", next);
      setThemeState(next);
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Keep the in-memory/DOM theme even when storage is blocked.
    }
    document.documentElement.setAttribute("data-theme", next);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
