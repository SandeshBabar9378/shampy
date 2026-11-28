/**
 * Shared data-saving preference.
 *
 * This module deliberately has no React import so non-React code (the download
 * manager, API helpers) can read the current mode safely. React components use
 * `useDataMode`, which subscribes to this store with `useSyncExternalStore`.
 */

export type DataMode = "low" | "high";

export const DATA_MODE_STORAGE_KEY = "shubhu_data_mode";
export const DEFAULT_DATA_MODE: DataMode = "high";

type Listener = (mode: DataMode) => void;

const listeners = new Set<Listener>();
let activeMode: DataMode | null = null;
let storageBound = false;

export function normaliseDataMode(value: string | null | undefined): DataMode {
  return value === "low" ? "low" : DEFAULT_DATA_MODE;
}

function readStoredMode(): DataMode {
  if (typeof window === "undefined") return DEFAULT_DATA_MODE;
  // The pre-paint script in layout.tsx writes this before React hydrates, so
  // non-React callers get the saved mode even before the first effect runs.
  const bootstrap = window.document.documentElement.getAttribute("data-data-mode");
  if (bootstrap === "low" || bootstrap === "high") return bootstrap;
  try {
    return normaliseDataMode(window.localStorage.getItem(DATA_MODE_STORAGE_KEY));
  } catch {
    return DEFAULT_DATA_MODE;
  }
}

function emit(next: DataMode) {
  activeMode = next;
  if (typeof window !== "undefined") {
    window.document.documentElement.setAttribute("data-data-mode", next);
  }
  listeners.forEach((listener) => listener(next));
}

function onStorage(event: StorageEvent) {
  if (event.key !== DATA_MODE_STORAGE_KEY) return;
  emit(normaliseDataMode(event.newValue));
}

/** Current mode for non-React callers, including before the first render. */
export function getActiveDataMode(): DataMode {
  if (activeMode === null) activeMode = readStoredMode();
  return activeMode;
}

/** React subscription. The server snapshot stays at the default for hydration. */
export function subscribeDataMode(listener: Listener): () => void {
  listeners.add(listener);

  if (!storageBound && typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
    storageBound = true;
  }

  // Give the new subscriber the current value without a separate effect.
  listener(getActiveDataMode());

  return () => {
    listeners.delete(listener);
  };
}

export function setActiveDataMode(next: DataMode): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DATA_MODE_STORAGE_KEY, next);
    }
  } catch {
    // Storage can be unavailable; keep the in-memory value for this session.
  }
  emit(next);
}
