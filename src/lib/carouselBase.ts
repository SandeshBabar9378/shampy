/**
 * Shared foundation for the two desktop Home carousels.
 *
 * Sizing tokens, navigation state, symmetry maths and reduced-motion rules all
 * live here so the featured chart and the coverflow cannot drift apart. The
 * module is framework-free (no React/DOM imports at runtime) so the existing
 * node:test suite can exercise the exact code the components use.
 */

/** "Charting today" featured carousel. */
export const FEATURED_CAROUSEL = {
  /** Desktop card is square and grows with the stage up to this width. */
  cardMaxWidth: 560,
  /** One fixed thumb size and one fixed gap for the whole strip. */
  thumbSize: 56,
  thumbGap: 12,
  thumbStripPaddingY: 10,
  thumbStripMaxWidth: 560,
  titleLines: 2,
} as const;

/** "Top songs right now" coverflow. */
export const COVERFLOW_CAROUSEL = {
  cardMin: 270,
  cardMax: 340,
  /** Card width as a fraction of the stage's measured *content* width. */
  cardWidthRatio: 0.33,
  /** Fixed card spacing as a fraction of card width, mirrored on both sides. */
  stepRatio: 0.72,
  /** Inner padding + edge fade keep the outermost cards inside the frame. */
  stagePaddingX: 24,
  fadeEdgePercent: 12,
  depth: 70,
  /** Sampled by distance, then mirrored by the card's side of the active index. */
  rotateY: [0, 32, 44] as const,
  scale: [1, 0.9, 0.78] as const,
  opacity: [1, 0.76, 0.44] as const,
  /** Cards farther than this are hidden, so nothing is clipped at the edge. */
  maxVisibleDistance: 2,
  stagePaddingY: 96,
  durationMs: 400,
} as const;

/** Dots / arrows are identical in both carousels and come from one token set. */
export const CAROUSEL_CONTROLS = {
  arrowSize: 44,
  controlGap: 16,
  dotGap: 8,
  dotSize: 8,
  dotActiveWidth: 24,
} as const;

/** Kept identical for both carousels. */
export const CAROUSEL_INTERVAL_MS = 5000;
export const CAROUSEL_MANUAL_PAUSE_MS = 10000;

export interface CarouselState {
  total: number;
  activeIndex: number;
  /** Epoch ms until which manual interaction suppresses auto-advance. */
  pausedUntil: number;
  hovered: boolean;
}

export type CarouselAction =
  | { type: "advance"; now: number }
  | { type: "next"; now: number }
  | { type: "prev"; now: number }
  | { type: "goTo"; index: number; now: number }
  | { type: "pause"; now: number }
  | { type: "hover"; hovered: boolean }
  | { type: "reset"; total: number };

export function wrapCarouselIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return ((index % total) + total) % total;
}

/** Alias used by the fractional drag maths in the coverflow. */
export const wrapCarouselPosition = wrapCarouselIndex;

export function createCarouselState(total: number): CarouselState {
  return {
    total: Math.max(0, total),
    activeIndex: 0,
    pausedUntil: 0,
    hovered: false,
  };
}

export function shouldAutoAdvance(state: CarouselState, now: number): boolean {
  return state.total > 1 && !state.hovered && now >= state.pausedUntil;
}

export function carouselReducer(state: CarouselState, action: CarouselAction): CarouselState {
  switch (action.type) {
    case "advance":
      if (!shouldAutoAdvance(state, action.now)) return state;
      return { ...state, activeIndex: wrapCarouselIndex(state.activeIndex + 1, state.total) };

    case "next":
      if (state.total <= 1) return state;
      return {
        ...state,
        activeIndex: wrapCarouselIndex(state.activeIndex + 1, state.total),
        pausedUntil: action.now + CAROUSEL_MANUAL_PAUSE_MS,
      };

    case "prev":
      if (state.total <= 1) return state;
      return {
        ...state,
        activeIndex: wrapCarouselIndex(state.activeIndex - 1, state.total),
        pausedUntil: action.now + CAROUSEL_MANUAL_PAUSE_MS,
      };

    case "goTo":
      if (state.total <= 1 || !Number.isFinite(action.index)) return state;
      return {
        ...state,
        activeIndex: wrapCarouselIndex(action.index, state.total),
        pausedUntil: action.now + CAROUSEL_MANUAL_PAUSE_MS,
      };

    case "pause":
      return { ...state, pausedUntil: Math.max(state.pausedUntil, action.now + CAROUSEL_MANUAL_PAUSE_MS) };

    case "hover":
      return { ...state, hovered: action.hovered };

    case "reset": {
      const next = createCarouselState(action.total);
      return { ...next, hovered: state.hovered };
    }
  }
}

