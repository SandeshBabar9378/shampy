"use client";

/**
 * Faded city backdrop for the phone Home sky strip.
 * Pure gradients + simple SVG shapes (no screenshot assets): themed cloudy
 * sky, stars, and a dark skyline with a tree on the right edge. Every size
 * below is a percentage of the strip, so a shorter strip scales the whole
 * scene instead of cropping it. The single time-based sun/moon lives in
 * HeroSky (MobileHome), so this backdrop draws no moon of its own. While the
 * sun is up (isDay) the stars are dropped, so daytime never shows both.
 */

import React from "react";

const STARS: { left: string; top: string; opacity: number }[] = [
  { left: "12%", top: "16%", opacity: 0.7 },
  { left: "26%", top: "8%", opacity: 0.5 },
  { left: "38%", top: "24%", opacity: 0.6 },
  { left: "52%", top: "10%", opacity: 0.45 },
  { left: "63%", top: "28%", opacity: 0.5 },
  { left: "8%", top: "40%", opacity: 0.4 },
  { left: "47%", top: "38%", opacity: 0.35 },
  { left: "86%", top: "50%", opacity: 0.4 },
];

export function NightSky({ isDay = false }: { isDay?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Night sky base */}
      <div className="absolute inset-0" style={{ background: "var(--theme-night-sky)" }} />

      {/* Themed glow clouds — percentages keep them in proportion. */}
      <div
        className="absolute -left-[12%] top-[4%] h-[30%] w-[70%] rounded-full blur-2xl"
        style={{ background: "rgba(var(--theme-icon-rgb), 0.28)" }}
      />
      <div
        className="absolute left-[28%] top-[0%] h-[24%] w-[72%] rounded-full blur-2xl"
        style={{ background: "rgba(var(--theme-glow-rgb), 0.24)" }}
      />
      <div
        className="absolute -right-[16%] top-[26%] h-[32%] w-[74%] rounded-full blur-2xl"
        style={{ background: "rgba(var(--theme-secondary-rgb), 0.3)" }}
      />
      <div
        className="absolute left-[6%] top-[44%] h-[22%] w-[62%] rounded-full blur-2xl"
        style={{ background: "rgba(var(--theme-secondary-rgb), 0.26)" }}
      />

      {/* Stars — only on the night half of the day. */}
      {!isDay &&
        STARS.map((star, i) => (
          <span
            key={i}
            className="absolute h-0.5 w-0.5 rounded-full bg-white"
            style={{ left: star.left, top: star.top, opacity: star.opacity }}
          />
        ))}

      {/* Far skyline */}
      <svg
        viewBox="0 0 390 110"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-[32%] w-full"
      >
        <g style={{ fill: "var(--theme-skyline-far)" }} opacity="0.85">
          <rect x="0" y="46" width="26" height="64" />
          <rect x="30" y="30" width="20" height="80" />
          <rect x="54" y="52" width="30" height="58" />
          <rect x="88" y="22" width="16" height="88" />
          <rect x="108" y="44" width="26" height="66" />
          <rect x="138" y="34" width="18" height="76" />
          <rect x="160" y="56" width="30" height="54" />
          <rect x="194" y="26" width="14" height="84" />
          <rect x="212" y="48" width="26" height="62" />
          <rect x="242" y="38" width="20" height="72" />
          <rect x="266" y="58" width="28" height="52" />
          <rect x="298" y="30" width="16" height="80" />
          <rect x="318" y="50" width="26" height="60" />
          <rect x="348" y="40" width="20" height="70" />
          <rect x="372" y="56" width="18" height="54" />
        </g>
      </svg>

      {/* Near skyline + tree silhouette on the right edge */}
      <svg
        viewBox="0 0 390 90"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-[24%] w-full"
      >
        <g style={{ fill: "var(--theme-skyline-near)" }}>
          <rect x="0" y="38" width="22" height="52" />
          <rect x="26" y="24" width="18" height="66" />
          <rect x="48" y="46" width="26" height="44" />
          <rect x="78" y="32" width="14" height="58" />
          <rect x="96" y="50" width="24" height="40" />
          <rect x="124" y="28" width="16" height="62" />
          <rect x="144" y="44" width="24" height="46" />
          <rect x="172" y="36" width="18" height="54" />
          <rect x="194" y="52" width="26" height="38" />
          <rect x="224" y="30" width="14" height="60" />
          <rect x="242" y="46" width="22" height="44" />
          <rect x="268" y="38" width="18" height="52" />
          <rect x="290" y="54" width="24" height="36" />
          {/* Tree: trunk + canopy blobs */}
          <rect x="352" y="46" width="5" height="44" />
          <circle cx="354" cy="38" r="14" />
          <circle cx="342" cy="46" r="10" />
          <circle cx="366" cy="46" r="10" />
          <circle cx="354" cy="26" r="9" />
          <rect x="318" y="48" width="16" height="42" />
          <rect x="374" y="42" width="16" height="48" />
        </g>
      </svg>

      {/* Fade the scene into the themed page below */}
      <div
        className="absolute inset-x-0 bottom-0 h-[20%]"
        style={{ background: "linear-gradient(180deg, transparent 0%, var(--theme-night-fade) 92%)" }}
      />
    </div>
  );
}
