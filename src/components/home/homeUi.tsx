"use client";

/**
 * Shared building blocks for the phone-Home sections (Steps 2–5).
 * Keeps the header / placeholder styling identical to the approved
 * Made for You section: themed icon + bold white title, muted notes,
 * themed gradient placeholders when a section has no real data yet.
 */

import React from "react";
import type { LucideIcon } from "lucide-react";

export const LAVENDER = "var(--theme-lavender)";

export const PLACEHOLDER_GRADIENTS = [
  "var(--placeholder-gradient-1)",
  "var(--placeholder-gradient-2)",
  "var(--placeholder-gradient-3)",
  "var(--placeholder-gradient-4)",
];

/** Themed icon + bold white title, same style as Made for You. */
export function SectionHeader({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2 px-4">
      <Icon className="shubhu-icon-accent h-5 w-5" />
      <h2 className="text-lg font-bold text-white">{title}</h2>
    </div>
  );
}

/**
 * Empty state: a row of themed gradient placeholders plus a muted note.
 * `cardClassName` carries the same width classes the real cards use, so the
 * placeholders preview the row's rhythm (e.g. "w-[23%]" or "w-[38%]").
 */
export function PlaceholderRow({
  count,
  note,
  cardClassName,
  circle = false,
}: {
  count: number;
  note: string;
  cardClassName: string;
  circle?: boolean;
}) {
  return (
    <>
      <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
        {Array.from({ length: count }).map((_, i) => (
          <span
            key={i}
            className={`aspect-square shrink-0 ${circle ? "rounded-full" : "rounded-xl"} ${cardClassName}`}
            style={{ backgroundImage: PLACEHOLDER_GRADIENTS[i % PLACEHOLDER_GRADIENTS.length] }}
          />
        ))}
      </div>
      <p className="shubhu-text-muted px-4 text-xs">{note}</p>
    </>
  );
}
