"use client";

/**
 * Desktop "Top songs right now" coverflow.
 *
 * Positions come from the measured stage width, and every transform is produced
 * by the shared `getCoverflowItemLayout` formula: equal distances get identical
 * magnitudes, with only translateX / rotateY mirrored across the active card.
 */

import React from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import { useDataMode } from "@/hooks/useDataMode";
import type { Track } from "@/lib/types";
import { getTrackArtworkFallbackUrl, getTrackArtworkUrl } from "@/lib/artwork";
import {
  COVERFLOW_CAROUSEL,
  clampCarouselValue,
  getCarouselTransition,
  getCoverflowCenterX,
  getCoverflowItemLayout,
  sampleCarouselCurve,
  wrapCarouselPosition,
} from "@/lib/carouselBase";
import { useCarouselBase } from "@/components/home/useCarouselBase";

interface TopSongsCoverflowProps {
  tracks: Track[];
  className?: string;
}

interface DragState {
  pointerId: number | null;
  startX: number;
  startY: number;
  startIndex: number;
  dx: number;
  horizontal: boolean | null;
}

const emptyDrag: DragState = {
  pointerId: null,
  startX: 0,
  startY: 0,
  startIndex: 0,
  dx: 0,
  horizontal: null,
};

// Default/mq thumbnails (320x180 / 480x360) are too soft on a 270-340px card.
// Ask for the largest real variant even in low data mode; fall back to hq.
function coverflowArtworkUrl(track: Track): string {
  return getTrackArtworkUrl(track, "max", "high");
}

function coverflowArtworkFallbackUrl(track: Track): string {
  return getTrackArtworkUrl(track, "hq", "high");
}

