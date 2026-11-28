"use client";

/**
 * Featured chart carousel for the top of Home.
 *
 * Desktop sizing, thumbnails, dots and arrows all come from the shared carousel
 * tokens. Navigation, auto-rotate and reduced-motion come from the shared hook.
 */

import React, { useEffect, useRef } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Flame, Play, Sparkles } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import type { Track } from "@/lib/types";
import { getTrackArtworkFallbackUrl, getTrackArtworkUrl } from "@/lib/artwork";
import { useDataMode } from "@/hooks/useDataMode";
import {
  CAROUSEL_CONTROLS,
  FEATURED_CAROUSEL,
  centerThumbnail,
} from "@/lib/carouselBase";
import { useCarouselBase } from "@/components/home/useCarouselBase";

interface ChartHeroCarouselProps {
  tracks: Track[];
  className?: string;
}

interface DragState {
  pointerId: number | null;
  startX: number;
  startY: number;
  horizontal: boolean | null;
  dx: number;
}

const emptyDrag: DragState = {
  pointerId: null,
  startX: 0,
  startY: 0,
  horizontal: null,
  dx: 0,
};

/** The featured carousel is desktop-only; phone Home keeps its own layout. */
export function ChartHeroCarousel({ tracks, className = "" }: ChartHeroCarouselProps) {
  const { playTrack } = usePlayer();
  const { mode } = useDataMode();
  const playOptions = mode === "low" ? { appendSimilar: false } : undefined;

  const total = tracks.length;
  const {
    activeIndex,
    isDragging,
    dragValue,
    setDragValue,
    goTo,
    next,
    prev,
    pause,
    setHovered,
  } = useCarouselBase(total);
  const activeTrack = tracks[activeIndex];

  const dragRef = useRef<DragState>({ ...emptyDrag });
  const suppressClickRef = useRef(false);
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // `block: "nearest"` keeps this horizontal centring from scrolling the page.
  useEffect(() => {
    if (total > 0) centerThumbnail(thumbRefs.current[activeIndex]);
  }, [activeIndex, total]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (total <= 1) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      horizontal: null,
      dx: 0,
    };
    suppressClickRef.current = false;
    setDragValue(0);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (drag.horizontal === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      drag.horizontal = Math.abs(dx) > Math.abs(dy) * 1.15;
      if (!drag.horizontal) {
        dragRef.current = { ...emptyDrag };
        setDragValue(null);
        return;
      }
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // Synthetic/cancelled pointers cannot be captured; dragging still works.
      }
    }

    event.preventDefault();
    drag.dx = dx;
    if (Math.abs(dx) > 6) suppressClickRef.current = true;
    setDragValue(Math.max(-140, Math.min(140, dx)));
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag.pointerId !== event.pointerId) return;

    if (drag.horizontal && Math.abs(drag.dx) > 40) {
      if (drag.dx < 0) next();
      else prev();
    }
    dragRef.current = { ...emptyDrag };
    setDragValue(null);
  };

  const playActive = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    pause();
    void playTrack(activeTrack, tracks, playOptions);
  };

  if (!activeTrack) return null;

  const artwork = (track: Track) => getTrackArtworkUrl(track, "hq", mode);

  return (
    <section
      data-edge-free
      aria-label="Music chart right now"
      className={`relative hidden overflow-hidden rounded-[28px] border border-white/[0.06] shadow-2xl theme-dark-surface md:block ${className}`}
      style={{
        background:
          "radial-gradient(120% 130% at 50% 115%, var(--carousel-glow) 0%, var(--carousel-base) 55%, var(--carousel-base) 100%)",
        ["--featured-card-max" as string]: `${FEATURED_CAROUSEL.cardMaxWidth}px`,
        ["--featured-thumb-size" as string]: `${FEATURED_CAROUSEL.thumbSize}px`,
        ["--featured-thumb-gap" as string]: `${FEATURED_CAROUSEL.thumbGap}px`,
        ["--featured-thumb-pad-y" as string]: `${FEATURED_CAROUSEL.thumbStripPaddingY}px`,
        ["--featured-strip-max" as string]: `${FEATURED_CAROUSEL.thumbStripMaxWidth}px`,
        ["--carousel-control-gap" as string]: `${CAROUSEL_CONTROLS.controlGap}px`,
        ["--carousel-dot-gap" as string]: `${CAROUSEL_CONTROLS.dotGap}px`,
        ["--carousel-dot-size" as string]: `${CAROUSEL_CONTROLS.dotSize}px`,
        ["--carousel-dot-active" as string]: `${CAROUSEL_CONTROLS.dotActiveWidth}px`,
        ["--carousel-arrow-size" as string]: `${CAROUSEL_CONTROLS.arrowSize}px`,
      } as React.CSSProperties}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Ambient artwork tint + the existing dark carousel veil. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("${artwork(activeTrack)}")`,
            backgroundSize: "140% 140%",
            backgroundPosition: "center",
            filter: "blur(70px) saturate(1.4)",
            opacity: 0.35,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, var(--carousel-veil-top) 0%, var(--carousel-veil-mid) 42%, var(--carousel-veil-bottom) 100%)",
          }}
        />
        <div className="absolute -bottom-24 left-1/2 h-64 w-[70%] -translate-x-1/2 rounded-full bg-fuchsia-600/20 blur-[90px]" />
        <div className="absolute -right-24 top-1/2 h-[70%] w-64 -translate-y-1/2 rounded-full bg-blue-600/15 blur-[90px]" />
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-start justify-between gap-4 px-4 pt-4 sm:px-6 sm:pt-6">
        <div>
          <p
            className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em]"
            style={{ color: "var(--theme-accent-strong)" }}
          >
            <Flame className="h-3.5 w-3.5" />
            Charting today
          </p>
          <h2 className="font-display text-xl font-semibold tracking-tight text-white sm:text-2xl">
            Music chart right now
          </h2>
          <p className="mt-1 text-[11px] text-neutral-400 sm:text-xs">Ranked by real-time stream velocity</p>
        </div>
        <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-[11px] font-medium text-white/80 backdrop-blur-md sm:inline-flex">
          <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--theme-accent)" }} />
          {total} tracks
        </span>
      </div>

      {/* Clip stage: swipe/tap/keyboard navigation all act on the same index. */}
      <div
        role="region"
        aria-label="Featured chart slides"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            prev();
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            next();
          }
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        style={{ touchAction: "pan-y" }}
        className="chart-hero-stage relative z-10 mt-3 overflow-hidden"
      >
        <div className="absolute bottom-5 left-1/2 h-10 w-[64%] -translate-x-1/2 rounded-[100%] bg-black/50 blur-2xl" />
        <div className="absolute left-1/2 top-1/2 h-[58%] w-[44%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--theme-accent)] opacity-20 blur-3xl" />

        <div className="relative flex items-center justify-center px-4 sm:px-6">
          <div
            key={activeTrack.id}
            onClick={playActive}
            className="relative aspect-square h-[188px] w-[188px] cursor-pointer select-none animate-in fade-in duration-500 md:h-auto md:w-full md:max-w-[var(--featured-card-max)]"
            style={{
              transform: `translateX(${dragValue ?? 0}px)`,
              transition: isDragging
                ? "none"
                : "transform 400ms cubic-bezier(0.22, 1, 0.36, 1)",
              willChange: "transform",
            }}
          >
            <div className="absolute -inset-3 rounded-[34px] bg-[var(--theme-accent)] opacity-20 blur-2xl" />
            <div className="relative h-full w-full overflow-hidden rounded-[26px] border border-emerald-500/40 shadow-[0_32px_64px_rgba(var(--mp-shadow-rgb),0.6)]">
              <Image
                src={artwork(activeTrack)}
                alt={`${activeTrack.title} cover`}
                fill
                sizes={`(max-width: 767px) 188px, ${FEATURED_CAROUSEL.cardMaxWidth}px`}
                unoptimized
                crossOrigin="anonymous"
                referrerPolicy="no-referrer"
                preload
                decoding="async"
                onError={(event) => {
                  event.currentTarget.src = getTrackArtworkFallbackUrl(activeTrack, "hq", mode);
                }}
                className="object-cover"
              />
              {/* Bottom gradient guarantees readable text over any cover. */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[72%] bg-gradient-to-t from-black/95 via-black/60 to-transparent md:h-[80%] md:from-black md:via-black/70" />
              <div className="absolute inset-x-0 bottom-0 z-10 p-4 sm:p-5 sm:pr-[88px]">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">
                  #{activeIndex + 1} · Now trending
                </p>
                <p
                  className="font-display text-lg font-semibold leading-tight text-white"
                  style={{
                    display: "-webkit-box",
                    WebkitBoxOrient: "vertical",
                    WebkitLineClamp: FEATURED_CAROUSEL.titleLines,
                    overflow: "hidden",
                  }}
                >
                  {activeTrack.title}
                </p>
                <p className="mt-0.5 text-[12px] leading-snug text-white/80">{activeTrack.artist}</p>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  playActive();
                }}
                className="absolute bottom-4 right-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] shadow-[0_0_24px_rgba(var(--theme-accent-rgb),0.45)] cursor-pointer transition-transform hover:scale-105 active:scale-95 sm:h-[52px] sm:w-[52px]"
                title={`Play ${activeTrack.title}`}
                aria-label={`Play ${activeTrack.title}`}
              >
                <Play className="ml-0.5 h-5 w-5 fill-current" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Dots + arrows: same shared spacing tokens in both carousels. */}
      <div className="relative z-10 flex items-center justify-between gap-2 px-4 pb-3 pt-1 sm:justify-center sm:px-6 sm:pb-4 md:gap-[var(--carousel-control-gap)]">
        <button
          type="button"
          onClick={prev}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white cursor-pointer transition-colors hover:bg-black/60 md:h-[var(--carousel-arrow-size)] md:w-[var(--carousel-arrow-size)]"
          title="Previous song"
          aria-label="Previous song"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex flex-1 items-center justify-center gap-1.5 sm:flex-none md:gap-[var(--carousel-dot-gap)]">
          {tracks.map((track, index) => (
            <button
              key={`dot-${track.id}`}
              type="button"
              onClick={() => goTo(index)}
              className={`h-1.5 rounded-full cursor-pointer transition-all duration-300 md:h-[var(--carousel-dot-size)] ${
                index === activeIndex
                  ? "w-[22px] bg-[var(--theme-accent)] md:w-[var(--carousel-dot-active)]"
                  : "w-1.5 bg-white/25 hover:bg-white/40 md:w-[var(--carousel-dot-size)]"
              }`}
              title={`Slide ${index + 1}: ${track.title}`}
              aria-label={`Go to slide ${index + 1}: ${track.title}`}
              aria-current={index === activeIndex ? "true" : undefined}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={next}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white cursor-pointer transition-colors hover:bg-black/60 md:h-[var(--carousel-arrow-size)] md:w-[var(--carousel-arrow-size)]"
          title="Next song"
          aria-label="Next song"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Equal-size thumbnail strip; the active thumb is centred on change. */}
      <div className="relative z-10 px-4 pb-4 pt-1 sm:px-6">
        <div
          role="group"
          aria-label="Chart track thumbnails"
          className="relative mx-auto flex w-full max-w-[var(--featured-strip-max)] items-center overflow-x-auto py-[var(--featured-thumb-pad-y)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div
            aria-hidden="true"
            className="shrink-0"
            style={{ width: "calc(50% - var(--featured-thumb-gap) - var(--featured-thumb-size) / 2)" }}
          />
          {tracks.map((track, index) => {
            const isActive = index === activeIndex;

            return (
              <button
                key={`thumb-${track.id}`}
                ref={(element) => {
                  thumbRefs.current[index] = element;
                }}
                type="button"
                onClick={() => goTo(index)}
                aria-current={isActive ? "true" : undefined}
                title={`${index + 1}. ${track.title}`}
                aria-label={`Show ${track.title}`}
                className={`relative h-[var(--featured-thumb-size)] w-[var(--featured-thumb-size)] shrink-0 cursor-pointer overflow-hidden rounded-xl border transition-[transform,opacity,box-shadow] duration-300 ${
                  isActive
                    ? "border-[var(--theme-accent)] shadow-[0_0_0_1px_rgba(var(--theme-accent-rgb),0.55),0_0_16px_rgba(var(--theme-accent-rgb),0.6)]"
                    : "border-white/10 opacity-60 hover:opacity-100"
                }`}
              >
                <Image
                  src={artwork(track)}
                  alt=""
                  fill
                  sizes={`${FEATURED_CAROUSEL.thumbSize}px`}
                  unoptimized
                  referrerPolicy="no-referrer"
                  onError={(event) => {
                    event.currentTarget.src = getTrackArtworkFallbackUrl(track, "hq", mode);
                  }}
                  className="object-cover"
                />
              </button>
            );
          })}
          <div
            aria-hidden="true"
            className="shrink-0"
            style={{ width: "calc(50% - var(--featured-thumb-gap) - var(--featured-thumb-size) / 2)" }}
          />
        </div>
      </div>
    </section>
  );
}
