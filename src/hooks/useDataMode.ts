"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  getActiveDataMode as readDataMode,
  setActiveDataMode,
  subscribeDataMode,
  DEFAULT_DATA_MODE,
  type DataMode,
} from "@/lib/dataMode";

export type { DataMode } from "@/lib/dataMode";
export {
  DATA_MODE_STORAGE_KEY,
  DEFAULT_DATA_MODE,
  getActiveDataMode,
} from "@/lib/dataMode";

/**
 * Reads the saved data mode without a hydration-time flash and shares it with
 * every component through a module-level subscriber list. Storage events in
 * other tabs update the same store, so both React and non-React callers agree.
 */
export function useDataMode(): {
  mode: DataMode;
  setMode: (mode: DataMode) => void;
} {
  const mode = useSyncExternalStore(
    subscribeDataMode,
    readDataMode,
    () => DEFAULT_DATA_MODE,
  );

  const setMode = useCallback((next: DataMode) => setActiveDataMode(next), []);

  return { mode, setMode };
}
