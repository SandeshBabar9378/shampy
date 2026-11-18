"use client";

import React, { useState } from "react";
import { X, Plus, Music } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import { Playlist } from "@/lib/types";

interface CreatePlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (playlistId: string) => void;
  playlist?: Playlist | null;
  onUpdated?: (playlistId: string) => void;
}

export function CreatePlaylistModal({ isOpen, onClose, onCreated, playlist, onUpdated }: CreatePlaylistModalProps) {
  const { createPlaylist, updatePlaylist } = usePlayer();
  const [name, setName] = useState(playlist?.name ?? "");
  const [description, setDescription] = useState(playlist?.description ?? "");
  const [loading, setLoading] = useState(false);

  const isEditing = Boolean(playlist);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    if (playlist) {
      await updatePlaylist(playlist.id, name.trim(), description.trim());
      setLoading(false);
      onClose();
      onUpdated?.(playlist.id);
      return;
    }

    const id = await createPlaylist(name.trim(), description.trim());
    setLoading(false);

    if (id) {
      setName("");
      setDescription("");
      onClose();
      onCreated?.(id);
    }
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

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <Music className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">
              {isEditing ? "Edit playlist details" : "Create Playlist"}
            </h2>
            <p className="text-xs text-neutral-400">
              {isEditing ? "Update the name and description" : "Add songs, listen anytime"}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
              Playlist Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Late Night Vibes"
              required
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
              Description (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add an optional description"
              rows={3}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-neutral-400 hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-emerald-500 hover:bg-[var(--theme-accent-strong)] text-black font-semibold text-sm rounded-full transition-all cursor-pointer flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {loading ? (isEditing ? "Saving..." : "Creating...") : (isEditing ? "Save" : "Create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
