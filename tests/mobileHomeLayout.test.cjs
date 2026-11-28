/**
 * Unit tests for mobile home layout, shared card tokens, horizontal rows,
 * aspect ratio, truncate classes, and bottom padding wrapper.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const TOKENS_PATH = path.join(ROOT_DIR, "src/lib/home-tokens.ts");
const RECENTLY_PLAYED_PATH = path.join(ROOT_DIR, "src/components/home/RecentlyPlayed.tsx");
const ON_REPEAT_PATH = path.join(ROOT_DIR, "src/components/home/OnRepeat.tsx");
const COMMUNITY_PATH = path.join(ROOT_DIR, "src/components/home/CommunityPlaylists.tsx");
const NEW_RELEASES_PATH = path.join(ROOT_DIR, "src/components/home/NewReleases.tsx");
const BECAUSE_YOU_LISTENED_PATH = path.join(ROOT_DIR, "src/components/home/BecauseYouListened.tsx");
const TRENDING_NOW_PATH = path.join(ROOT_DIR, "src/components/home/TrendingNow.tsx");
const POPULAR_ARTISTS_PATH = path.join(ROOT_DIR, "src/components/home/PopularArtists.tsx");
const MOBILE_HOME_PATH = path.join(ROOT_DIR, "src/components/home/MobileHome.tsx");

test("mobile design tokens file exports standard tokens", () => {
  assert.ok(fs.existsSync(TOKENS_PATH), "home-tokens.ts should exist");
  const content = fs.readFileSync(TOKENS_PATH, "utf8");

  assert.match(content, /horizontalCard:\s*"w-\[140px\] shrink-0"/, "Token has shrink-0 and w-[140px]");
  assert.match(content, /horizontalRow:\s*"flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide"/, "Token has flex overflow-x-auto gap-3");
  assert.match(content, /imageContainer:\s*"aspect-square w-full overflow-hidden rounded-xl bg-neutral-900 border border-white\/10"/, "Token has aspect-square");
  assert.match(content, /titleText:\s*"block truncate text-\[12px\] font-semibold text-white"/, "Title truncate token exists");
  assert.match(content, /subtitleText:\s*"block truncate text-\[11px\] text-white\/60"/, "Subtitle truncate token exists");
  assert.match(content, /bottomPadding:\s*"pb-6"/, "Clean bottom padding token exists");
});

test("horizontal section components use shared tokens and shrink-0", () => {
  const horizontalFiles = [
    { name: "RecentlyPlayed", path: RECENTLY_PLAYED_PATH },
    { name: "OnRepeat", path: ON_REPEAT_PATH },
    { name: "CommunityPlaylists", path: COMMUNITY_PATH },
    { name: "NewReleases", path: NEW_RELEASES_PATH },
    { name: "BecauseYouListened", path: BECAUSE_YOU_LISTENED_PATH },
    { name: "TrendingNow", path: TRENDING_NOW_PATH },
  ];

  for (const { name, path: filePath } of horizontalFiles) {
    const code = fs.readFileSync(filePath, "utf8");
    assert.match(code, /MOBILE_HOME_TOKENS/, `${name} should import MOBILE_HOME_TOKENS`);
    assert.match(code, /MOBILE_HOME_TOKENS\.horizontalRow/, `${name} should use horizontalRow token`);
    assert.match(code, /MOBILE_HOME_TOKENS\.(horizontalCard|sectionSpacing)/, `${name} should use shared card or spacing token`);
    assert.match(code, /MOBILE_HOME_TOKENS\.imageContainer/, `${name} should use imageContainer token for aspect-square`);
    assert.match(code, /MOBILE_HOME_TOKENS\.titleText/, `${name} should use titleText token`);
    assert.match(code, /MOBILE_HOME_TOKENS\.subtitleText/, `${name} should use subtitleText token`);
  }
});

test("popular artists section uses shared tokens and circle aspect-square", () => {
  const code = fs.readFileSync(POPULAR_ARTISTS_PATH, "utf8");
  assert.match(code, /MOBILE_HOME_TOKENS\.horizontalRow/, "PopularArtists should use horizontalRow token");
  assert.match(code, /MOBILE_HOME_TOKENS\.artistCard/, "PopularArtists should use artistCard token");
  assert.match(code, /MOBILE_HOME_TOKENS\.artistImageContainer/, "PopularArtists should use artistImageContainer token");
});

test("MobileHome has unified bottom padding wrapper and horizontal row token", () => {
  const code = fs.readFileSync(MOBILE_HOME_PATH, "utf8");
  assert.match(code, /MOBILE_HOME_TOKENS\.bottomPadding/, "MobileHome wrapper has bottomPadding token");
  assert.doesNotMatch(code, /pb-56/, "MobileHome should not have hardcoded pb-56 empty block");
  assert.match(code, /MOBILE_HOME_TOKENS\.horizontalRow/, "Made for you uses horizontalRow token");
});
