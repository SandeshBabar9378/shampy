"use client";

import React, { useState } from "react";
import { X, Check, Sparkles } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import { AVATAR_OPTIONS } from "@/lib/avatars";

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UserProfileModal({ isOpen, onClose }: UserProfileModalProps) {
  const { user, updateUser } = usePlayer();
  const [username, setUsername] = useState(user?.username || "");
  const [selectedAvatar, setSelectedAvatar] = useState(user?.avatar || AVATAR_OPTIONS[0]);
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    await updateUser(username.trim(), selectedAvatar);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md p-6 relative shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-neutral-400 hover:text-white p-1 rounded-full cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-6">
          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Your Profile</h2>
            <p className="text-xs text-neutral-400">Zero-login device identity</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Avatar Selector */}
          <div>
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block mb-3">
              Choose Avatar
            </label>
            <div className="flex items-center justify-between gap-2 p-2 bg-neutral-950 rounded-xl border border-neutral-800">
              {AVATAR_OPTIONS.map((av, i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => setSelectedAvatar(av)}
                  className={`w-11 h-11 rounded-full p-0.5 border-2 transition-all cursor-pointer ${
                    selectedAvatar === av ? "border-emerald-500 scale-105" : "border-transparent opacity-60 hover:opacity-100"
                  }`}
                >
                  <img src={av} alt="Option" className="w-full h-full rounded-full bg-neutral-800" />
                </button>
              ))}
            </div>
          </div>

          {/* Username Input */}
          <div>
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
              Display Name / Username
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
          <div className="p-3 bg-neutral-950/60 rounded-lg border border-neutral-850 text-xs">
            <p className="text-neutral-500 font-mono">
              Device ID: <span className="text-neutral-300 font-semibold">{user?.id}</span>
            </p>
            <p className="text-[11px] text-neutral-500 mt-1">
              Your playlists, likes, and settings are automatically synced to this ID without passwords.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
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
      </div>
    </div>
  );
}
