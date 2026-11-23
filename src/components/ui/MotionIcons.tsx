"use client";

/**
 * Motion glyphs for the phone-only Home rebuild.
 *
 * Inline SVG / spans + the keyframes in MotionIcons.css. Loops animate
 * transform and opacity only, and every animation stops under
 * prefers-reduced-motion (see the media query in the CSS file).
 */

import React, { useId } from "react";
import "./MotionIcons.css";

/* ------------------------------------------------------------------ */
/* Equalizer logo (animates only while music is playing)               */
/* ------------------------------------------------------------------ */

const EQ_BAR_HEIGHTS = [9, 16, 23, 13, 7];

interface EqualizerLogoProps {
  /** Bars dance only while the player is actually playing. */
  playing: boolean;
  className?: string;
}

export function EqualizerLogo({ playing, className = "" }: EqualizerLogoProps) {
  return (
    <span
      className={`shubhu-eq ${className}`}
      data-playing={playing ? "true" : "false"}
      aria-hidden="true"
    >
      {EQ_BAR_HEIGHTS.map((height, i) => (
        <span key={i} className="shubhu-eq-bar" style={{ height }} />
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Moon with a slow opacity-pulsing glow                               */
/* ------------------------------------------------------------------ */

interface MoonGlowProps {
  /** Size/position classes for the core, e.g. "w-16 h-16". */
  className?: string;
}

export function MoonGlow({ className = "w-16 h-16" }: MoonGlowProps) {
  return (
    <span className={`shubhu-moon block ${className}`} aria-hidden="true">
      <span className="shubhu-moon-glow" />
      <span className="shubhu-moon-core" />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Greeting underline swoosh (static, tapers to the right)             */
/* ------------------------------------------------------------------ */

export function GreetingSwoosh({ className = "" }: { className?: string }) {
  const gradientId = useId();
  return (
    <svg
      viewBox="0 0 140 10"
      className={`block h-2.5 w-36 ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: "var(--theme-icon)" }} stopOpacity="1" />
          <stop offset="0.7" style={{ stopColor: "var(--theme-icon)" }} stopOpacity="0.55" />
          <stop offset="1" style={{ stopColor: "var(--theme-icon)" }} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M2 7 C 40 1.5, 92 1.5, 138 4.5 C 92 3.5, 40 5.5, 2 9 Z"
        fill={`url(#${gradientId})`}
      />
    </svg>
  );
}
