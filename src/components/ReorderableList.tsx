"use client";

/**
 * Drag-to-reorder list used by the queue screens.
 *
 * Behaviour
 * ─────────
 * • Press and hold a row (240ms on touch) and it lifts; move up/down and the
 *   other rows slide out of the way a full slot at a time. Release to drop.
 *   A plain tap still opens the row.
 * • On a desktop mouse the lift starts straight away — there is no scrolling
 *   gesture to fight with — but a click without movement is still a click.
 * • The grip handle (`.shubhu-reorder-handle`) has `touch-action: none`, so a
 *   drag that starts on the handle arms immediately on touch as well. This is
 *   what makes drag-to-reorder reliable on phones.
 * • Everything settles through transforms: the dragged row keeps its own DOM
 *   slot for the whole gesture, so the list never re-flows mid-drag. The real
 *   reorder is committed once the row has eased into its target slot.
 * • When the order changes from outside a drag (next track, queue edits) rows
 *   glide to their new slots with a FLIP animation.
 *
 * No dependencies; pointer events only.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export interface ReorderRowState {
  /** This row is the one currently being dragged. */
  isDragging: boolean;
  /** The dragged row would be dropped at this index. */
  isDropTarget: boolean;
}

interface ReorderableListProps<T> {
  items: T[];
  itemKey: (item: T, index: number) => string;
  children: (item: T, index: number, state: ReorderRowState) => React.ReactNode;
  onReorder: (next: T[]) => void;
  onRowClick?: (item: T, index: number) => void;
  rowClassName?: (index: number, state: ReorderRowState) => string;
  className?: string;
  /** How long a touch must rest before the drag takes over. */
  holdMs?: number;
  disabled?: boolean;
}

interface Layout {
  /** Row tops relative to the list container. */
  tops: number[];
  heights: number[];
}

interface Gesture {
  pointerId: number;
  startY: number;
  index: number;
  captured: boolean;
  /** Drag machinery armed after the hold (or immediately for a mouse/handle). */
  armed: boolean;
  /** The row is visibly lifted. */
  visual: boolean;
  moved: boolean;
  timer: number | null;
  node: HTMLElement | null;
  layout: Layout;
}

interface DragState {
  from: number;
  to: number;
  offset: number;
  settling: boolean;
  /** Row tops captured when the gesture began (relative to the list). */
  tops: number[];
}

const LIFT_THRESHOLD = 4;
const SCROLL_TOLERANCE = 10;
const SETTLE_MS = 180;
const FLIP_MS = 240;
const FLIP_EASING = "cubic-bezier(0.2, 0.8, 0.3, 1)";

const EMPTY_LAYOUT: Layout = { tops: [], heights: [] };

/** Chromium honours `-webkit-user-drag`; lib.dom does not type it. */
function readUserDrag() {
  return (document.body.style as unknown as Record<string, string>).webkitUserDrag ?? "";
}

function writeUserDrag(value: string) {
  (document.body.style as unknown as Record<string, string>).webkitUserDrag = value;
}

