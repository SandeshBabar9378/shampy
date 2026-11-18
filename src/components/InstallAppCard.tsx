"use client";

import React from "react";
import { Smartphone, Share, PlusSquare, Check } from "lucide-react";
import { promptInstall, useInstallState } from "@/lib/pwaInstall";

/** "Install Shubhu as an app" card for the Settings page. */
export function InstallAppCard() {
  const { installed, canPrompt, ios } = useInstallState();

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
          <Smartphone className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Get the app</h2>
          <p className="text-xs text-neutral-400 mt-0.5">Install Shubhu on your home screen</p>
        </div>
      </div>

      <div className="p-4 bg-neutral-950/60 border border-neutral-800 rounded-xl text-sm">
        {installed ? (
          <p className="flex items-center gap-2 text-emerald-400 font-medium">
            <Check className="w-4 h-4" /> Shubhu is installed. You&apos;re using it as an app.
          </p>
        ) : canPrompt ? (
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-neutral-400">Opens full-screen like a normal app, with its own icon.</p>
            <button
              type="button"
              onClick={() => void promptInstall()}
              className="px-5 py-2 bg-emerald-500 hover:bg-[var(--theme-accent-strong)] text-black text-xs font-semibold rounded-full cursor-pointer shrink-0"
            >
              Install app
            </button>
          </div>
        ) : ios ? (
          <ol className="space-y-2 text-xs text-neutral-300">
            <li className="flex items-center gap-2">
              <Share className="w-4 h-4 text-emerald-400 shrink-0" />
              In Safari, tap the <b className="text-white">Share</b> button
            </li>
            <li className="flex items-center gap-2">
              <PlusSquare className="w-4 h-4 text-emerald-400 shrink-0" />
              Choose <b className="text-white">Add to Home Screen</b>, then <b className="text-white">Add</b>
            </li>
          </ol>
        ) : (
          <p className="text-xs text-neutral-400">
            Open your browser menu (⋮) and choose <b className="text-neutral-200">Install app</b> or{" "}
            <b className="text-neutral-200">Add to Home screen</b>. This only appears on the https:// version of the site.
          </p>
        )}
      </div>
    </section>
  );
}
