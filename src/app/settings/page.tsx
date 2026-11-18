"use client";

import React, { useEffect, useState } from "react";
import { ChevronLeft, Check, Sparkles, Palette } from "lucide-react";
import { useRouter } from "next/navigation";
import { usePlayer, type ThemeId } from "@/context/PlayerContext";
import { AVATAR_OPTIONS } from "@/lib/avatars";

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

  return (
    <div data-theme-region="app" className="min-h-screen w-full bg-[var(--background)] text-white flex flex-col">
      {/* Top Bar */}
      <header className="h-16 px-4 sm:px-6 flex items-center gap-4 border-b border-neutral-900 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-10">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors cursor-pointer"
          title="Back"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-bold text-white">Settings</h1>
      </header>

      {/* Settings Body */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-6 py-8 space-y-8">
        {/* Appearance Section */}
        <section className="space-y-5">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Appearance</h2>
              <p className="text-xs text-neutral-400 mt-0.5">Choose a theme for Shubhu</p>
            </div>
          </div>

          <div className="space-y-3">
            {THEMES.map((option) => {
              const selected = theme === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setTheme(option.id)}
                  aria-pressed={selected}
                  className={`w-full flex items-center gap-4 p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                    selected
                      ? "border-emerald-500/60 bg-emerald-500/[0.07] shadow-lg shadow-emerald-500/5"
                      : "border-neutral-800 bg-neutral-950/60 hover:bg-neutral-900/60 hover:border-neutral-700"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="w-14 h-14 rounded-xl border border-white/10 shadow-inner shrink-0"
                    style={{ background: option.swatch }}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-white truncate">
                      {option.name}
                    </span>
                    <span className="block text-xs text-neutral-400 mt-0.5 truncate">
                      {option.description}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                      selected ? "border-emerald-400 bg-emerald-500/20" : "border-neutral-600"
                    }`}
                  >
                    {selected && <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Your Profile Section */}
        <section className="space-y-5">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Your Profile</h2>
              <p className="text-xs text-neutral-400 mt-0.5">Zero-login device identity</p>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            {/* Avatar Selector */}
            <div>
              <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block mb-3">
                Choose avatar
              </label>
              <div className="flex items-center justify-between gap-2 p-2 bg-neutral-950 rounded-xl border border-neutral-800">
                {AVATAR_OPTIONS.map((av, i) => (
                  <button
                    type="button"
                    key={av}
                    onClick={() => setSelectedAvatar(av)}
                    title={`Avatar ${i + 1}`}
                    className={`w-11 h-11 rounded-full p-0.5 border-2 transition-all cursor-pointer ${
                      selectedAvatar === av
                        ? "border-emerald-500 scale-105"
                        : "border-transparent opacity-60 hover:opacity-100"
                    }`}
                  >
                    <img src={av} alt="Avatar option" className="w-full h-full rounded-full bg-neutral-800" />
                  </button>
                ))}
              </div>
            </div>

            {/* Username Input */}
            <div>
              <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
                Display name / username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. Dilip or BeatMaker"
                required
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            {/* Device ID information */}
            <div className="p-3 bg-neutral-950/60 rounded-lg border border-neutral-800 text-xs">
              <p className="text-neutral-500 font-mono">
                Device ID:{" "}
                <span className="text-neutral-300 font-semibold">{user?.id || "Not available"}</span>
              </p>
              <p className="text-[11px] text-neutral-500 mt-1">
                Your playlists, likes, and settings are automatically synced to this ID without passwords.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 text-sm text-neutral-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-emerald-500 hover:bg-[var(--theme-accent-strong)] text-black font-semibold text-sm rounded-full transition-all cursor-pointer flex items-center gap-1.5 shadow-lg shadow-emerald-500/20"
              >
                {saved ? (
                  <>
                    <Check className="w-4 h-4" /> Saved!
                  </>
                ) : (
                  "Save Changes"
                )}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
