"use client";

import React, { useState, useEffect, useRef } from "react";
import { Mic2, X, Music2 } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import { fetchSyncedLyrics, LyricLine } from "@/lib/lyrics";
import { classifyScript, extractBrackets } from "@/lib/script";

interface LyricsPanelProps {
  onClose?: () => void;
  variant?: "mobile";
}

interface TransliterationResponse {
  transliterations?: Record<string, string>;
}

export function LyricsPanel({ onClose, variant }: LyricsPanelProps) {
  const { currentTrack, currentTime, duration, seek } = usePlayer();
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [plainText, setPlainText] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [instrumental, setInstrumental] = useState<boolean>(false);
  const [transliterations, setTransliterations] = useState<Record<string, string>>({});
  const activeLineRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!currentTrack) return;
    let isCancelled = false;
    setLoading(true);
    setLines([]);
    setPlainText(null);
    setInstrumental(false);
    setTransliterations({});

    fetchSyncedLyrics(currentTrack.title, currentTrack.artist, currentTrack.duration || duration, currentTrack.album)
      .then(async (res) => {
        if (isCancelled) return;
        setLines(res.lines);
        setPlainText(res.plainText);
        setInstrumental(res.instrumental);
        setLoading(false);

        if (res.lines.length > 0) {
          const songKey = `shubhu_translit_v3_${currentTrack.title}_${currentTrack.artist}`.toLowerCase();
          try {
            const cached = localStorage.getItem(songKey);
            if (cached) {
              const parsedCache = JSON.parse(cached) as Record<string, string>;
              if (!isCancelled) setTransliterations(parsedCache);
              return;
            }
          } catch {
            // ignore localStorage error
          }

          // Step 1: Filter and extract bracketed lines.
          // Only lines whose inner text is "roman" should be sent to /api/transliterate.
          // Lines classified as "devanagari" or "other" get NO second line.
          const lineItems = res.lines.map((l) => {
            const trimmed = l.text.trim();
            const extracted = extractBrackets(trimmed);
            const script = classifyScript(extracted.innerText);
            return {
              original: trimmed,
              extracted,
              script,
            };
          });

          const romanItems = lineItems.filter((item) => item.original && item.script === "roman");
          const uniqueInnerTexts = Array.from(
            new Set(romanItems.map((item) => item.extracted.innerText).filter(Boolean))
          );

          if (uniqueInnerTexts.length === 0) return;

          try {
            const translitRes = await fetch("/api/transliterate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ lines: uniqueInnerTexts }),
            });
            if (!translitRes.ok) return;
            const translitData = (await translitRes.json()) as TransliterationResponse;
            if (translitData.transliterations && !isCancelled) {
              const innerTranslitMap = translitData.transliterations;
              const fullLineTranslitMap: Record<string, string> = {};

              // Map back to the original line, applying surrounding brackets if present
              for (const item of romanItems) {
                const transliteratedInner = innerTranslitMap[item.extracted.innerText];
                if (transliteratedInner) {
                  const finalLine = item.extracted.hasBrackets
                    ? `${item.extracted.prefix}${transliteratedInner}${item.extracted.suffix}`
                    : transliteratedInner;
                  fullLineTranslitMap[item.original] = finalLine;
                }
              }

              setTransliterations(fullLineTranslitMap);
              try {
                localStorage.setItem(songKey, JSON.stringify(fullLineTranslitMap));
              } catch {
                // ignore localStorage quota error
              }
            }
          } catch {
            // ignore transliteration network error
          }
        }
      })
      .catch(() => {
        if (!isCancelled) setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [currentTrack, duration]);

  // Find current line index based on audio currentTime
  let activeIndex = -1;
  if (lines.length > 0) {
    for (let i = 0; i < lines.length; i++) {
      if (currentTime >= lines[i].time) {
        activeIndex = i;
      } else {
        break;
      }
    }
  }

  // Auto-scroll active line into view smoothly
  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeIndex]);

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 w-80 md:w-96 h-96 flex flex-col shadow-2xl text-white select-none">
      <div className="flex items-center justify-between mb-3 border-b border-neutral-800 pb-2">
        <div className="flex items-center gap-2">
          <Mic2 className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold truncate max-w-[200px]">
            Lyrics: {currentTrack?.title}
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-neutral-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div
        className={`flex-1 overflow-y-auto overflow-x-hidden space-y-4 pr-1 text-center py-4 ${
          variant === "mobile" ? "lyrics-scroll touch-pan-y" : ""
        }`}
      >
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-neutral-400 text-xs gap-2">
            <Music2 className="w-6 h-6 text-emerald-400 animate-pulse" />
            <span>Loading lyrics...</span>
          </div>
        ) : instrumental ? (
          <div className="h-full flex flex-col items-center justify-center text-neutral-400 text-sm gap-2">
            <Music2 className="w-8 h-8 text-neutral-500" />
            <span className="font-semibold text-neutral-300">Instrumental Track</span>
            <span className="text-xs text-neutral-500">No vocals in this song</span>
          </div>
        ) : lines.length > 0 ? (
          lines.map((line, idx) => {
            const isActive = idx === activeIndex;
            const translit = transliterations[line.text.trim()];
            return (
              <div
                key={`${line.time}-${idx}`}
                ref={isActive ? activeLineRef : null}
                onClick={() => seek(line.time)}
                className={`transition-all duration-300 px-3 py-1.5 rounded-lg text-sm md:text-base font-semibold leading-relaxed cursor-pointer break-words whitespace-normal ${
                  isActive
                    ? "text-emerald-400 scale-105 bg-white/5 font-bold"
                    : "text-neutral-500 hover:text-neutral-300 hover:bg-white/5"
                }`}
              >
                <div>{line.text}</div>
                {translit && (
                  <div
                    className={`text-xs md:text-sm font-normal tracking-wide mt-0.5 break-words whitespace-normal ${
                      isActive ? "text-emerald-300/80" : "text-neutral-500/80"
                    }`}
                  >
                    {translit}
                  </div>
                )}
              </div>
            );
          })
        ) : plainText ? (
          <div className="text-left px-2">
            <p className="text-[10px] uppercase font-semibold tracking-wider text-neutral-500 mb-2">
              Plain lyrics, no sync
            </p>
            <div className="text-xs text-neutral-300 whitespace-pre-line break-words leading-relaxed">
              {plainText}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-neutral-400 text-sm gap-1">
            <Mic2 className="w-8 h-8 text-neutral-600 mb-1" />
            <p className="font-semibold text-neutral-400">Lyrics not available</p>
            <p className="text-xs text-neutral-600">Could not find synchronized lyrics for this song</p>
          </div>
        )}
      </div>
    </div>
  );
}
