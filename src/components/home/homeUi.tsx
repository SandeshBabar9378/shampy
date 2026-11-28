"use client";

/**
 * Shared building blocks for the phone-Home sections (Steps 2–5).
 * Keeps the header / placeholder styling identical to the approved
 * Made for You section: themed icon + bold white title, muted notes,
 * themed gradient placeholders when a section has no real data yet.
 */

import React from "react";
import type { LucideIcon } from "lucide-react";
import { MOBILE_HOME_TOKENS } from "@/lib/home-tokens";

export const LAVENDER = "var(--theme-lavender)";

export const PLACEHOLDER_GRADIENTS = [
  "var(--placeholder-gradient-1)",
  "var(--placeholder-gradient-2)",
  "var(--placeholder-gradient-3)",
  "var(--placeholder-gradient-4)",
];

/** One shelf heading for every phone-Home section: accent icon chip + display title. */
export function SectionHeader({
  icon: Icon,
  title,
  action,
}: {
  icon: LucideIcon;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2 px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full"
          style={{ backgroundColor: "color-mix(in oklab, var(--theme-accent) 16%, transparent)" }}
        >
          <Icon className="h-3.5 w-3.5" style={{ color: "var(--theme-accent-strong)" }} />
        </span>
        <h2 className="truncate font-display text-[19px] font-semibold tracking-tight text-white">{title}</h2>
      </div>
      {action}
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
  cardClassName = MOBILE_HOME_TOKENS.horizontalCard,
  circle = false,
}: {
  count: number;
  note: string;
  cardClassName?: string;
  circle?: boolean;
}) {
  return (
    <>
      <div className={MOBILE_HOME_TOKENS.horizontalRow}>
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
