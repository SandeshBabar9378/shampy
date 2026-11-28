/**
 * Unit tests for the shared desktop Home carousel foundation.
 *
 * The project's existing runner is node:test (see tests/recommender.test.cjs).
 * The TS modules are compiled to .tmp-carousel by the npm test script, so these
 * tests exercise the exact pure code used by both React components without
 * adding a UI / browser test framework.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CAROUSEL_INTERVAL_MS,
  CAROUSEL_MANUAL_PAUSE_MS,
  COVERFLOW_CAROUSEL,
  centerThumbnail,
  createCarouselState,
  carouselReducer,
  getCarouselTransition,
  getCoverflowCenterX,
  getCoverflowItemLayout,
  wrapCarouselIndex,
  shouldAutoAdvance,
} = require("../.tmp-carousel/carouselBase.js");

// The legacy entry point still resolves to the same shared implementation.
const machine = require("../.tmp-carousel/carouselMachine.js");
assert.equal(machine.carouselReducer, carouselReducer);

const TOTAL = 9;
const NOW = 1_000_000;
const CARD_SIZE = 300;
const ACTIVE = 4;

test("auto-advance moves one slide per tick and loops", () => {
  assert.equal(CAROUSEL_INTERVAL_MS, 5000, "both carousels share the 5s interval");
  assert.equal(CAROUSEL_MANUAL_PAUSE_MS, 10000, "manual navigation pauses for 10s");

  let state = createCarouselState(TOTAL);
  assert.equal(state.activeIndex, 0);

  state = carouselReducer(state, { type: "advance", now: NOW });
  assert.equal(state.activeIndex, 1, "first tick advances to slide 2");

  for (let i = 0; i < TOTAL - 2; i += 1) {
    state = carouselReducer(state, { type: "advance", now: NOW });
  }
  assert.equal(state.activeIndex, TOTAL - 1, "last slide is index 8");

  state = carouselReducer(state, { type: "advance", now: NOW });
  assert.equal(state.activeIndex, 0, "next tick loops back to the first slide");
});

test("next and prev buttons wrap around the ends", () => {
  const first = createCarouselState(TOTAL);
  const prev = carouselReducer(first, { type: "prev", now: NOW });
  assert.equal(prev.activeIndex, TOTAL - 1, "prev from slide 1 goes to slide 9");

  const next = carouselReducer(prev, { type: "next", now: NOW });
  assert.equal(next.activeIndex, 0, "next from slide 9 goes back to slide 1");

  assert.equal(wrapCarouselIndex(-1, TOTAL), TOTAL - 1);
  assert.equal(wrapCarouselIndex(TOTAL, TOTAL), 0);
});

test("dot click changes the active slide, including wrap-around indices", () => {
  const state = createCarouselState(TOTAL);
  const afterDot = carouselReducer(state, { type: "goTo", index: 4, now: NOW });

  assert.equal(afterDot.activeIndex, 4, "dot 5 activates slide 5");
  assert.notEqual(afterDot.activeIndex, state.activeIndex);

  assert.equal(
    carouselReducer(afterDot, { type: "goTo", index: -1, now: NOW }).activeIndex,
    TOTAL - 1,
    "an out-of-range dot wraps to the last slide",
  );
  assert.equal(
    carouselReducer(afterDot, { type: "goTo", index: TOTAL, now: NOW }).activeIndex,
    0,
    "an out-of-range dot wraps to the first slide",
  );
});

test("thumbnail click changes the active slide and centres the active thumb", () => {
  let state = createCarouselState(TOTAL);
  state = carouselReducer(state, { type: "goTo", index: 7, now: NOW });
  const afterThumb = carouselReducer(state, { type: "goTo", index: 2, now: NOW });
  assert.equal(afterThumb.activeIndex, 2, "tapping slide 3's thumbnail activates it");

  let receivedOptions;
  const mockThumb = {
    scrollIntoView(options) {
      receivedOptions = options;
    },
  };
  assert.equal(centerThumbnail(mockThumb), true, "scrollIntoView is called");
  assert.deepEqual(
    receivedOptions,
    { inline: "center", block: "nearest", behavior: "smooth" },
    "horizontal centring must not scroll the page vertically",
  );
  assert.equal(centerThumbnail(null), false);
});

test("hover pauses auto-advance and mouse leave resumes it", () => {
  let state = createCarouselState(TOTAL);
  state = carouselReducer(state, { type: "hover", hovered: true });

  const hovered = carouselReducer(state, { type: "advance", now: NOW });
  assert.equal(hovered.activeIndex, state.activeIndex, "no advance while hovered");
  assert.equal(shouldAutoAdvance(hovered, NOW), false);

  state = carouselReducer(hovered, { type: "hover", hovered: false });
  const resumed = carouselReducer(state, { type: "advance", now: NOW });
  assert.equal(resumed.activeIndex, 1, "advance resumes after mouse leave");
});

test("manual interaction pauses auto-advance, then it resumes", () => {
  let state = carouselReducer(createCarouselState(TOTAL), {
    type: "goTo",
    index: 3,
    now: NOW,
  });
  assert.equal(state.activeIndex, 3);

  const duringPause = carouselReducer(state, {
    type: "advance",
    now: NOW + CAROUSEL_MANUAL_PAUSE_MS - 1,
  });
  assert.equal(duringPause.activeIndex, 3, "tick inside the pause window does nothing");

  const afterPause = carouselReducer(state, {
    type: "advance",
    now: NOW + CAROUSEL_MANUAL_PAUSE_MS,
  });
  assert.equal(afterPause.activeIndex, 4, "advance resumes once the pause expires");
});

test("coverflow formula is symmetric for +n and -n", () => {
  for (const distance of [1, 2]) {
    const right = getCoverflowItemLayout(ACTIVE + distance, ACTIVE, TOTAL, CARD_SIZE);
    const left = getCoverflowItemLayout(ACTIVE - distance, ACTIVE, TOTAL, CARD_SIZE);

    assert.equal(right.offset, distance);
    assert.equal(left.offset, -distance);
    assert.equal(Math.abs(left.translateX), Math.abs(right.translateX), "equal offsets");
    assert.equal(left.translateX, -right.translateX, "mirrored translation");
    assert.equal(left.rotateY, -right.rotateY, "mirrored rotation");
    assert.equal(left.scale, right.scale, "scale depends on distance only");
    assert.equal(left.opacity, right.opacity, "opacity depends on distance only");
    assert.equal(left.translateZ, right.translateZ, "depth depends on distance only");
    assert.equal(left.zIndex, right.zIndex);
  }
});

test("active card is centred and cards beyond two steps are hidden", () => {
  const active = getCoverflowItemLayout(ACTIVE, ACTIVE, TOTAL, CARD_SIZE);
  assert.equal(active.isActive, true);
  assert.equal(active.translateX, 0, "active card has no horizontal offset");
  assert.equal(active.rotateY, 0);
  assert.equal(getCoverflowCenterX(1000), 500, "active card uses the measured centre");

  for (const distance of [3, 4]) {
    for (const index of [ACTIVE - distance, ACTIVE + distance]) {
      const layout = getCoverflowItemLayout(index, ACTIVE, TOTAL, CARD_SIZE);
      assert.equal(layout.visible, false, `card at ${distance} steps is hidden`);
      assert.equal(layout.opacity, 0, "hidden cards are fully transparent");
    }
  }
});

test("prefers-reduced-motion disables transitions", () => {
  assert.equal(getCarouselTransition(true), "none");
  assert.equal(COVERFLOW_CAROUSEL.durationMs, 400, "normal transition is 400ms");
  assert.match(
    getCarouselTransition(false),
    /transform 400ms ease-out, opacity 400ms ease-out/,
  );
});
