"use client";

import React, { useEffect, useState } from "react";
import { X, Share, PlusSquare, Download } from "lucide-react";
import { promptInstall, useInstallState } from "@/lib/pwaInstall";

const DISMISS_KEY = "shubhu_install_dismissed_at";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // ask again after a week
const SHOW_DELAY_MS = 2500;

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return Boolean(at) && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

/**
 * Popup shown on arrival when Shubhu isn't installed yet.
 *  - Chrome/Edge/Android: one-tap "Install" button.
 *  - iPhone/iPad (no install API): short Share -> Add to Home Screen steps.
 * Other browsers (e.g. desktop Firefox) can't install, so nothing is shown.
 */
export function InstallPrompt() {
  const { installed, canPrompt, ios } = useInstallState();
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Wait a moment after load so the popup doesn't fight the first paint.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!recentlyDismissed()) setReady(true);
    }, SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!ready || dismissed || installed || !(canPrompt || ios)) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setDismissed(true);
  };

  const install = async () => {
    const accepted = await promptInstall();
    // Accepted: the browser reports `appinstalled` and this hides itself.
    // Declined: don't nag again right away.
    if (!accepted) dismiss();
  };

  return (
    <div
      role="dialog"
      aria-label="Install Shubhu"
      className="fixed z-[80] left-3 right-3 bottom-[calc(var(--mobile-chrome-height)+0.75rem)] top-auto sm:left-auto sm:right-5 sm:top-5 sm:bottom-auto sm:w-[22rem] rounded-2xl border border-white/10 bg-neutral-900/95 backdrop-blur-xl shadow-2xl shadow-black/60 p-4 animate-in fade-in duration-300"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Close"
        className="absolute right-1.5 top-1.5 flex h-11 w-11 items-center justify-center rounded-full text-neutral-400 hover:text-white cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-3 pr-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={44} height={44} className="w-11 h-11 rounded-xl shrink-0 shadow-lg shadow-violet-500/20" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">Install Shubhu</p>
          <p className="text-xs text-neutral-400 mt-0.5">
            {canPrompt
              ? "Get the app: opens full-screen from your home screen, with lock-screen controls."
              : "Add it to your home screen to use it like an app."}
          </p>
        </div>
      </div>

      {canPrompt ? (
        <div className="mt-3 flex items-center justify-end gap-2">
          <button type="button" onClick={dismiss} className="inline-flex min-h-11 items-center px-3 text-xs text-neutral-400 hover:text-white cursor-pointer">
            Not now
          </button>
          <button
            type="button"
            onClick={install}
            className="inline-flex min-h-11 items-center gap-1.5 px-4 bg-[var(--theme-accent)] hover:bg-[var(--theme-accent-strong)] text-[var(--theme-accent-contrast)] text-xs font-semibold rounded-full cursor-pointer shadow-lg shadow-[0_18px_45px_-20px_rgba(var(--theme-accent-rgb),0.5)]"
          >
            <Download className="w-3.5 h-3.5" /> Install
          </button>
        </div>
      ) : (
        <>
          <ol className="mt-3 space-y-1.5 text-xs text-neutral-300">
            <li className="flex items-center gap-2">
              <Share className="w-4 h-4 text-emerald-400 shrink-0" />
              Tap the <b className="text-white">Share</b> button in Safari
            </li>
            <li className="flex items-center gap-2">
              <PlusSquare className="w-4 h-4 text-emerald-400 shrink-0" />
              Choose <b className="text-white">Add to Home Screen</b>
            </li>
          </ol>
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={dismiss} className="inline-flex min-h-11 items-center px-4 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold rounded-full cursor-pointer">
              Got it
            </button>
          </div>
        </>
      )}
    </div>
  );
}