export function ReorderableList<T>({
  items,
  itemKey,
  children,
  onReorder,
  onRowClick,
  rowClassName,
  className = "",
  holdMs = 240,
  disabled = false,
}: ReorderableListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const gestureRef = useRef<Gesture | null>(null);
  const layoutRef = useRef<Layout>(EMPTY_LAYOUT);
  const itemsRef = useRef(items);
  const dragRef = useRef<DragState | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const previousUserSelectRef = useRef("");
  const previousUserDragRef = useRef("");
  const prevRectsRef = useRef<Map<string, { top: number; height: number }> | null>(null);
  const lastOrderRef = useRef<string | null>(null);
  const skipFlipRef = useRef(false);

  const [drag, setDrag] = useState<DragState | null>(null);
  const [noTransitions, setNoTransitions] = useState(false);

  const orderKey = items.map((item, index) => itemKey(item, index)).join("\u0001");

  // Keep the event handlers reading the latest values without touching refs
  // during render.
  useLayoutEffect(() => {
    itemsRef.current = items;
    dragRef.current = drag;
  });

  /* ---------------------------------------------------------------- */
  /* Measurement                                                      */
  /* ---------------------------------------------------------------- */

  const measureRows = useCallback((): Layout => {
    const container = containerRef.current;
    const tops: number[] = [];
    const heights: number[] = [];

    if (container) {
      const base = container.getBoundingClientRect().top;
      rowRefs.current.forEach((node) => {
        if (!node) {
          tops.push(0);
          heights.push(0);
          return;
        }
        const rect = node.getBoundingClientRect();
        tops.push(rect.top - base);
        heights.push(rect.height);
      });
    }

    return { tops, heights };
  }, []);

  /* ---------------------------------------------------------------- */
  /* Gesture plumbing                                                 */
  /* ---------------------------------------------------------------- */

  const preventNativeGesture = useCallback((event: Event) => {
    if (event.cancelable) event.preventDefault();
  }, []);

  const releaseGesture = useCallback(() => {
    const gesture = gestureRef.current;
    if (!gesture) return;

    if (gesture.timer !== null) {
      window.clearTimeout(gesture.timer);
      gesture.timer = null;
    }

    if (gesture.captured) {
      try {
        gesture.node?.releasePointerCapture(gesture.pointerId);
      } catch {
        /* the pointer is already gone */
      }
      gesture.captured = false;
    }

    if (gesture.armed) {
      document.removeEventListener("touchmove", preventNativeGesture);
      document.removeEventListener("contextmenu", preventNativeGesture);
      document.body.style.userSelect = previousUserSelectRef.current;
      writeUserDrag(previousUserDragRef.current);
      gesture.armed = false;
    }

    gestureRef.current = null;
  }, [preventNativeGesture]);

  const armDrag = useCallback(() => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.armed) return;

    gesture.armed = true;
    gesture.timer = null;

    // Once the drag owns the gesture, native scrolling and the long-press
    // context menu must not steal it.
    document.addEventListener("touchmove", preventNativeGesture, { passive: false });
    document.addEventListener("contextmenu", preventNativeGesture);
    previousUserSelectRef.current = document.body.style.userSelect;
    previousUserDragRef.current = readUserDrag();
    document.body.style.userSelect = "none";
    writeUserDrag("none");
  }, [preventNativeGesture]);

  const cancelGesture = useCallback(() => {
    releaseGesture();
    layoutRef.current = EMPTY_LAYOUT;
    setDrag(null);
  }, [releaseGesture]);

  const targetIndexAt = useCallback((clientY: number, layout: Layout, fallback: number) => {
    const container = containerRef.current;
    if (!container || layout.tops.length === 0) return fallback;

    const y = clientY - container.getBoundingClientRect().top;
    let target = 0;

    for (let i = 0; i < layout.tops.length; i += 1) {
      if (y > layout.tops[i] + layout.heights[i] / 2) target = i;
      else break;
    }

    return Math.min(Math.max(target, 0), layout.tops.length - 1);
  }, []);

  const clampOffset = useCallback((offset: number, layout: Layout, index: number) => {
    const first = layout.tops[0] ?? 0;
    const last = layout.tops[layout.tops.length - 1] ?? 0;
    const origin = layout.tops[index] ?? 0;
    return Math.min(Math.max(offset, first - origin), last - origin);
  }, []);

  /* ---------------------------------------------------------------- */
  /* Pointer handlers                                                 */
  /* ---------------------------------------------------------------- */

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>, index: number) => {
    if (disabled || gestureRef.current) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const node = rowRefs.current[index];
    if (!node) return;

    const target = event.target as HTMLElement | null;
    const fromHandle = Boolean(target?.closest?.(".shubhu-reorder-handle"));
    const layout = measureRows();
    layoutRef.current = layout;

    let captured = false;
    try {
      // Capture up front so a pointer released outside the row still ends the
      // gesture cleanly; this does not stop the page from scrolling.
      node.setPointerCapture(event.pointerId);
      captured = true;
    } catch {
      captured = false;
    }

    gestureRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      index,
      captured,
      armed: false,
      visual: false,
      moved: false,
      timer: null,
      node,
      layout,
    };

    if (event.pointerType === "mouse" || fromHandle) {
      // The handle opts out of native panning, so touch drags from it can
      // start immediately instead of waiting for the hold timer.
      armDrag();
    } else {
      gestureRef.current.timer = window.setTimeout(armDrag, holdMs);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;

    const delta = event.clientY - gesture.startY;

    if (!gesture.armed) {
      // The finger is scrolling, not holding.
      if (Math.abs(delta) > SCROLL_TOLERANCE) cancelGesture();
      return;
    }

    if (Math.abs(delta) > LIFT_THRESHOLD) gesture.moved = true;
    if (!gesture.visual && !gesture.moved) return;

    gesture.visual = true;
    setDrag({
      from: gesture.index,
      to: targetIndexAt(event.clientY, gesture.layout, gesture.index),
      offset: clampOffset(delta, gesture.layout, gesture.index),
      settling: false,
      tops: gesture.layout.tops,
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;

    const current = dragRef.current;

    if (gesture.visual && current) {
      // Ease the row into its target slot first, then commit the new order in
      // the same frame the transforms are cleared, so nothing jumps.
      const slotOffset =
        (gesture.layout.tops[current.to] ?? 0) - (gesture.layout.tops[gesture.index] ?? 0);

      const from = gesture.index;
      const to = current.to;

      setDrag({ ...current, offset: slotOffset, settling: true });
      releaseGesture();

      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null;
        layoutRef.current = EMPTY_LAYOUT;
        skipFlipRef.current = true;
        setNoTransitions(true);
        setDrag(null);

        if (to !== from) {
          const next = [...itemsRef.current];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          onReorder(next);
        }

        // Drop the no-transition guard once the reordered DOM has painted.
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            setNoTransitions(false);
            skipFlipRef.current = false;
          });
        });
      }, SETTLE_MS);

      return;
    }

    if (!gesture.moved && onRowClick) {
      onRowClick(itemsRef.current[gesture.index], gesture.index);
    }

    cancelGesture();
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (dragRef.current?.settling) return;
    cancelGesture();
  };

  /* ---------------------------------------------------------------- */
  /* Order-change animation (FLIP)                                    */
  /* ---------------------------------------------------------------- */

  useLayoutEffect(() => {
    const nodes = rowRefs.current.slice(0, items.length);
    const next = new Map<string, { top: number; height: number }>();

    // `offsetTop` ignores transforms, scroll position and running animations,
    // so storing it on every render stays accurate for the next FLIP.
    nodes.forEach((node, index) => {
      if (!node) return;
      next.set(itemKey(items[index], index), {
        top: node.offsetTop,
        height: node.offsetHeight,
      });
    });

    const previous = prevRectsRef.current;
    const orderChanged = lastOrderRef.current !== null && lastOrderRef.current !== orderKey;

    if (previous && orderChanged && !skipFlipRef.current && !dragRef.current) {
      nodes.forEach((node, index) => {
        if (!node) return;
        const key = itemKey(items[index], index);
        const oldRect = previous.get(key);
        const newRect = next.get(key);
        if (!oldRect || !newRect) return;

        const dy = oldRect.top - newRect.top;
        if (Math.abs(dy) < 1) return;

        node.animate(
          [
            { transform: `translateY(${dy}px)` },
            { transform: "translateY(0px)" },
          ],
          { duration: FLIP_MS, easing: FLIP_EASING },
        );
      });
    }

    prevRectsRef.current = next;
    lastOrderRef.current = orderKey;
    // `orderKey` stands in for the items order; `itemKey` is often an inline
    // function and depending on it would re-measure on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                        */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    return () => {
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
      document.removeEventListener("touchmove", preventNativeGesture);
      document.removeEventListener("contextmenu", preventNativeGesture);
      document.body.style.userSelect = previousUserSelectRef.current;
      writeUserDrag(previousUserDragRef.current);
    };
  }, [preventNativeGesture]);

  /* ---------------------------------------------------------------- */
  /* Render                                                           */
  /* ---------------------------------------------------------------- */

  const offsetFor = (index: number, state: DragState) => {
    if (index === state.from) return state.offset;

    const { tops } = state;
    if (!tops.length) return 0;

    // Move every row between the origin and the drop slot by exactly one
    // row-slot, using the measured neighbours so variable heights also work.
    if (state.from < state.to && index > state.from && index <= state.to) {
      return (tops[index - 1] ?? 0) - (tops[index] ?? 0);
    }
    if (state.from > state.to && index >= state.to && index < state.from) {
      return (tops[index + 1] ?? 0) - (tops[index] ?? 0);
    }
    return 0;
  };

  return (
    <div
      ref={containerRef}
      className={className}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {items.map((item, index) => {
        const state: ReorderRowState = {
          isDragging: drag ? drag.from === index : false,
          isDropTarget: drag ? drag.to === index && drag.from !== index : false,
        };
        const offset = drag ? offsetFor(index, drag) : 0;

        return (
          <div
            key={itemKey(item, index)}
            ref={(node) => {
              rowRefs.current[index] = node;
            }}
            data-reorder-row=""
            className={`shubhu-reorder-row ${state.isDragging ? "is-dragging" : ""} ${
              rowClassName ? rowClassName(index, state) : ""
            }`}
            style={{
              transform: offset ? `translateY(${offset}px)` : undefined,
              transition: noTransitions
                ? "none"
                : state.isDragging && !drag?.settling
                  ? "none"
                  : `transform ${SETTLE_MS}ms ${FLIP_EASING}`,
            }}
            onPointerDown={(event) => handlePointerDown(event, index)}
            onClick={
              onRowClick
                ? (event) => {
                    // The tap is handled on pointer-up so a long press never
                    // also opens the track; swallow the browser's click.
                    event.preventDefault();
                  }
                : undefined
            }
            role={onRowClick ? "button" : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            onKeyDown={
              onRowClick
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onRowClick(item, index);
                    }
                  }
                : undefined
            }
          >
            {children(item, index, state)}
          </div>
        );
      })}
    </div>
  );
}
