"use client";

/**
 * Hand-built motion glyphs for the Shubhu player chrome.
 *
 * Inline SVG + CSS keyframes only (see the "SHUBHU MOTION SYSTEM" block in
 * globals.css) — deliberately zero dependencies, so the offline PWA shell
 * keeps its bundle small and the animations still run on a plane.
 *
 * How the one-shot animations are triggered
 * ─────────────────────────────────────────
 * Toggle glyphs (shuffle / repeat) own a tiny `data-pulse` attribute on their
 * wrapper. An effect toggles it only when the boolean actually changes, and
 * the CSS keyframes hang off `[data-pulse]`. The heart drives its own
 * `data-burst` from click state instead, so its markup stays hydration-stable.
 * Two payoffs:
 *
 *  1. Navigating to a page where Shuffle is *already* on does not replay the
 *     animation — nothing "changes", so nothing fires.
 *  2. The heart never derives its burst or fill from a value that can differ
 *     between the server render and the first client render.
 *
 * The reflow read (`getBoundingClientRect`) between removing and re-adding the
 * attribute is what makes the browser treat it as a fresh animation even when
 * the toggle flips back within the same frame.
 */

import React, { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Shared trigger                                                      */
/* ------------------------------------------------------------------ */

function useAnimationTrigger(
  value: boolean,
  ref: React.RefObject<HTMLElement | null>,
  attribute: string,
) {
  const previous = useRef(value);

  useEffect(() => {
    // Initial render never animates: the resting pose is the starting pose.
    if (previous.current === value) return;
    previous.current = value;

    const node = ref.current;
    if (!node) return;

    node.removeAttribute(attribute);
    if (!value) return;

    void node.getBoundingClientRect();
    node.setAttribute(attribute, "");
  }, [value, ref, attribute]);
}

/* ------------------------------------------------------------------ */
/* Like (heart with particle burst)                                    */
/* ------------------------------------------------------------------ */

const HEART_PATH =
  "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z";

/**
 * Eight sparks thrown outward at uneven angles, distances and sizes so the
 * burst reads as confetti rather than a mechanical starburst.
 */
const SPARKS = [
  { angle: -90, distance: 18, size: 3.2, delay: 0 },
  { angle: -45, distance: 20, size: 2.4, delay: 26 },
  { angle: 0, distance: 17, size: 3.6, delay: 0 },
  { angle: 45, distance: 21, size: 2.6, delay: 18 },
  { angle: 90, distance: 19, size: 3, delay: 0 },
  { angle: 135, distance: 20, size: 2.4, delay: 30 },
  { angle: 180, distance: 17, size: 3.4, delay: 0 },
  { angle: 225, distance: 19, size: 2.6, delay: 22 },
];

interface AnimatedHeartProps {
  /** Whether the track is currently in Liked Songs. */
  filled: boolean;
  /** Tailwind size class for the glyph itself, e.g. `w-5 h-5`. */
  className?: string;
  /** Optional colour for the sparks; defaults to the inherited text colour. */
  burstColor?: string;
  strokeWidth?: number;
}

export function AnimatedHeart({
  filled,
  className = "w-5 h-5",
  burstColor,
  strokeWidth = 2,
}: AnimatedHeartProps) {
  const wrapperRef = useRef<HTMLSpanElement>(null);

  // `filled` is derived from localStorage-backed player state in some parents:
  // an empty Set on the server, a populated one on the client's first render.
  // Never trust that prop for the hydration render — adopt it after mount.
  const [resolvedFilled, setResolvedFilled] = useState(false);
  useEffect(() => {
    // Defer to an effect callback so the hydration render keeps the safe value.
    const id = window.setTimeout(() => setResolvedFilled(filled), 0);
    return () => window.clearTimeout(id);
  }, [filled]);

  // Burst is click-driven only. It is never derived from `filled`, so the
  // burst <span> cannot appear on one side of hydration and not the other.
  const [burstId, setBurstId] = useState(0);
  const burstCounter = useRef(0);

  useEffect(() => {
    const button = wrapperRef.current?.closest("button");
    if (!button) return;

    const handleClick = () => {
      if (resolvedFilled) return; // burst on like, not on unlike
      burstCounter.current += 1;
      setBurstId(burstCounter.current);
    };

    button.addEventListener("click", handleClick);
    return () => button.removeEventListener("click", handleClick);
  }, [resolvedFilled]);

  useEffect(() => {
    if (burstId === 0) return;
    const timer = window.setTimeout(() => setBurstId(0), 760);
    return () => window.clearTimeout(timer);
  }, [burstId]);

  const burstActive = burstId > 0;

  return (
    <span
      className="shubhu-heart"
      ref={wrapperRef}
      data-burst={burstActive ? "" : undefined}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        className={className}
        fill={resolvedFilled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={HEART_PATH} />
      </svg>

      {burstActive && (
        <span
          key={burstId}
          className="shubhu-heart-burst"
          style={burstColor ? { color: burstColor } : undefined}
        >
          <span className="shubhu-heart-ring" />
          {SPARKS.map((spark, i) => (
            <i
              key={i}
              style={
                {
                  "--a": `${spark.angle}deg`,
                  "--d": `${-spark.distance}px`,
                  "--s": `${spark.size}px`,
                  animationDelay: `${spark.delay}ms`,
                } as React.CSSProperties
              }
            />
          ))}
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Shuffle                                                             */
/* ------------------------------------------------------------------ */

interface ToggleIconProps {
  active: boolean;
  className?: string;
  strokeWidth?: number;
}

export function AnimatedShuffle({
  active,
  className = "w-4 h-4",
  strokeWidth = 2,
}: ToggleIconProps) {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  useAnimationTrigger(active, wrapperRef, "data-pulse");

  return (
    <span className="shubhu-icon-wrap" ref={wrapperRef}>
      <svg
        viewBox="0 0 24 24"
        className={`${className} ${active ? "shubhu-shuffle-on" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Rising lane: bottom-left → top-right */}
        <g className="shubhu-shuffle-lift">
          <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22" />
          <path d="m18 2 4 4-4 4" />
        </g>
        {/* Falling lane: top-left → bottom-right */}
        <g className="shubhu-shuffle-drop">
          <path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2" />
          <path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8" />
          <path d="m18 14 4 4-4 4" />
        </g>
      </svg>

      {active && <span className="shubhu-glow-ring" />}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Loop / Repeat                                                       */
/* ------------------------------------------------------------------ */

export function AnimatedRepeat({
  active,
  className = "w-4 h-4",
  strokeWidth = 2,
}: ToggleIconProps) {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  useAnimationTrigger(active, wrapperRef, "data-pulse");

  return (
    <span className="shubhu-icon-wrap" ref={wrapperRef}>
      <svg
        viewBox="0 0 24 24"
        className={`${className} shubhu-repeat-glyph ${active ? "shubhu-loop-on" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* pathLength=1 normalises every sub-path so one dasharray rule can
            draw all four strokes in lockstep, whatever their real length. */}
        <path pathLength={1} d="m17 2 4 4-4 4" />
        <path pathLength={1} d="M3 11v-1a4 4 0 0 1 4-4h14" />
        <path pathLength={1} d="m7 22-4-4 4-4" />
        <path pathLength={1} d="M21 13v1a4 4 0 0 1-4 4H3" />
      </svg>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Add to playlist                                                     */
/* ------------------------------------------------------------------ */

interface AddToPlaylistIconProps {
  /** True while the "added" confirmation is showing. */
  added: boolean;
  className?: string;
  strokeWidth?: number;
}

export function AnimatedListPlus({
  added,
  className = "w-4 h-4",
  strokeWidth = 2,
}: AddToPlaylistIconProps) {
  return (
    <span className="shubhu-icon-wrap">
      <svg
        viewBox="0 0 24 24"
        className={`${className} shubhu-listplus ${added ? "is-added" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>

      <svg
        viewBox="0 0 24 24"
        className={`${className} shubhu-check ${added ? "is-added" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth + 0.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 12.5 9 17.5 20 6.5" />
      </svg>

      {added && <span className="shubhu-plus-one">+1</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Play / pause                                                        */
/* ------------------------------------------------------------------ */

interface PlayPauseProps {
  playing: boolean;
  className?: string;
}

export function AnimatedPlayPause({ playing, className = "w-4 h-4" }: PlayPauseProps) {
  return (
    <span className="shubhu-playmorph">
      <Play
        className={`${className} fill-current`}
        data-resting={playing ? "hidden" : "shown"}
        aria-hidden="true"
      />
      <Pause
        className={`${className} absolute left-0 top-0 fill-current`}
        data-resting={playing ? "shown" : "hidden"}
        aria-hidden="true"
      />
    </span>
  );
}
