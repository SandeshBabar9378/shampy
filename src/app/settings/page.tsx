"use client";

import React, { useEffect, useState } from "react";
import {
  ChevronLeft,
  Check,
  Sparkles,
  Palette,
  Smartphone,
  User,
  Fingerprint,
  Settings as SettingsIcon,
  Laptop,
  Crown,
  Copy,
  Cloud,
  Link2,
  Save,
  X,
  Download,
  Share,
  PlusSquare,
  Gauge,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/context/PlayerContext";
import { useTheme, type ThemeId } from "@/context/ThemeContext";
import { useDataMode } from "@/hooks/useDataMode";
import { AVATAR_OPTIONS } from "@/lib/avatars";
import { AccountSection } from "@/components/AccountSection";
import { InstallAppCard } from "@/components/InstallAppCard";
import { promptInstall, useInstallState } from "@/lib/pwaInstall";

const THEMES: { id: ThemeId; name: string; description: string; swatch: string }[] = [
  {
    id: "ocean",
    name: "Ocean Glow",
    description: "Oceanic Teal · Luminous",
    swatch: "var(--swatch-ocean)",
  },
  {
    id: "aurora",
    name: "Aurora Glow",
    description: "Midnight Violet · Atmospheric",
    swatch: "var(--swatch-aurora)",
  },
  {
    id: "graphite",
    name: "Graphite Ivory",
    description: "Muted Greige · Restrained Sage",
    swatch: "var(--swatch-graphite)",
  },
];

const NAV: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "install", label: "Get the app", icon: Smartphone },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "data", label: "Data usage", icon: Gauge },
  { id: "profile", label: "Your profile", icon: Sparkles },
];

const DATA_MODE_OPTIONS: {
  id: "low" | "high";
  name: string;
  description: string;
}[] = [
  {
    id: "low",
    name: "Low (data saver)",
    description: "Small artwork, lighter requests",
  },
  {
    id: "high",
    name: "High (full quality)",
    description: "Best artwork and full results",
  },
];

