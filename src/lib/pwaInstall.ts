"use client";

import { useSyncExternalStore } from "react";

// Chrome/Edge/Android fire `beforeinstallprompt` once, early in page load. It
// is captured here at module load so every component (the popup banner, the
// Settings card) can use it later, even after client-side navigation.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installedEvent = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep it for our own button instead of the browser's mini-infobar
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installedEvent = true;
    deferred = null;
    emit();
  });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
// Values that cannot change while the page is open: nothing to subscribe to.
const noSubscribe = () => () => {};

const readStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const readIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  // iPadOS reports itself as a Mac with touch
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export interface InstallState {
  /** Already running as an installed app (or just got installed). */
  installed: boolean;
  /** The browser offered a one-tap install (Chrome/Edge/Android). */
  canPrompt: boolean;
  /** iPhone/iPad: no install API, the user must use Share -> Add to Home Screen. */
  ios: boolean;
}

export function useInstallState(): InstallState {
  const standalone = useSyncExternalStore(noSubscribe, readStandalone, () => false);
  const ios = useSyncExternalStore(noSubscribe, readIos, () => false);
  const canPrompt = useSyncExternalStore(subscribe, () => deferred !== null, () => false);
  const installed = useSyncExternalStore(subscribe, () => installedEvent, () => false);
  return { installed: standalone || installed, canPrompt, ios };
}

/** Shows the browser's install dialog. Resolves true if the user accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  await event.prompt();
  const { outcome } = await event.userChoice;
  // The event can only be used once.
  deferred = null;
  emit();
  return outcome === "accepted";
}