export function TopSongsCoverflow({ tracks, className = "" }: TopSongsCoverflowProps) {
  const { playTrack } = usePlayer();
  const { mode } = useDataMode();
  const playOptions = mode === "low" ? { appendSimilar: false } : undefined;
  const total = tracks.length;

  const {
    activeIndex,
    position,
    setDragValue,
    goTo,
    reducedMotion,
    stageRef,
    stageSize,
  } = useCarouselBase(total, { measureStage: true });

  const dragRef = React.useRef<DragState>({ ...emptyDrag });
  const suppressClickRef = React.useRef(false);

  const activeTrack = tracks[wrapCarouselPosition(activeIndex, total)];

  // One shared card size for every item, calculated from the stage's own
  // content width (the inner padding is reserved for the edge fade).
  const stageWidth = stageSize.width;
  const contentWidth = Math.max(
    0,
    (stageWidth || 1060) - COVERFLOW_CAROUSEL.stagePaddingX * 2,
  );
  const cardSize = clampCarouselValue(
    COVERFLOW_CAROUSEL.cardMin,
    contentWidth * COVERFLOW_CAROUSEL.cardWidthRatio,
    COVERFLOW_CAROUSEL.cardMax,
  );
  const stageHeight = cardSize + COVERFLOW_CAROUSEL.stagePaddingY;
  const stepPx = cardSize * COVERFLOW_CAROUSEL.stepRatio;
  const transition = getCarouselTransition(reducedMotion);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (total <= 1) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startIndex: activeIndex,
      dx: 0,
      horizontal: null,
    };
    suppressClickRef.current = false;
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
    // Dragging left advances the position; right goes back.
    setDragValue(wrapCarouselPosition(drag.startIndex - dx / stepPx, total));
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag.pointerId !== event.pointerId) return;

    if (drag.horizontal && Math.abs(drag.dx) > 8) {
      goTo(Math.round(drag.startIndex - drag.dx / stepPx));
    } else {
      setDragValue(null);
    }
    dragRef.current = { ...emptyDrag };
  };

  const handleCardClick = (track: Track, index: number) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const nearest = wrapCarouselPosition(Math.round(position), total);
    if (nearest === index) {
      void playTrack(track, tracks, playOptions);
    } else {
      goTo(index);
    }
  };

  if (!activeTrack) return null;

  return (
    <section
      data-edge-free
      aria-label="Top songs right now"
      className={`relative hidden overflow-hidden rounded-[28px] border border-white/[0.06] shadow-2xl theme-dark-surface md:block ${className}`}
      style={{
        background:
          "radial-gradient(120% 130% at 50% 115%, var(--carousel-glow) 0%, var(--carousel-base) 55%, var(--carousel-base) 100%)",
        ["--coverflow-card-size" as string]: `${cardSize}px`,
        ["--carousel-stage-pad-x" as string]: `${COVERFLOW_CAROUSEL.stagePaddingX}px`,
        ["--carousel-fade-edge" as string]: `${COVERFLOW_CAROUSEL.fadeEdgePercent}%`,
      } as React.CSSProperties}
    >
      {/* Ambient tint follows the active cover; the veil keeps text readable. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("${getTrackArtworkUrl(activeTrack, "hq", mode)}")`,
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

      <div className="relative z-10 px-6 pt-6">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Top songs right now
        </h2>
        <p className="mt-1 text-xs text-neutral-400">Curated daily based on real-time stream velocity</p>
      </div>

      {/* Measured stage. Overflow + edge mask make outer cards fade inside the frame. */}
      <div
        ref={stageRef}
        role="region"
        aria-label="Top songs coverflow"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            goTo(activeIndex - 1);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            goTo(activeIndex + 1);
          }
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className="shubhu-carousel-stage home-carousel-fade relative z-10 mt-3 outline-none focus-visible:ring-1 focus-visible:ring-[var(--theme-accent)]/40"
        style={{ height: stageHeight, touchAction: "pan-y" }}
      >
        <div className="absolute bottom-4 left-1/2 h-10 w-[64%] -translate-x-1/2 rounded-[100%] bg-black/50 blur-2xl" />
        <div className="absolute left-1/2 top-1/2 h-[62%] w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--theme-accent)]/10 blur-3xl" />

        <div className="absolute inset-0" style={{ perspective: "1400px" }}>
          <div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
            {tracks.map((track, index) => {
              const layout = getCoverflowItemLayout(index, position, total, cardSize);
              const { visible, isActive } = layout;

              return (
                <div
                  key={track.id}
                  onClick={() => handleCardClick(track, index)}
                  aria-hidden={!visible}
                  className={`absolute select-none ${visible ? "cursor-pointer" : "pointer-events-none"}`}
                  style={{
                    left: stageWidth > 0 ? `${getCoverflowCenterX(stageWidth)}px` : "50%",
                    top: "50%",
                    width: cardSize,
                    height: cardSize,
                    borderRadius: 28,
                    transform: `translate(-50%, -50%) translateX(${layout.translateX}px) translateZ(${layout.translateZ}px) rotateY(${layout.rotateY}deg) scale(${layout.scale})`,
                    opacity: layout.opacity,
                    visibility: visible ? "visible" : "hidden",
                    zIndex: layout.zIndex,
                    willChange: "transform",
                    transition,
                  }}
                >
                  <div
                    className={`relative h-full w-full overflow-hidden border ${
                      isActive
                        ? "border-[var(--theme-accent)]/50 shadow-[0_32px_64px_rgba(var(--mp-shadow-rgb),0.6)]"
                        : "border-white/10 shadow-[0_24px_48px_rgba(var(--mp-shadow-rgb),0.45)]"
                    }`}
                    style={{
                      borderRadius: 28,
                      // Keep the artwork on its own composited layer so the 3D
                      // stage never rasterises a scaled card at a lower resolution.
                      transform: "translateZ(0)",
                      backfaceVisibility: "hidden",
                      WebkitBackfaceVisibility: "hidden",
                    }}
                  >
                    <Image
                      src={coverflowArtworkUrl(track)}
                      alt={`${track.title} cover`}
                      fill
                      sizes="(min-width: 768px) 320px, 240px"
                      quality={90}
                      crossOrigin="anonymous"
                      referrerPolicy="no-referrer"
                      decoding="async"
                      onError={(event) => {
                        const image = event.currentTarget;
                        image.src = image.src.includes("hqdefault.jpg")
                          ? getTrackArtworkFallbackUrl(track, "hq", mode)
                          : coverflowArtworkFallbackUrl(track);
                      }}
                      className="object-cover"
                    />
                    <div
                      className="pointer-events-none absolute inset-0 bg-black"
                      style={{
                        opacity: sampleCarouselCurve([0, 0.16, 0.34], layout.distance),
                        transition,
                      }}
                    />
                    {isActive && (
                      <>
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/90 via-black/45 to-transparent" />
                        <div className="absolute inset-x-0 bottom-0 z-10 p-5 pr-[84px]">
                          <h3 className="line-clamp-2 font-display text-[22px] font-semibold leading-tight text-white">
                            {track.title}
                          </h3>
                          <p className="mt-1 truncate text-sm text-white/80">{track.artist}</p>
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (suppressClickRef.current) {
                              suppressClickRef.current = false;
                              return;
                            }
                            void playTrack(track, tracks, playOptions);
                          }}
                          className="absolute bottom-[18px] right-[18px] z-20 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] shadow-[0_0_24px_rgba(var(--theme-accent-rgb),0.45)] transition-transform hover:scale-105 active:scale-95"
                          title={`Play ${track.title}`}
                          aria-label={`Play ${track.title}`}
                        >
                          <Play className="ml-0.5 h-5 w-5 fill-current" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* One dot per song: active dot matches activeIndex exactly. */}
      <div className="relative z-10 flex items-center justify-center gap-4 px-6 pb-6 mt-6">
        <button
          type="button"
          onClick={() => goTo(activeIndex - 1)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white transition hover:border-purple-400 hover:bg-purple-500/20"
          title="Previous song"
          aria-label="Previous song"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          {tracks.map((track, index) => (
            <button
              key={`coverflow-dot-${track.id}`}
              type="button"
              onClick={() => goTo(index)}
              className={`h-2 rounded-full transition-all duration-300 ${
                index === activeIndex
                  ? "w-6 bg-purple-500"
                  : "w-2 bg-white/60 hover:bg-white/80"
              }`}
              title={`Slide ${index + 1}: ${track.title}`}
              aria-label={`Go to slide ${index + 1}: ${track.title}`}
              aria-current={index === activeIndex ? "true" : undefined}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => goTo(activeIndex + 1)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white transition hover:border-purple-400 hover:bg-purple-500/20"
          title="Next song"
          aria-label="Next song"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </section>
  );
}