export function clampCarouselValue(min: number, value: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Linear sample of a per-distance curve so fractional drag positions stay smooth. */
export function sampleCarouselCurve(values: readonly number[], distance: number): number {
  if (distance <= 0) return values[0];
  const clamped = Math.min(distance, values.length - 1);
  const index = Math.floor(clamped);
  const next = Math.min(index + 1, values.length - 1);
  const t = clamped - index;
  return values[index] + (values[next] - values[index]) * t;
}

/**
 * Shortest circular offset from the active position. Equal distances on the
 * left and right produce identical magnitudes once the sign is applied.
 */
export function carouselOffset(index: number, position: number, total: number): number {
  let offset = index - position;
  while (total > 0 && offset > total / 2) offset -= total;
  while (total > 0 && offset < -total / 2) offset += total;
  return offset;
}

export interface CoverflowItemLayout {
  offset: number;
  distance: number;
  visible: boolean;
  isActive: boolean;
  /** Mirrored: same magnitude on both sides, opposite direction. */
  translateX: number;
  rotateY: number;
  /** Distance-only values are identical for +n and -n. */
  scale: number;
  opacity: number;
  translateZ: number;
  zIndex: number;
}

/**
 * The one coverflow formula used for every card. Nothing here depends on the
 * item's side except translateX / rotateY, which are mirrored by `sign(offset)`.
 */
export function getCoverflowItemLayout(
  index: number,
  position: number,
  total: number,
  cardSize: number,
): CoverflowItemLayout {
  const offset = total > 0 ? carouselOffset(index, position, total) : 0;
  const distance = Math.abs(offset);
  const direction = Math.sign(offset);
  const visible = total > 0 && distance <= COVERFLOW_CAROUSEL.maxVisibleDistance;
  const spacing = Math.max(0, cardSize) * COVERFLOW_CAROUSEL.stepRatio;

  return {
    offset,
    distance,
    visible,
    isActive: distance < 0.5,
    translateX: direction * spacing * distance,
    rotateY: direction === 0 ? 0 : -direction * sampleCarouselCurve(COVERFLOW_CAROUSEL.rotateY, distance),
    scale: sampleCarouselCurve(COVERFLOW_CAROUSEL.scale, distance),
    opacity: visible ? sampleCarouselCurve(COVERFLOW_CAROUSEL.opacity, distance) : 0,
    translateZ: -COVERFLOW_CAROUSEL.depth * distance,
    zIndex: 50 - Math.round(distance * 2),
  };
}

/** Active card sits at the horizontal centre of the measured stage. */
export function getCoverflowCenterX(stageWidth: number): number {
  return Math.max(0, stageWidth) / 2;
}

export function getCarouselTransition(
  reducedMotion: boolean,
  durationMs: number = COVERFLOW_CAROUSEL.durationMs,
): string {
  if (reducedMotion) return "none";
  return `transform ${durationMs}ms ease-out, opacity ${durationMs}ms ease-out`;
}

export function getThumbnailScrollOptions(): ScrollIntoViewOptions {
  // `block: "nearest"` is essential: the strip lives inside the scrolling Home
  // viewport and centring vertically would yank the whole page.
  return { inline: "center", block: "nearest", behavior: "smooth" };
}

export interface ThumbnailScrollTarget {
  scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
}

export function centerThumbnail(target: ThumbnailScrollTarget | null | undefined): boolean {
  if (!target || typeof target.scrollIntoView !== "function") return false;
  target.scrollIntoView(getThumbnailScrollOptions());
  return true;
}
