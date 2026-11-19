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
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { usePlayer, type ThemeId } from "@/context/PlayerContext";
import { AVATAR_OPTIONS } from "@/lib/avatars";
import { AccountSection } from "@/components/AccountSection";
import { InstallAppCard } from "@/components/InstallAppCard";

const THEMES: { id: ThemeId; name: string; description: string; swatch: string }[] = [
  {
    id: "ocean",
    name: "Ocean Glow",
    description: "Oceanic Teal · Luminous",
    swatch:
      "radial-gradient(circle at 28% 24%, rgba(103, 232, 249, 0.9) 0%, transparent 30%), radial-gradient(circle at 74% 72%, rgba(45, 212, 191, 0.7) 0%, transparent 34%), linear-gradient(135deg, #041414 0%, #0b3a38 55%, #0a5a55 100%)",
  },
  {
    id: "aurora",
    name: "Aurora Glow",
    description: "Midnight Violet · Atmospheric",
    swatch:
      "radial-gradient(circle at 30% 25%, rgba(216, 180, 254, 0.82) 0%, transparent 30%), radial-gradient(circle at 72% 70%, rgba(139, 92, 246, 0.72) 0%, transparent 34%), linear-gradient(135deg, #0b0812 0%, #2b1b45 55%, #5b3b8c 100%)",
  },
  {
    id: "graphite",
    name: "Graphite Ivory",
    description: "Muted Greige · Restrained Sage",
    swatch:
      "linear-gradient(100deg, #2a2622 0%, #2a2622 40%, #d8d4cb 40%, #d8d4cb 72%, #7c8f82 72%, #7c8f82 100%)",
  },
];

const NAV: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "install", label: "Get the app", icon: Smartphone },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "profile", label: "Your profile", icon: Sparkles },
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
      <div className="overflow-hidden rounded-3xl border border-neutral-800/80 bg-neutral-950/60 shadow-[0_24px_60px_-32px_rgba(0,0,0,0.85)] backdrop-blur-sm">
        <div className="flex items-start gap-3.5 border-b border-neutral-800/60 p-5 sm:gap-4 sm:p-6">
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

export default function SettingsPage() {
  const router = useRouter();
  const { user, updateUser, theme, setTheme } = usePlayer();
  const [username, setUsername] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState(AVATAR_OPTIONS[0]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setUsername(user?.username || "");
    setSelectedAvatar(user?.avatar || AVATAR_OPTIONS[0]);
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

  const currentTheme = THEMES.find((option) => option.id === theme) ?? THEMES[1];

  return (
    <div
      data-theme-region="app"
      className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[var(--background)] text-white shubhu-radial-bg"
    >
      {/* Top Bar */}
      <header className="relative z-20 shrink-0 border-b border-neutral-800/70 bg-neutral-950/70 backdrop-blur-xl">
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
                              <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-black ring-2 ring-[var(--background)]">
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
                        className="w-full rounded-xl border border-neutral-800 bg-neutral-950/70 py-3 pl-10 pr-4 text-sm text-white placeholder:text-neutral-600 transition-colors focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
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
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-black shadow-lg shadow-emerald-500/20 transition-all hover:bg-[var(--theme-accent-strong)] cursor-pointer sm:w-auto"
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
  );
}
