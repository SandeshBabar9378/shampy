"use client";

import React from "react";
import { Smartphone, Share, PlusSquare, Check, Download } from "lucide-react";
import { promptInstall, useInstallState } from "@/lib/pwaInstall";

/**
 * Install Shubhu as an app.
 *
 * Rendered inside the Settings "Get the app" card, so it returns only the card
 * body. Every state (installed / promptable / iOS / manual) is preserved.
 */
export function InstallAppCard() {
  const { installed, canPrompt, ios } = useInstallState();

  if (installed) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] p-4">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
          <Check className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Shubhu is installed</p>
          <p className="mt-0.5 text-xs text-neutral-400">
            You&apos;re using it as an app. It opens full-screen with its own icon.
          </p>
        </div>
      </div>
    );
  }

  if (canPrompt) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-400">
            <Download className="h-4 w-4" />
          </span>
          <p className="text-xs text-neutral-400 sm:max-w-sm">
            Opens full-screen like a normal app, with its own icon.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void promptInstall()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-xs font-semibold text-black shadow-lg shadow-emerald-500/20 transition-colors hover:bg-[var(--theme-accent-strong)] cursor-pointer sm:w-auto"
        >
          <Smartphone className="h-4 w-4" />
          Install app
        </button>
      </div>
    );
  }

  if (ios) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
        <ol className="space-y-3 text-xs text-neutral-300">
          <li className="flex items-start gap-3">
            <Share className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <span>
              In Safari, tap the <b className="font-semibold text-white">Share</b> button
            </span>
          </li>
          <li className="flex items-start gap-3">
            <PlusSquare className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <span>
              Choose <b className="font-semibold text-white">Add to Home Screen</b>, then{" "}
              <b className="font-semibold text-white">Add</b>
            </span>
          </li>
        </ol>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
      <p className="text-xs text-neutral-400">
        Open your browser menu (⋮) and choose <b className="font-semibold text-neutral-200">Install app</b> or{" "}
        <b className="font-semibold text-neutral-200">Add to Home screen</b>. This only appears on the https://
        version of the site.
      </p>
    </div>
  );
}
