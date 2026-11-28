/**
 * Unit tests for the "Top songs right now" coverflow controls.
 *
 * The project's runner is node:test (see tests/carousel.test.cjs). No browser,
 * DOM shim or UI test framework is added: the real TSX component is transpiled
 * on the fly into a plain React element tree, and the actual button onClick
 * props are invoked. Carousel hooks are stubbed with the shared reducer so the
 * handlers are exercised exactly as the component wires them.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const {
  createCarouselState,
  carouselReducer,
} = require("../.tmp-carousel/carouselBase.js");

const COMPONENT_PATH = path.resolve(
  __dirname,
  "../src/components/home/TopSongsCoverflow.tsx",
);

const TRACKS = Array.from({ length: 9 }, (_, index) => ({
  id: `track-${index}`,
  title: `Track ${index + 1}`,
  artist: "Artist",
  youtubeId: `video-${index}`,
}));

const NextImageStub = () => null;

const reactStub = {
  createElement(type, props, ...children) {
    return {
      type,
      props: {
        ...(props || {}),
        children: children
          .flat(Infinity)
          .filter((child) => child !== false && child != null),
      },
    };
  },
  Fragment: Symbol("Fragment"),
  useRef: (initialValue) => ({ current: initialValue }),
};

const baseStubs = {
  react: reactStub,
  "next/image": { __esModule: true, default: NextImageStub },
  "lucide-react": {
    ChevronLeft: () => null,
    ChevronRight: () => null,
    Play: () => null,
  },
  "@/context/PlayerContext": { usePlayer: () => ({ playTrack: () => {} }) },
  "@/hooks/useDataMode": { useDataMode: () => ({ mode: "low" }) },
  "@/lib/artwork": {
    getTrackArtworkUrl: (track, quality) =>
      `https://i.ytimg.com/vi/${track.youtubeId}/${quality === "max" ? "maxresdefault.jpg" : "hqdefault.jpg"}`,
    getTrackArtworkFallbackUrl: () => "/placeholder.svg",
  },
};

function createHarness(total) {
  let state = createCarouselState(total);
  const goTo = (index) => {
    state = carouselReducer(state, { type: "goTo", index, now: Date.now() });
  };
  return {
    goTo,
    activeIndex: () => state.activeIndex % total,
    api: () => {
      const activeIndex = state.activeIndex % total;
      return {
        activeIndex,
        position: activeIndex,
        setDragValue: () => {},
        goTo,
        reducedMotion: false,
        stageRef: { current: null },
        stageSize: { width: 0, height: 0 },
      };
    },
  };
}

function loadComponent(harness) {
  const source = fs.readFileSync(COMPONENT_PATH, "utf8");
  const { outputText } = ts.transpileModule(source, {
    fileName: COMPONENT_PATH,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2017,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  });

  const stubs = {
    ...baseStubs,
    "@/lib/carouselBase": require("../.tmp-carousel/carouselBase.js"),
    "@/components/home/useCarouselBase": {
      useCarouselBase: () => harness.api(),
    },
  };
  const evaluate = vm.runInThisContext(
    `(function (require, module, exports) { ${outputText}\n})`,
    { filename: COMPONENT_PATH },
  );
  const loaded = { exports: {} };
  evaluate(
    (id) =>
      Object.prototype.hasOwnProperty.call(stubs, id) ? stubs[id] : require(id),
    loaded,
    loaded.exports,
  );
  return loaded.exports.TopSongsCoverflow;
}

function render(harness) {
  const Component = loadComponent(harness);
  return Component({ tracks: TRACKS, className: "" });
}

function nodes(tree) {
  const found = [];
  const visit = (node) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") return;
    found.push(node);
    if (node.props && node.props.children !== undefined) {
      visit(node.props.children);
    }
  };
  visit(tree);
  return found;
}

function buttons(tree) {
  return nodes(tree).filter((node) => node.props && node.props.type === "button");
}

function coverflowDots(tree) {
  return buttons(tree).filter((button) =>
    String(button.props["aria-label"] || "").startsWith("Go to slide"),
  );
}

function controlsRow(tree) {
  return nodes(tree).find(
    (node) =>
      typeof node.props?.className === "string" &&
      node.props.className.includes("justify-center") &&
      node.props.className.includes("gap-4") &&
      node.props.className.includes("mt-6"),
  );
}

function coverflowImages(tree) {
  return nodes(tree).filter((node) => node.type === NextImageStub);
}

test("arrow clicks change activeIndex, including wrap-around", () => {
  const harness = createHarness(TRACKS.length);

  buttons(render(harness))
    .find((button) => button.props["aria-label"] === "Next song")
    .props.onClick();
  assert.equal(harness.activeIndex(), 1, "right arrow advances one slide");

  buttons(render(harness))
    .find((button) => button.props["aria-label"] === "Previous song")
    .props.onClick();
  assert.equal(harness.activeIndex(), 0, "left arrow goes back one slide");

  buttons(render(harness))
    .find((button) => button.props["aria-label"] === "Previous song")
    .props.onClick();
  assert.equal(
    harness.activeIndex(),
    TRACKS.length - 1,
    "left arrow wraps from the first slide to the last",
  );
});

test("a dot click jumps to that exact slide and becomes current", () => {
  const harness = createHarness(TRACKS.length);
  const targetLabel = "Go to slide 6: Track 6";

  coverflowDots(render(harness))
    .find((button) => button.props["aria-label"] === targetLabel)
    .props.onClick();
  assert.equal(harness.activeIndex(), 5, "dot 6 selects index 5");

  const dots = coverflowDots(render(harness));
  const current = dots.filter((button) => button.props["aria-current"] === "true");
  assert.equal(current.length, 1, "exactly one dot is current");
  assert.equal(current[0].props["aria-label"], targetLabel);
});

test("the active dot is a pill and inactive dots stay small circles", () => {
  const harness = createHarness(TRACKS.length);
  harness.goTo(3);

  const dots = coverflowDots(render(harness));
  assert.equal(dots.length, TRACKS.length, "one dot per song");

  assert.match(dots[3].props.className, /(^|\s)w-6(\s|$)/, "active dot is a 24px pill");
  assert.match(dots[3].props.className, /(^|\s)bg-purple-500(\s|$)/);

  dots.forEach((dot, index) => {
    assert.match(dot.props.className, /(^|\s)h-2(\s|$)/);
    if (index === 3) return;
    assert.match(dot.props.className, /(^|\s)w-2(\s|$)/, "inactive dots are 8px circles");
    assert.match(dot.props.className, /(^|\s)bg-white\/60(\s|$)/);
    assert.equal(dot.props["aria-current"], undefined);
  });
});

test("controls are one centred row: arrow, dots, arrow, with breathing room", () => {
  const harness = createHarness(TRACKS.length);
  const row = controlsRow(render(harness));
  assert.ok(row, "controls wrapper exists");
  assert.match(row.props.className, /flex items-center justify-center gap-4/);
  assert.match(row.props.className, /(^|\s)mt-6(\s|$)/);
  assert.match(row.props.className, /pb-6/, "space below controls");

  const [left, dots, right] = row.props.children;
  assert.equal(left.props["aria-label"], "Previous song");
  assert.equal(right.props["aria-label"], "Next song");
  assert.match(dots.props.className, /flex items-center gap-2/, "dots share one horizontal group");
  assert.doesNotMatch(
    dots.props.className,
    /(^|\s)(hidden|opacity-0|overflow-hidden|w-0)(\s|$)/,
    "nothing hides or collapses the dots wrapper",
  );

  for (const arrow of [left, right]) {
    assert.match(arrow.props.className, /(^|\s)h-11(\s|$)/);
    assert.match(arrow.props.className, /(^|\s)w-11(\s|$)/);
    assert.match(arrow.props.className, /(^|\s)rounded-full(\s|$)/);
    assert.match(arrow.props.className, /(^|\s)bg-black\/40(\s|$)/);
    assert.match(arrow.props.className, /border border-white\/10/);
    assert.match(arrow.props.className, /(^|\s)hover:border-purple-400(\s|$)/);
    assert.match(arrow.props.className, /(^|\s)hover:bg-purple-500\/20(\s|$)/);
    const [icon] = arrow.props.children;
    assert.match(icon.props.className, /(^|\s)h-5(\s|$)/);
    assert.match(icon.props.className, /(^|\s)w-5(\s|$)/);
  }
});

test("controls are siblings of the stage, outside the perspective container", () => {
  const tree = render(createHarness(TRACKS.length));
  const section = nodes(tree).find(
    (node) => node.props?.["aria-label"] === "Top songs right now",
  );
  const row = controlsRow(tree);
  const stage = nodes(tree).find(
    (node) => typeof node.props?.className === "string" && node.props.className.includes("shubhu-carousel-stage"),
  );
  assert.ok(section && row && stage);
  assert.ok(section.props.children.includes(row), "controls are a direct child of the section");
  assert.ok(section.props.children.includes(stage), "stage is a direct child of the section");
});

test("artwork uses a high-res URL, matched sizes and quality 90", () => {
  const images = coverflowImages(render(createHarness(TRACKS.length)));
  assert.equal(images.length, TRACKS.length, "one image per cover");

  for (const image of images) {
    assert.match(image.props.src, /maxresdefault\.jpg$/, "maxres thumbnail, not mq/hq default");
    assert.equal(image.props.sizes, "(min-width: 768px) 320px, 240px");
    assert.equal(image.props.quality, 90);
    assert.equal(image.props.unoptimized, undefined, "Next optimisation and srcset are enabled");
  }
});
