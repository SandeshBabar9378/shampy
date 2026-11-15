"use client";

import React, { useState, useEffect } from "react";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

const LANGUAGES = ["Hindi", "English", "Marathi"] as const;
type Language = (typeof LANGUAGES)[number];

export default function SettingsPage() {
  const router = useRouter();
  const [selectedLanguage, setSelectedLanguage] = useState<Language>("Hindi");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("languagePreference");
        if (saved && LANGUAGES.includes(saved as Language)) {
          setSelectedLanguage(saved as Language);
        }
      } catch {}
    }
  }, []);

  const handleSelectLanguage = (lang: Language) => {
    setSelectedLanguage(lang);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("languagePreference", lang);
        window.dispatchEvent(new Event("storage"));
      } catch {}
    }
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
        {/* Music Preferences Section */}
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Music Preferences</h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Choose your preferred language for recommendations and home playlists.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {LANGUAGES.map((lang) => {
              const isSelected = mounted && selectedLanguage === lang;
              return (
                <button
                  key={lang}
                  onClick={() => handleSelectLanguage(lang)}
                  className={`px-5 py-2 rounded-full text-sm font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? "bg-green-500 text-black font-bold shadow-md shadow-green-500/20"
                      : "border border-neutral-600 text-neutral-300 hover:border-neutral-400 hover:text-white bg-transparent"
                  }`}
                >
                  {lang}
                </button>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
