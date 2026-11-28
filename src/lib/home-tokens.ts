/**
 * Shared mobile design tokens for phone Home layout.
 * Enforces unified card widths, aspect ratios, gap and padding
 * across all horizontal sections.
 */

export const MOBILE_HOME_TOKENS = {
  /** Vertical gap between shelf sections */
  sectionSpacing: "mt-6",
  /** Shared horizontal carousel row */
  horizontalRow: "flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide",
  /** Standard card wrapper for horizontal rows */
  horizontalCard: "w-[140px] shrink-0",
  /** Artwork container keeping 1:1 square aspect ratio */
  imageContainer: "aspect-square w-full overflow-hidden rounded-xl bg-neutral-900 border border-white/10",
  /** Image inside artwork container: scale removes YouTube 4:3 letterbox bars cleanly */
  image: "h-full w-full object-cover scale-[1.18]",
  /** Text truncations for uniform 2-line card height across all sections */
  titleText: "block truncate text-[12px] font-semibold text-white",
  subtitleText: "block truncate text-[11px] text-white/60",
  /** Artist circle card (uses same 140px card slot for identical horizontal rhythm) */
  artistCard: "w-[140px] shrink-0",
  artistImageContainer: "aspect-square w-[110px] mx-auto overflow-hidden rounded-full bg-neutral-900 border border-white/10",
  /**
   * Bottom padding for MobileHome.
   * Minimal spacing because .app-scroll-pad on <main> already clears the fixed mobile chrome.
   */
  bottomPadding: "pb-6",
} as const;

