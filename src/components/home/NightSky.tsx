"use client";

/**
 * Faded night-city backdrop for the phone Home header.
 * Pure gradients + simple SVG shapes (no screenshot assets): themed cloudy
 * sky, glowing moon at upper right, dark skyline with a tree on the right
 * edge. The only animation is the moon glow's opacity pulse (MotionIcons.css).
 */

import React from "react";
import { MoonGlow } from "@/components/ui/MotionIcons";

const STARS: { left: string; top: string; opacity: number }[] = [
  { left: "12%", top: "18%", opacity: 0.7 },
  { left: "26%", top: "9%", opacity: 0.5 },
  { left: "38%", top: "26%", opacity: 0.6 },
  { left: "52%", top: "12%", opacity: 0.45 },
  { left: "63%", top: "30%", opacity: 0.5 },
  { left: "8%", top: "42%", opacity: 0.4 },
  { left: "47%", top: "40%", opacity: 0.35 },
  { left: "86%", top: "52%", opacity: 0.4 },
];

export function NightSky() {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 h-[220px] overflow-hidden"
      aria-hidden="true"
    >
      {/* Night sky base */}
      <div
        className="absolute inset-0"
        style={{ background: "var(--theme-night-sky)" }}
      />
      {/* Themed clouds */}
      <div
        className="absolute -left-10 top-6 h-24 w-56 rounded-full blur-2xl"
        style={{ background: "rgba(var(--theme-icon-rgb), 0.25)" }}
      />
      <div
        className="absolute left-1/3 top-2 h-20 w-64 rounded-full blur-2xl"
        style={{ background: "rgba(var(--theme-glow-rgb), 0.2)" }}
      />
      <div
        className="absolute -right-12 top-24 h-24 w-60 rounded-full blur-2xl"
        style={{ background: "rgba(var(--theme-secondary-rgb), 0.25)" }}
      />
      <div
        className="absolute left-8 top-32 h-16 w-48 rounded-full blur-2xl"
        style={{ background: "rgba(var(--theme-secondary-rgb), 0.3)" }}
      />

      {/* Stars */}
      {STARS.map((star, i) => (
        <span
          key={i}
          className="absolute h-0.5 w-0.5 rounded-full bg-white"
          style={{ left: star.left, top: star.top, opacity: star.opacity }}
        />
      ))}

      {/* Glowing moon, upper right */}
      <MoonGlow className="absolute right-6 top-12 h-16 w-16" />

      {/* Far skyline */}
      <svg
        viewBox="0 0 390 110"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-5 h-20 w-full"
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
        className="absolute inset-x-0 bottom-0 h-16 w-full"
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

      {/* Fade the whole scene into the themed page below */}
      <div
        className="absolute inset-x-0 bottom-0 h-12"
        style={{ background: "linear-gradient(180deg, transparent 0%, var(--theme-night-fade) 92%)" }}
      />
    </div>
  );
}
