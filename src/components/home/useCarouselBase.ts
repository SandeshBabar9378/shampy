"use client";

/**
 * One navigation foundation for both desktop Home carousels.
 *
 * It owns the shared state machine, 5s auto-rotate with a 10s manual pause,
 * reduced-motion detection, swipe position and optional stage measurement.
 * Each carousel only supplies its own visual formula and markup.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { RefObject } from "react";

import {
  CAROUSEL_INTERVAL_MS,
  carouselReducer,
  createCarouselState,
  wrapCarouselPosition,
  type CarouselState,
} from "@/lib/carouselBase";

export interface UseCarouselBaseOptions {
  /** Set false for carousels that should never auto-advance. */
  autoRotate?: boolean;
  /** Measure the stage element with ResizeObserver (coverflow needs this). */
  measureStage?: boolean;
}

export interface CarouselBaseApi {
  state: CarouselState;
  activeIndex: number;
  /** Fractional during a swipe, otherwise the exact active index. */
  position: number;
  isDragging: boolean;
  dragValue: number | null;
  setDragValue: (value: number | null) => void;
  goTo: (index: number) => void;
  next: () => void;
  prev: () => void;
  pause: () => void;
  setHovered: (hovered: boolean) => void;
  reducedMotion: boolean;
  stageRef: RefObject<HTMLDivElement | null>;
  stageSize: { width: number; height: number };
}

export function useCarouselBase(
  total: number,
  { autoRotate = true, measureStage = false }: UseCarouselBaseOptions = {},
): CarouselBaseApi {
  const [state, dispatch] = useReducer(carouselReducer, total, createCarouselState);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [dragValue, setDragValue] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const activeIndex = total > 0 ? state.activeIndex % total : 0;
  const isDragging = dragValue !== null;

  useEffect(() => {
    dispatch({ type: "reset", total });
  }, [total]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const update = () => setTabVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (!measureStage) return;
    const element = stageRef.current;
    if (!element) return;

    const measure = () =>
      setStageSize({ width: element.clientWidth, height: element.clientHeight });
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measureStage, total]);

  // The reducer itself ignores ticks inside the hover / manual-pause window.
  // Reduced motion removes auto-rotation entirely instead of just slowing it.
  useEffect(() => {
    if (!autoRotate || total <= 1 || reducedMotion || !tabVisible || isDragging) return;
    const interval = window.setInterval(() => {
      dispatch({ type: "advance", now: Date.now() });
    }, CAROUSEL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [autoRotate, total, reducedMotion, tabVisible, isDragging]);

  const goTo = useCallback((index: number) => {
    dispatch({ type: "goTo", index, now: Date.now() });
    setDragValue(null);
  }, []);

  const next = useCallback(() => dispatch({ type: "next", now: Date.now() }), []);
  const prev = useCallback(() => dispatch({ type: "prev", now: Date.now() }), []);
  const pause = useCallback(() => dispatch({ type: "pause", now: Date.now() }), []);
  const setHovered = useCallback(
    (hovered: boolean) => dispatch({ type: "hover", hovered }),
    [],
  );

  return {
    state,
    activeIndex,
    position: dragValue === null ? activeIndex : wrapCarouselPosition(dragValue, total),
    isDragging,
    dragValue,
    setDragValue,
    goTo,
    next,
    prev,
    pause,
    setHovered,
    reducedMotion,
    stageRef,
    stageSize,
  };
}
