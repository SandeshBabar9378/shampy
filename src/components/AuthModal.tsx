"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Mail, KeyRound, Loader2 } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";

export type AuthMode = "signin" | "signup";

interface AuthModalProps {
  isOpen: boolean;
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onClose: () => void;
}

const onlyDigits = (value: string) => value.replace(/\D/g, "").slice(0, 4);

const inputClass =
  "w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition-colors";

export function AuthModal(props: AuthModalProps) {
  if (!props.isOpen || typeof document === "undefined") return null;
  // Keyed by mode so switching tabs (or reopening) starts with an empty form.
  return <AuthDialog key={props.mode} {...props} />;
}

function AuthDialog({ mode, onModeChange, onClose }: AuthModalProps) {
  const { signIn, signUp } = usePlayer();
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const isSignup = mode === "signup";
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const canSubmit = emailOk && pin.length === 4 && (!isSignup || confirmPin.length === 4) && !busy;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (isSignup && pin !== confirmPin) {
      setError("The two PINs don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await (isSignup ? signUp : signIn)(email.trim(), pin);
    setBusy(false);
    if (result.ok) {
      setEmail("");
      onClose();
    } else {
      setError(result.error || "Something went wrong.");
      setPin("");
      setConfirmPin("");
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isSignup ? "Create account" : "Sign in"}
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-sm p-6 relative shadow-2xl animate-in fade-in zoom-in-95 duration-150"
      >
        <button
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
          className="absolute right-4 top-4 text-neutral-400 hover:text-white p-1 rounded-full cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-bold text-white">{isSignup ? "Create your account" : "Welcome back"}</h2>
        <p className="text-xs text-neutral-400 mt-1 mb-5">
          {isSignup
            ? "Your email and a 4-digit PIN. Anything you've saved on this device comes with you."
            : "Sign in to get your playlists, likes and history on this device."}
        </p>

        <div className="grid grid-cols-2 gap-1 p-1 mb-5 bg-neutral-950 rounded-xl border border-neutral-800 text-xs font-semibold">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              className={`py-2 rounded-lg transition-colors cursor-pointer ${
                mode === m ? "bg-emerald-500 text-black" : "text-neutral-400 hover:text-white"
              }`}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="auth-email" className="text-xs font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Mail className="w-3.5 h-3.5" /> Email
            </label>
            <input
              id="auth-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputClass}
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="auth-pin" className="text-xs font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <KeyRound className="w-3.5 h-3.5" /> 4-digit PIN
            </label>
            <input
              id="auth-pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete={isSignup ? "new-password" : "current-password"}
              value={pin}
              onChange={(e) => setPin(onlyDigits(e.target.value))}
              placeholder="••••"
              maxLength={4}
              className={`${inputClass} tracking-[0.6em] text-center text-lg`}
            />
          </div>

          {isSignup && (
            <div>
              <label htmlFor="auth-pin2" className="text-xs font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <KeyRound className="w-3.5 h-3.5" /> Confirm PIN
              </label>
              <input
                id="auth-pin2"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="new-password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(onlyDigits(e.target.value))}
                placeholder="••••"
                maxLength={4}
                className={`${inputClass} tracking-[0.6em] text-center text-lg`}
              />
              <p className="text-[11px] text-amber-400/90 mt-2">
                There&apos;s no PIN reset by email, so pick one you&apos;ll remember.
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full py-2.5 bg-emerald-500 hover:bg-[var(--theme-accent-strong)] disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold text-sm rounded-full transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSignup ? "Create account" : "Sign in"}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