interface SectionCardProps {
  id: string;
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

function SectionCard({ id, icon, title, description, action, children }: SectionCardProps) {
  return (
    <section id={id} className="scroll-mt-6">
      <div className="shubhu-card-surface overflow-hidden rounded-3xl border shadow-[0_24px_60px_-32px_rgba(var(--mp-shadow-rgb),0.85)] backdrop-blur-sm">
        <div className="flex items-start gap-3.5 border-b border-[var(--theme-border)] p-5 sm:gap-4 sm:p-6">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
            {icon}
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 className="text-base font-semibold tracking-tight text-white sm:text-lg">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-xs leading-relaxed text-neutral-400 sm:text-[13px]">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        <div className="p-5 sm:p-6">{children}</div>
      </div>
    </section>
  );
}

interface MobileCardProps {
  id?: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}

/** Glassmorphism card used only by the mobile Settings layout. */
function MobileCard({ id, icon, title, subtitle, action, children }: MobileCardProps) {
  return (
    <section id={id} className="shubhu-card-surface relative scroll-mt-4 overflow-hidden rounded-3xl border p-4 shadow-[0_16px_40px_-24px_rgba(var(--mp-shadow-rgb),0.9)] ring-1 ring-inset ring-[var(--theme-border)] backdrop-blur-xl">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(var(--mp-ink-rgb),0.055),transparent_55%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-emerald-500/10 blur-2xl"
      />
      <div className="relative z-10 flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/25">
          {icon}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="text-[16px] font-semibold leading-tight tracking-tight text-white">{title}</h2>
          {subtitle ? <p className="mt-1 text-[12px] leading-snug text-neutral-400">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0 self-center">{action}</div> : null}
      </div>
      {children ? <div className="relative z-10 mt-4">{children}</div> : null}
    </section>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, updateUser } = usePlayer();
  const { theme, setTheme } = useTheme();
  const { mode, setMode } = useDataMode();
  const { installed, canPrompt, ios } = useInstallState();
  const [username, setUsername] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState(AVATAR_OPTIONS[0]);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setUsername(user?.username || "");
      setSelectedAvatar(user?.avatar || AVATAR_OPTIONS[0]);
    });
  }, [user?.username, user?.avatar]);

  const handleCancel = () => {
    setUsername(user?.username || "");
    setSelectedAvatar(user?.avatar || AVATAR_OPTIONS[0]);
    setSaved(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    await updateUser(username.trim(), selectedAvatar);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleCopyDeviceId = async () => {
    const value = user?.id;
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // Fallback for browsers/webviews without the async clipboard API.
        const area = document.createElement("textarea");
        area.value = value;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be blocked; the ID stays visible and selectable.
    }
  };

  const currentTheme = THEMES.find((option) => option.id === theme) ?? THEMES[1];

  return (
    <>
      {/* ─── Mobile (below lg) ───────────────────────────────────────────── */}
      <div
        data-theme-region="app"
        className="relative flex min-h-dvh w-full flex-col overflow-hidden bg-[var(--background)] text-white shubhu-radial-bg lg:hidden"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl"
        />

        <header className="shubhu-app-header relative z-10 flex shrink-0 items-center gap-3 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
          <button
            onClick={() => router.back()}
            aria-label="Back"
            title="Back"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-neutral-800/70 bg-neutral-950/50 text-neutral-300 backdrop-blur-xl transition active:scale-95 cursor-pointer"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/25">
            <SettingsIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[20px] font-semibold leading-tight tracking-tight text-white">Settings</h1>
            <p className="truncate text-[12px] text-neutral-400">
              Make Shubhu sound and feel like yours
            </p>
          </div>
        </header>

        <div className="relative z-10 min-h-0 flex-1 overflow-y-auto scroll-smooth">
          <nav aria-label="Settings sections" className="mb-3 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
            {NAV.map(({ id, label, icon: Icon }) => (
              <a
                key={id}
                href={`#${id}`}
                className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-neutral-800/70 bg-neutral-950/50 px-3.5 text-xs font-medium text-neutral-300 transition-colors hover:border-neutral-700 hover:text-white"
              >
                <Icon className="h-3.5 w-3.5 text-emerald-400" />
                {label}
              </a>
            ))}
          </nav>
          <div className="space-y-3.5 px-4 pb-[calc(env(safe-area-inset-bottom)_+_var(--mobile-chrome-height))] pt-1">
            {/* Get the App */}
            <MobileCard
              id="install"
              icon={<Smartphone className="h-5 w-5" />}
              title="Get the App"
              subtitle={
                installed
                  ? "Shubhu is installed on this device."
                  : "Install Shubhu on your home screen for quick access."
              }
              action={
                canPrompt && !installed ? (
                  <button
                    type="button"
                    onClick={() => void promptInstall()}
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3.5 py-2 text-[12px] font-semibold text-white transition active:scale-95 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Install
                  </button>
                ) : undefined
              }
            >
              {installed ? (
                <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] p-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
                    <Check className="h-4 w-4" />
                  </span>
                  <p className="text-[12px] leading-snug text-neutral-300">
                    You&apos;re using it as an app. It opens full-screen with its own icon.
                  </p>
                </div>
              ) : !canPrompt && ios ? (
                <ol className="space-y-2.5 rounded-2xl border border-neutral-800/60 bg-neutral-950/40 p-3 text-[12px] text-neutral-300">
                  <li className="flex items-start gap-2.5">
                    <Share className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>
                      In Safari, tap the <b className="font-semibold text-white">Share</b> button
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <PlusSquare className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>
                      Choose <b className="font-semibold text-white">Add to Home Screen</b>, then{" "}
                      <b className="font-semibold text-white">Add</b>
                    </span>
                  </li>
                </ol>
              ) : !canPrompt ? (
                <p className="rounded-2xl border border-neutral-800/60 bg-neutral-950/40 p-3 text-[12px] leading-relaxed text-neutral-400">
                  Open your browser menu (⋮) and choose{" "}
                  <b className="font-semibold text-neutral-200">Install app</b> or{" "}
                  <b className="font-semibold text-neutral-200">Add to Home screen</b>. This only appears on the
                  https:// version of the site.
                </p>
              ) : null}
            </MobileCard>

            {/* Appearance */}
            <MobileCard id="appearance" icon={<Palette className="h-5 w-5" />} title="Appearance" subtitle="Make Shubhu feel like you">
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Theme</p>
              <div className="grid grid-cols-3 gap-2.5">
                {THEMES.map((option) => {
                  const selected = theme === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setTheme(option.id)}
                      aria-pressed={selected}
                      title={option.description}
                      className="group min-w-0 text-left cursor-pointer"
                    >
                      <span
                        className={`relative block h-[72px] w-full overflow-hidden rounded-2xl border transition-all ${
                          selected
                            ? "border-emerald-400 ring-2 ring-emerald-500/40"
                            : "border-neutral-800/80 group-active:scale-[0.98]"
                        }`}
                      >
                        <span aria-hidden="true" className="absolute inset-0" style={{ background: option.swatch }} />
                        {selected ? (
                          <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-[var(--theme-accent-contrast)] shadow">
                            <Check className="h-3 w-3" />
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-2 flex items-center gap-1.5">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${selected ? "bg-emerald-400" : "bg-neutral-500"}`}
                        />
                        <span
                          className={`truncate text-[11px] font-medium ${selected ? "text-white" : "text-neutral-400"}`}
                        >
                          {option.name}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] text-neutral-500">{currentTheme.description}</p>
            </MobileCard>

            {/* Data usage */}
            <MobileCard
              id="data"
              icon={<Gauge className="h-5 w-5" />}
              title="Data usage"
              subtitle="Choose how much data Shubhu uses"
            >
              <div className="grid grid-cols-2 gap-2.5">
                {DATA_MODE_OPTIONS.map((option) => {
                  const selected = mode === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setMode(option.id)}
                      aria-pressed={selected}
                      title={option.description}
                      className={`relative min-w-0 rounded-2xl border p-3 text-left transition-all cursor-pointer ${
                        selected
                          ? "border-emerald-400 bg-emerald-500/[0.07] ring-2 ring-emerald-500/40"
                          : "border-neutral-800/80 bg-neutral-950/40 active:scale-[0.98]"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${selected ? "bg-emerald-400" : "bg-neutral-500"}`}
                        />
                        <span className={`text-[12px] font-semibold ${selected ? "text-white" : "text-neutral-300"}`}>
                          {option.name}
                        </span>
                      </span>
                      <span className="mt-1 block text-[10px] leading-snug text-neutral-500">
                        {option.description}
                      </span>
                      {selected ? (
                        <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-[var(--theme-accent-contrast)] shadow">
                          <Check className="h-3 w-3" />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </MobileCard>

            {/* Your Profile */}
            <form id="mobile-settings-form" onSubmit={handleSave}>
              <MobileCard
                id="profile"
                icon={<User className="h-5 w-5" />}
                title="Your Profile"
                subtitle={user?.email ? "Synced account" : "Guest on this device"}
              >
                <div className="flex items-center gap-3 rounded-2xl border border-neutral-800/60 bg-neutral-950/40 p-3">
                  <img
                    src={selectedAvatar}
                    alt="Selected avatar"
                    className="h-14 w-14 shrink-0 rounded-2xl border border-neutral-800 bg-neutral-800 object-cover p-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-white">{username.trim() || "Your profile"}</p>
                    <span className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-neutral-800/60 bg-neutral-900/60 px-2.5 py-1 text-[10px] font-medium text-neutral-400">
                      {user?.email ? (
                        <Cloud className="h-3 w-3 shrink-0 text-emerald-400" />
                      ) : (
                        <Link2 className="h-3 w-3 shrink-0 text-emerald-400" />
                      )}
                      <span className="truncate">
                        {user?.email ? "Synced across your devices" : "Library tied to this device"}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                      Choose avatar
                    </label>
                    <span className="text-[11px] text-neutral-600">{AVATAR_OPTIONS.length} options</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 min-[360px]:grid-cols-6">
                    {AVATAR_OPTIONS.map((av, i) => {
                      const active = selectedAvatar === av;
                      return (
                        <button
                          key={av}
                          type="button"
                          onClick={() => setSelectedAvatar(av)}
                          title={`Avatar ${i + 1}`}
                          aria-label={`Avatar ${i + 1}`}
                          aria-pressed={active}
                          className={`relative aspect-square rounded-xl p-0.5 transition-all cursor-pointer ${
                            active
                              ? "bg-emerald-500/10 ring-2 ring-emerald-500"
                              : "ring-1 ring-neutral-800 opacity-70 active:opacity-100"
                          }`}
                        >
                          <img
                            src={av}
                            alt={`Avatar ${i + 1}`}
                            className="h-full w-full rounded-[10px] bg-neutral-800 object-cover"
                          />
                          {active ? (
                            <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-[var(--theme-accent-contrast)] ring-2 ring-[var(--background)]">
                              <Check className="h-3 w-3" />
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4">
                  <label
                    htmlFor="display-name-mobile"
                    className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500"
                  >
                    Display name / username
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                    <input
                      id="display-name-mobile"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. Dilip or BeatMaker"
                      required
                      className="h-12 w-full rounded-2xl border border-neutral-800 bg-neutral-950/60 pl-10 pr-4 text-[14px] text-white placeholder:text-neutral-600 transition-colors focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                </div>
              </MobileCard>
            </form>

            {/* Account */}
            <MobileCard
              icon={<Crown className="h-5 w-5" />}
              title="Account"
              subtitle={user?.email ? "Synced account" : "Sync your library across devices"}
            >
              <div className="[&>div:first-child]:border-0 [&>div:first-child]:bg-transparent [&>div:first-child]:p-0 [&_button]:min-h-11">
                <AccountSection />
              </div>
            </MobileCard>

            {/* Device Information */}
            {!user?.email && (
              <MobileCard icon={<Laptop className="h-5 w-5" />} title="Device Information">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-neutral-500">Device ID</p>
                    <p className="mt-0.5 break-all font-mono text-[12px] font-semibold text-neutral-200 select-all">
                      {user?.id || "Not available"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyDeviceId}
                    aria-label={copied ? "Device ID copied" : "Copy device ID"}
                    title={copied ? "Copied" : "Copy device ID"}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-neutral-800/70 bg-neutral-950/50 text-neutral-400 transition active:scale-95 hover:text-white cursor-pointer"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
                  As a guest, your library is tied to this device only.
                </p>
              </MobileCard>
            )}

            {/* Bottom Actions */}
            <div className="space-y-2.5 pt-1">
              <button
                type="submit"
                form="mobile-settings-form"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,var(--theme-accent),var(--theme-accent-strong))] text-[14px] font-semibold text-[var(--theme-accent-contrast)] shadow-lg shadow-emerald-500/20 transition active:scale-[0.99] cursor-pointer"
              >
                {saved ? (
                  <>
                    <Check className="h-4 w-4" /> Saved!
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" /> Save Changes
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-neutral-800/80 bg-neutral-950/40 text-[14px] font-semibold text-neutral-300 transition active:scale-[0.99] hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" /> Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Desktop ─────────────────────────────────────────────────────── */}
      <div className="hidden h-full min-h-0 lg:block">
        <div
          data-theme-region="app"
          className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--background)] text-white shubhu-radial-bg"
        >
      {/* Top Bar */}
      <header className="shubhu-app-header relative z-20 shrink-0 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:h-[72px] sm:gap-4 sm:px-6">
          <button
            onClick={() => router.back()}
            aria-label="Back"
            title="Back"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-neutral-800/70 bg-neutral-950/50 text-neutral-400 transition-colors hover:border-neutral-700 hover:text-white cursor-pointer"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-white sm:text-xl">Settings</h1>
            <p className="hidden truncate text-xs text-neutral-400 sm:block">
              Manage your profile, appearance and app
            </p>
          </div>

          <div className="ml-auto hidden items-center gap-2.5 rounded-full border border-neutral-800/70 bg-neutral-950/50 py-1 pl-1 pr-3 sm:flex">
            <img
              src={user?.avatar || AVATAR_OPTIONS[0]}
              alt=""
              className="h-7 w-7 rounded-full bg-neutral-800 object-cover"
            />
            <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-300">
              <span className={`h-1.5 w-1.5 rounded-full ${user?.email ? "bg-emerald-400" : "bg-neutral-500"}`} />
              <span className="max-w-[9rem] truncate">{user?.username || "Guest"}</span>
            </span>
          </div>
        </div>
      </header>

      {/* Scrollable Body */}
      <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth">
        <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-5 sm:px-6 sm:pt-8">
          {/* Mobile quick navigation */}
          <nav aria-label="Settings sections" className="mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-none lg:hidden">
            {NAV.map(({ id, label, icon: Icon }) => (
              <a
                key={id}
                href={`#${id}`}
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-neutral-800/70 bg-neutral-950/50 px-3.5 py-2 text-xs font-medium text-neutral-300 transition-colors hover:border-neutral-700 hover:text-white"
              >
                <Icon className="h-3.5 w-3.5 text-emerald-400" />
                {label}
              </a>
            ))}
          </nav>

          <div className="lg:grid lg:grid-cols-[210px_minmax(0,1fr)] lg:items-start lg:gap-8 xl:gap-10">
            {/* Desktop rail */}
            <aside className="hidden lg:block">
              <div className="sticky top-0 space-y-5">
                <nav aria-label="Settings sections">
                  <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    On this page
                  </p>
                  <div className="mt-2 space-y-1">
                    {NAV.map(({ id, label, icon: Icon }) => (
                      <a
                        key={id}
                        href={`#${id}`}
                        className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-neutral-400 transition-colors hover:bg-neutral-900/60 hover:text-white"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-neutral-800/70 bg-neutral-950/40 text-neutral-400 transition-colors group-hover:border-emerald-500/30 group-hover:text-emerald-400">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="truncate">{label}</span>
                      </a>
                    ))}
                  </div>
                </nav>

                <div className="rounded-2xl border border-neutral-800/70 bg-neutral-950/40 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    Current theme
                  </p>
                  <p className="mt-1.5 flex items-center gap-2 text-sm font-semibold text-white">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    {currentTheme.name}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">Applies instantly across Shubhu.</p>
                </div>
              </div>
            </aside>

            {/* Settings content */}
            <main className="min-w-0 space-y-5 sm:space-y-6">
              {/* Get the app */}
              <SectionCard
                id="install"
                icon={<Smartphone className="h-5 w-5" />}
                title="Get the app"
                description="Install Shubhu on your home screen"
              >
                <InstallAppCard />
              </SectionCard>

              {/* Appearance */}
              <SectionCard
                id="appearance"
                icon={<Palette className="h-5 w-5" />}
                title="Appearance"
                description="Choose a theme for Shubhu"
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  {THEMES.map((option) => {
                    const selected = theme === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setTheme(option.id)}
                        aria-pressed={selected}
                        className={`group relative overflow-hidden rounded-2xl border p-2 text-left transition-all cursor-pointer ${
                          selected
                            ? "border-emerald-500/60 bg-emerald-500/[0.07] shadow-lg shadow-emerald-500/10"
                            : "border-neutral-800 bg-neutral-950/40 hover:border-neutral-700 hover:bg-neutral-900/60"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="block h-24 w-full rounded-xl border border-white/10 shadow-inner sm:h-28"
                          style={{ background: option.swatch }}
                        />
                        <span className="mt-3 flex items-start gap-2 px-1 pb-1">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-white">{option.name}</span>
                            <span className="mt-0.5 block truncate text-[11px] text-neutral-400">
                              {option.description}
                            </span>
                          </span>
                          <span
                            aria-hidden="true"
                            className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors ${
                              selected
                                ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                                : "border-neutral-700 text-transparent"
                            }`}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </SectionCard>

              {/* Data usage */}
              <SectionCard
                id="data"
                icon={<Gauge className="h-5 w-5" />}
                title="Data usage"
                description="Choose how much data Shubhu uses"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  {DATA_MODE_OPTIONS.map((option) => {
                    const selected = mode === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setMode(option.id)}
                        aria-pressed={selected}
                        className={`group relative flex items-start gap-3 overflow-hidden rounded-2xl border p-3.5 text-left transition-all cursor-pointer ${
                          selected
                            ? "border-emerald-500/60 bg-emerald-500/[0.07] shadow-lg shadow-emerald-500/10"
                            : "border-neutral-800 bg-neutral-950/40 hover:border-neutral-700 hover:bg-neutral-900/60"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${
                            selected
                              ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                              : "border-neutral-800 bg-neutral-900/60 text-neutral-500"
                          }`}
                        >
                          <Gauge className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-white">{option.name}</span>
                          <span className="mt-0.5 block text-[11px] leading-relaxed text-neutral-400">
                            {option.description}
                          </span>
                        </span>
                        <span
                          aria-hidden="true"
                          className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors ${
                            selected
                              ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                              : "border-neutral-700 text-transparent"
                          }`}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </SectionCard>

              {/* Your Profile */}
              <SectionCard
                id="profile"
                icon={<Sparkles className="h-5 w-5" />}
                title="Your Profile"
                description={user?.email ? "Synced account" : "Guest on this device"}
              >
                <div className="flex items-center gap-4">
                  <img
                    src={selectedAvatar}
                    alt="Selected avatar"
                    className="h-16 w-16 shrink-0 rounded-2xl border border-neutral-800 bg-neutral-800 object-cover p-0.5 shadow-inner sm:h-[72px] sm:w-[72px]"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-white">{username.trim() || "Your profile"}</p>
                    <p className="mt-0.5 truncate text-xs text-neutral-400">
                      {user?.email ?? "Guest on this device"}
                    </p>
                    <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-neutral-500">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${user?.email ? "bg-emerald-400" : "bg-neutral-500"}`}
                      />
                      {user?.email ? "Synced across your devices" : "Library tied to this device"}
                    </p>
                  </div>
                </div>

                <div className="mt-6">
                  <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    Account
                  </p>
                  <AccountSection />
                </div>

                <div className="my-6 h-px bg-neutral-800/60" />

                <form onSubmit={handleSave} className="space-y-6">
                  {/* Avatar Selector */}
                  <div>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                        Choose avatar
                      </label>
                      <span className="text-[11px] text-neutral-600">{AVATAR_OPTIONS.length} options</span>
                    </div>
                    <div className="grid max-w-sm grid-cols-3 gap-2 min-[360px]:grid-cols-6 sm:gap-3">
                      {AVATAR_OPTIONS.map((av, i) => {
                        const active = selectedAvatar === av;
                        return (
                          <button
                            type="button"
                            key={av}
                            onClick={() => setSelectedAvatar(av)}
                            title={`Avatar ${i + 1}`}
                            aria-label={`Avatar ${i + 1}`}
                            aria-pressed={active}
                            className={`group relative aspect-square rounded-xl p-0.5 transition-all cursor-pointer ${
                              active
                                ? "scale-[1.03] bg-emerald-500/10 ring-2 ring-emerald-500 shadow-lg shadow-emerald-500/10"
                                : "ring-1 ring-neutral-800 opacity-70 hover:opacity-100 hover:ring-neutral-600"
                            }`}
                          >
                            <img
                              src={av}
                              alt={`Avatar ${i + 1}`}
                              className="h-full w-full rounded-[10px] bg-neutral-800 object-cover"
                            />
                            {active && (
                              <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-[var(--theme-accent-contrast)] ring-2 ring-[var(--background)]">
                                <Check className="h-3 w-3" />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Username Input */}
                  <div>
                    <label
                      htmlFor="display-name"
                      className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500"
                    >
                      Display name / username
                    </label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                      <input
                        id="display-name"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="e.g. Dilip or BeatMaker"
                        required
                        className="w-full rounded-xl border border-neutral-800 bg-neutral-950/70 py-3 pl-10 pr-4 text-sm text-white placeholder:text-neutral-600 transition-colors focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/15"
                      />
                    </div>
                    <p className="mt-2 text-[11px] text-neutral-500">This is how your name appears across Shubhu.</p>
                  </div>

                  {!user?.email && (
                    <div className="flex items-start gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-neutral-900 text-neutral-400">
                        <Fingerprint className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                          Device ID
                        </p>
                        <p className="mt-1 break-all font-mono text-xs font-semibold text-neutral-300">
                          {user?.id || "Not available"}
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
                          As a guest, your library is tied to this device only.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:items-center sm:justify-end">
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="w-full rounded-full border border-neutral-800 px-5 py-2.5 text-sm font-medium text-neutral-400 transition-colors hover:border-neutral-700 hover:text-white cursor-pointer sm:w-auto"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-[var(--theme-accent-contrast)] shadow-lg shadow-emerald-500/20 transition-all hover:bg-[var(--theme-accent-strong)] cursor-pointer sm:w-auto"
                    >
                      {saved ? (
                        <>
                          <Check className="h-4 w-4" /> Saved!
                        </>
                      ) : (
                        "Save Changes"
                      )}
                    </button>
                  </div>
                </form>
              </SectionCard>
            </main>
          </div>
        </div>
      </div>
    </div>
      </div>
    </>
  );
}
