"use client";

import React, { useEffect, useState } from "react";
import { ChevronLeft, Check, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/context/PlayerContext";
import { AVATAR_OPTIONS } from "@/lib/avatars";

export default function SettingsPage() {
  const router = useRouter();
  const { user, updateUser } = usePlayer();
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
    <div className="min-h-screen w-full bg-black text-white flex flex-col">
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
                className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm rounded-full transition-all cursor-pointer flex items-center gap-1.5 shadow-lg shadow-emerald-500/20"
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
