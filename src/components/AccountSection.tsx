"use client";

import React, { useState } from "react";
import { Cloud, CloudOff, LogOut } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import { AuthModal, type AuthMode } from "@/components/AuthModal";

/** Sign in / account card shown in the profile modal and on the Settings page. */
export function AccountSection() {
  const { user, signOut } = usePlayer();
  const [authOpen, setAuthOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const open = (m: AuthMode) => {
    setMode(m);
    setAuthOpen(true);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
    setConfirmingSignOut(false);
  };

  return (
    <>
      {user?.email ? (
        <div className="p-4 bg-emerald-500/[0.07] border border-emerald-500/25 rounded-xl">
          <div className="flex items-start gap-3">
            <Cloud className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">Synced across your devices</p>
              <p className="text-xs text-neutral-400 mt-0.5 truncate">Signed in as {user.email}</p>
              <p className="text-[11px] text-neutral-500 mt-1">
                Liked songs, playlists, history and recommendations follow you to any device you sign in on.
              </p>
            </div>
          </div>

          {confirmingSignOut ? (
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[11px] text-neutral-400">
                Your account keeps everything; this device goes back to a fresh guest.
              </p>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setConfirmingSignOut(false)}
                  disabled={signingOut}
                  className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="px-3 py-1.5 text-xs font-semibold rounded-full bg-rose-500/90 hover:bg-rose-500 text-white cursor-pointer"
                >
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingSignOut(true)}
              className="mt-3 flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          )}
        </div>
      ) : (
        <div className="p-4 bg-neutral-950/60 border border-neutral-800 rounded-xl">
          <div className="flex items-start gap-3">
            <CloudOff className="w-5 h-5 text-neutral-500 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">You&apos;re using Shubhu as a guest</p>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Sign in with your email and a 4-digit PIN to sync your library and history between your laptop and phone.
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => open("signin")}
              className="px-4 py-1.5 bg-emerald-500 hover:bg-[var(--theme-accent-strong)] text-black text-xs font-semibold rounded-full cursor-pointer"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => open("signup")}
              className="px-4 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-white text-xs font-semibold rounded-full cursor-pointer"
            >
              Create account
            </button>
          </div>
        </div>
      )}

      <AuthModal isOpen={authOpen} mode={mode} onModeChange={setMode} onClose={() => setAuthOpen(false)} />
    </>
  );
}
