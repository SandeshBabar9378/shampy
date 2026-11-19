/**
 * Objective tests for the pure recommendation engine.
 *
 * The TypeScript modules are compiled to CommonJS first (see the run command
 * in the report); these tests never touch the DB, the network or React.
 *
 *   node --test tests/recommender.test.cjs
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const config = require("../.tmp-recommender/config.js");
const similar = require("../.tmp-recommender/similar.js");
const profileMod = require("../.tmp-recommender/profile.js");
const scoreMod = require("../.tmp-recommender/score.js");
const diversity = require("../.tmp-recommender/diversity.js");
const types = require("../.tmp-recommender/types.js");

const NOW = Date.UTC(2026, 10, 19);
const DAY = 86_400_000;

function feature(id, artist, overrides = {}) {
  return {
    songId: id,
    youtubeId: overrides.youtubeId === undefined ? id : overrides.youtubeId,
    title: `Title ${id}`,
    artist,
    artistKey: similar.artistKey(artist),
    album: `${id} album`,
    albumKey: similar.albumKey(`${id} album`),
    coverUrl: "",
    genre: overrides.genre === undefined ? null : overrides.genre,
    language: overrides.language === undefined ? null : overrides.language,
    duration: 200,
  };
}

function stats(id, overrides = {}) {
  return {
    songId: id,
    plays: 0,
    qualitySum: 0,
    completions: 0,
    fastSkips: 0,
    lateSkips: 0,
    replays: 0,
    likes: 0,
    playlistAdds: 0,
    lastPlayedAt: null,
    timesRecommended: 0,
    timesRecommendedIgnored: 0,
    lastRecommendedAt: null,
    ...overrides,
  };
}

function fullLongTerm(plays) {
  return { artists: {}, albums: {}, tags: {}, topGenres: [], plays };
}

// ─── listen quality ──────────────────────────────────────────────────────────

test("listenQuality buckets follow the configured thresholds", () => {
  const q = (positionSeconds, durationSeconds, complete, replays) =>
    profileMod.classifyPlay({ positionSeconds, durationSeconds, complete, replays });

  const fast = q(5, 200);
  assert.equal(fast.quality, 0, "pct 0.025 -> 0.0");
  assert.equal(fast.isFastSkip, true);

  const mid = q(60, 200);
  assert.equal(mid.quality, 0.15, "pct 0.30 -> 0.15");
  assert.equal(mid.isLateSkip, true);
  assert.equal(mid.isFastSkip, false);

  const late = q(140, 200);
  assert.equal(late.quality, 0.45, "pct 0.70 -> 0.45");
  assert.equal(late.isLateSkip, false);

  assert.equal(q(180, 200).quality, 1, "pct 0.90 -> 1.0");
  assert.equal(q(0, 200, true).quality, 1.2, "complete -> 1.2");
  assert.equal(q(0, 200, true, 2).quality, 2, "complete + 2 replays caps at 2.0");
});

test("unknown duration is neutral, never a skip, excluded from completion rate", () => {
  const result = profileMod.classifyPlay({ positionSeconds: 10, durationSeconds: 0 });
  assert.equal(result.quality, 0.45);
  assert.equal(result.pct, null);
  assert.equal(result.isFastSkip, false);
  assert.equal(result.isLateSkip, false);
  assert.equal(result.countsForCompletion, false);

  const shortTrack = profileMod.classifyPlay({ positionSeconds: 20, durationSeconds: 60 });
  assert.equal(shortTrack.isFastSkip, true, "played 20s of a 60s track is a fast skip");
  assert.equal(shortTrack.quality, 0.15, "quality still follows the pct bucket");
});

// ─── decay ───────────────────────────────────────────────────────────────────

test("decay halves on the half-life and is zero without a timestamp", () => {
  assert.equal(similar.decayFactor(NOW, NOW, 60), 1);
  assert.ok(Math.abs(similar.decayFactor(NOW, NOW - 60 * DAY, 60) - 0.5) < 1e-12);
  assert.ok(Math.abs(similar.decayFactor(NOW, NOW - 120 * DAY, 60) - 0.25) < 1e-12);
  assert.ok(Math.abs(similar.decayFactor(NOW, NOW - 3 * DAY, 3) - 0.5) < 1e-12);
  assert.equal(similar.decayFactor(NOW, null, 60), 0);
});

// ─── artist key ──────────────────────────────────────────────────────────────

test("artistKey normalizes credits, diacritics and whitespace", () => {
  assert.equal(similar.artistKey("Arijit Singh & Pritam"), "arijit singh");
  assert.equal(similar.artistKey("Diljit Dosanjh feat. Sia"), "diljit dosanjh");
  assert.equal(similar.artistKey("Kendrick Lamar, SZA"), "kendrick lamar");
  assert.equal(similar.artistKey("Anuv Jain with Someone"), "anuv jain");
  assert.equal(similar.artistKey("Beyoncé"), "beyonce");
  assert.equal(similar.artistKey("  Kabir   Singh "), "kabir singh");
});

// ─── similarity / NULL renormalization ───────────────────────────────────────

test("unknown genre/language drops the tag term and renormalizes the rest", () => {
  const seed = feature("seed", "Same Artist", { genre: null, language: null });
  const candidate = feature("cand", "Same Artist", { genre: "pop", language: null });

  // coListen null (dropped), sameArtist 1, sameAlbum 0, tags dropped.
  const value = similar.trackSimilarity(seed, candidate, null);
  assert.ok(Math.abs(value - 0.25 / 0.4) < 1e-12, `expected 0.625, got ${value}`);
  assert.notEqual(value, 0, "a NULL genre must not read as a mismatch");

  const bothTagged = similar.trackSimilarity(
    feature("a", "Same Artist", { genre: "pop" }),
    feature("b", "Same Artist", { genre: "pop" }),
    null,
  );
  assert.ok(Math.abs(bothTagged - 0.4 / 0.55) < 1e-12, `expected ~0.7273, got ${bothTagged}`);
});

test("a feature without a valid youtubeId is not playable", () => {
  const playable = feature("34Na4j8AVgA", "Artist");
  const unplayable = feature("itunes-123", "Artist", { youtubeId: null });

  assert.equal(similar.isPlayableFeature(playable), true);
  assert.equal(similar.isPlayableFeature(unplayable), false);

  const filtered = [playable, unplayable].filter(similar.isPlayableFeature);
  assert.deepEqual(
    filtered.map((row) => row.songId),
    ["34Na4j8AVgA"],
  );
});

// ─── score ───────────────────────────────────────────────────────────────────

test("scoreCandidate matches the documented formula and caps mood at 45%", () => {
  const songStats = stats("s1", {
    plays: 10,
    qualitySum: 12,
    completions: 8,
    replays: 1,
    lastPlayedAt: NOW,
  });
  const songFeature = feature("s1", "Solo Artist", { genre: "pop" });
  const profile = profileMod.buildProfile({
    songs: [songStats],
    artists: [],
    albums: [],
    mood: { s1: { q: 12, n: 10, t: NOW } },
    longTerm: fullLongTerm(30),
    longTermCount: 30,
    now: NOW,
  });

  const { score, parts } = scoreMod.scoreCandidate({
    stats: songStats,
    feature: songFeature,
    profile,
    seed: null,
    coListen: null,
    sameArtistInSlate: false,
    negative: { fastSkips: 0, completions: 0 },
    now: NOW,
  });

  const rest =
    1.6 * 1 + // affinityLong: (12/10)/1.2 * 1
    1.4 * 0 + // no seed -> similarity 0
    0.8 * 0.8 + // completionRate 8/10
    0.5 * 0.1 + // replayRate 1/10
    0.6 * 0 + // playlistAffinity
    0.4 * (1 / 11); // discoveryBonus 1/(1+10)
  const rawMood = 2 * 1;
  // Cap solved against the final positive score: mood <= 0.45/(1-0.45) * rest.
  const moodTerm = Math.min(rawMood, (0.45 / 0.55) * rest);
  const expected = rest + moodTerm - 1.2 * 0.5; // played recently -> repetition 0.5

  assert.ok(Math.abs(score - expected) < 1e-9, `expected ${expected}, got ${score}`);
  assert.ok(
    parts.moodContribution <= 0.45 * parts.positive + 1e-9,
    "mood contribution never exceeds 45% of the positive score",
  );
  assert.ok(
    Math.abs(parts.moodContribution - 0.45 * parts.positive) < 1e-9,
    "the cap is exact for this fixture",
  );
});

test("stage gating keeps long-term and mood off below the thresholds", () => {
  const songStats = stats("s1", {
    plays: 10,
    qualitySum: 12,
    completions: 8,
    replays: 1,
    lastPlayedAt: NOW,
  });
  const songFeature = feature("s1", "Solo Artist");

  const lowProfile = profileMod.buildProfile({
    songs: [songStats],
    artists: [],
    albums: [],
    mood: { s1: { q: 12, n: 10, t: NOW } },
    longTerm: { artists: { "solo artist": { q: 12, n: 10, t: NOW } }, albums: {}, tags: {}, topGenres: [], plays: 3 },
    longTermCount: 3,
    now: NOW,
  });

  assert.equal(lowProfile.stage, "similarity");
  assert.equal(lowProfile.longTermArtists.size, 0, "long-term stays inactive under 20 plays");

  const { score } = scoreMod.scoreCandidate({
    stats: songStats,
    feature: songFeature,
    profile: lowProfile,
    seed: null,
    coListen: null,
    sameArtistInSlate: false,
    negative: { fastSkips: 0, completions: 0 },
    now: NOW,
  });

  const expected = 0 + 0.8 * 0.8 + 0.5 * 0.1 + 0.6 * 0 + 0.4 * (1 / 11) - 1.2 * 0.5;
  assert.ok(Math.abs(score - expected) < 1e-9, `expected ${expected}, got ${score}`);
});

test("one fast skip never lowers a score, three do", () => {
  const songFeature = feature("s1", "Solo Artist");
  const base = stats("s1", { plays: 6, qualitySum: 6, completions: 4, lastPlayedAt: NOW - 30 * DAY });
  const profile = profileMod.buildProfile({
    songs: [base],
    artists: [],
    albums: [],
    mood: {},
    longTerm: fullLongTerm(30),
    longTermCount: 30,
    now: NOW,
  });

  const run = (fastSkips) =>
    scoreMod.scoreCandidate({
      stats: { ...base, fastSkips },
      feature: songFeature,
      profile,
      seed: null,
      coListen: null,
      sameArtistInSlate: false,
      negative: { fastSkips, completions: 0 },
      now: NOW,
    }).score;

  const none = run(0);
  const one = run(1);
  const three = run(3);

  assert.equal(one, none, "a single fast skip applies no penalty");
  assert.ok(three < none - 0.5, `three fast skips must penalize, got ${three} vs ${none}`);
});

// ─── profiles ────────────────────────────────────────────────────────────────

test("three plays change the mood profile but leave long_term_json identical", () => {
  let mood = {};
  let longTerm = types.emptyLongTerm();
  let longTermCount = 0;
  const songFeature = feature("s1", "Solo Artist", { genre: "pop" });

  for (let i = 0; i < 3; i += 1) {
    mood = profileMod.mergeMood(mood, "s1", 1.2, NOW + i);
    longTermCount += 1;
    if (longTermCount >= config.PROFILE.longTermMinPlays) {
      longTerm = profileMod.mergeLongTerm(longTerm, songFeature, 1.2, NOW + i);
    }
  }

  assert.equal(Object.keys(mood).length, 1, "mood recorded the plays");
  assert.deepEqual(longTerm, types.emptyLongTerm(), "long-term profile untouched below 20 plays");

  for (let i = 3; i < 20; i += 1) {
    mood = profileMod.mergeMood(mood, "s1", 1.2, NOW + i);
    longTermCount += 1;
    if (longTermCount >= config.PROFILE.longTermMinPlays) {
      longTerm = profileMod.mergeLongTerm(longTerm, songFeature, 1.2, NOW + i);
    }
  }
  assert.notDeepEqual(longTerm, types.emptyLongTerm(), "long-term starts at 20 plays");
  assert.deepEqual(longTerm.topGenres, ["pop"]);
});

// ─── selection ───────────────────────────────────────────────────────────────

function buildMixScenario() {
  const candidates = [];
  const allStats = [];
  const artistRows = [];

  for (let i = 0; i < 30; i += 1) {
    const row = feature(`fam${i}`, `Familiar Artist ${i}`);
    candidates.push({ feature: row, stats: stats(row.songId, {
      plays: 6,
      qualitySum: 7,
      completions: 5,
      lastPlayedAt: NOW - 10 * DAY,
    }), negative: { fastSkips: 0, completions: 0 } });
    allStats.push(candidates[candidates.length - 1].stats);
  }

  for (let i = 0; i < 10; i += 1) {
    const row = feature(`rel${i}`, `Known Artist ${i}`);
    const rowStats = stats(row.songId, {
      plays: 1,
      qualitySum: 1.2,
      completions: 1,
      lastPlayedAt: NOW - 3 * DAY,
    });
    candidates.push({ feature: row, stats: rowStats, negative: { fastSkips: 0, completions: 0 } });
    allStats.push(rowStats);
    artistRows.push({
      key: row.artistKey,
      plays: 4,
      qualitySum: 5,
      completions: 3,
      fastSkips: 0,
      lateSkips: 0,
      likes: 0,
      playlistAdds: 0,
      lastPlayedAt: NOW - 3 * DAY,
      timesRecommended: 0,
      timesRecommendedIgnored: 0,
    });
  }

  for (let i = 0; i < 8; i += 1) {
    const row = feature(`exp${i}`, `Unknown Artist ${i}`);
    candidates.push({ feature: row, stats: null, negative: { fastSkips: 0, completions: 0 } });
  }

  const profile = profileMod.buildProfile({
    songs: allStats,
    artists: artistRows,
    albums: [],
    mood: {},
    longTerm: fullLongTerm(30),
    longTermCount: 30,
    now: NOW,
  });

  return { candidates, profile };
}

test("20-item slate honours bucket quotas, dedupes and caps artists", () => {
  const { candidates, profile } = buildMixScenario();
  const { picks, buckets } = diversity.rankCandidates({
    candidates,
    profile,
    seed: null,
    now: NOW,
    limit: 20,
  });

  assert.equal(picks.length, 20);

  const ids = picks.map((pick) => pick.feature.songId);
  assert.equal(new Set(ids).size, ids.length, "no duplicate song_id");

  const perArtist = new Map();
  for (const pick of picks) {
    const key = pick.feature.artistKey;
    perArtist.set(key, (perArtist.get(key) ?? 0) + 1);
  }
  for (const [artist, count] of perArtist) {
    assert.ok(count <= 2, `artist ${artist} appeared ${count} times`);
  }

  assert.ok(buckets.familiar >= 11 && buckets.familiar <= 15, `familiar ${buckets.familiar}`);
  assert.ok(buckets.related >= 3 && buckets.related <= 7, `related ${buckets.related}`);
  assert.ok(buckets.experimental >= 1 && buckets.experimental <= 3, `experimental ${buckets.experimental}`);
  assert.equal(buckets.familiar + buckets.related + buckets.experimental, 20);
});

test("the same artist never fills more than 2 of a 20-item slate", () => {
  const candidates = [];
  const allStats = [];
  for (let i = 0; i < 6; i += 1) {
    const row = feature(`rep${i}`, "Repeat Artist");
    const rowStats = stats(row.songId, { plays: 5, qualitySum: 6, completions: 4, lastPlayedAt: NOW - 9 * DAY });
    candidates.push({ feature: row, stats: rowStats, negative: { fastSkips: 0, completions: 0 } });
    allStats.push(rowStats);
  }
  for (let i = 0; i < 20; i += 1) {
    const row = feature(`other${i}`, `Other Artist ${i}`);
    const rowStats = stats(row.songId, { plays: 4, qualitySum: 5, completions: 3, lastPlayedAt: NOW - 9 * DAY });
    candidates.push({ feature: row, stats: rowStats, negative: { fastSkips: 0, completions: 0 } });
    allStats.push(rowStats);
  }

  const profile = profileMod.buildProfile({
    songs: allStats,
    artists: [],
    albums: [],
    mood: {},
    longTerm: fullLongTerm(30),
    longTermCount: 30,
    now: NOW,
  });

  const { picks } = diversity.rankCandidates({ candidates, profile, seed: null, now: NOW, limit: 20 });
  const repeat = picks.filter((pick) => pick.feature.artistKey === "repeat artist").length;
  assert.ok(repeat <= 2, `repeat artist picked ${repeat} times`);
});

test("with zero similarity the slate is ordered by score", () => {
  const candidates = [];
  const allStats = [];
  const qualities = [12, 9, 6, 3, 1];
  for (let i = 0; i < qualities.length; i += 1) {
    const row = feature(`ord${i}`, `Ordered Artist ${i}`);
    const rowStats = stats(row.songId, {
      plays: 10,
      qualitySum: qualities[i],
      completions: 5,
      lastPlayedAt: NOW - 10 * DAY,
    });
    candidates.push({ feature: row, stats: rowStats, negative: { fastSkips: 0, completions: 0 } });
    allStats.push(rowStats);
  }

  const profile = profileMod.buildProfile({
    songs: allStats,
    artists: [],
    albums: [],
    mood: {},
    longTerm: fullLongTerm(30),
    longTermCount: 30,
    now: NOW,
  });

  const { picks } = diversity.rankCandidates({ candidates, profile, seed: null, now: NOW, limit: 5 });
  assert.equal(picks.length, 5);
  for (let i = 1; i < picks.length; i += 1) {
    assert.ok(picks[i - 1].score >= picks[i].score, "scores are non-increasing");
  }
  assert.ok(picks[0].score > picks[4].score, "the best song is first");
});

test("a brand-new user still gets a non-empty slate", () => {
  const candidates = [];
  for (let i = 0; i < 10; i += 1) {
    candidates.push({
      feature: feature(`curated${i}`, `New Artist ${i}`, { genre: `genre-${i}` }),
      stats: null,
      negative: { fastSkips: 0, completions: 0 },
    });
  }

  const profile = profileMod.buildProfile({
    songs: [],
    artists: [],
    albums: [],
    mood: {},
    longTerm: types.emptyLongTerm(),
    longTermCount: 0,
    now: NOW,
  });
  assert.equal(profile.stage, "cold");

  const { picks } = diversity.rankCandidates({ candidates, profile, seed: null, now: NOW, limit: 8 });
  assert.ok(picks.length > 0, "cold start must return tracks");
  assert.equal(picks.length, 8);
});

test("an empty candidate pool returns no picks so the route can fall back", () => {
  const profile = profileMod.buildProfile({
    songs: [],
    artists: [],
    albums: [],
    mood: {},
    longTerm: types.emptyLongTerm(),
    longTermCount: 0,
    now: NOW,
  });

  const { picks } = diversity.rankCandidates({ candidates: [], profile, seed: null, now: NOW, limit: 20 });
  assert.equal(picks.length, 0);
});

// ─── long-term affinity / identity dedupe / negative floor ───────────────────

test("long-term artist and tag affinity enter the score only for a mature profile", () => {
  const songFeature = feature("s1", "Solo Artist", { genre: "pop" });
  const longTerm = {
    artists: { "solo artist": { q: 12, n: 10, t: NOW } },
    albums: {},
    tags: { "genre:pop": { q: 12, n: 10, t: NOW } },
    topGenres: ["pop"],
    plays: 30,
  };

  const mature = profileMod.buildProfile({
    songs: [],
    artists: [],
    albums: [],
    mood: {},
    longTerm,
    longTermCount: 30,
    now: NOW,
  });
  assert.ok(scoreMod.profileAffinity(songFeature, mature) > 0.9, "known artist + tag reads as strong affinity");
  assert.equal(scoreMod.profileAffinity(feature("x", "Unknown", { genre: null }), mature), 0, "missing metadata contributes nothing");

  const immature = profileMod.buildProfile({
    songs: [],
    artists: [],
    albums: [],
    mood: {},
    longTerm,
    longTermCount: 3,
    now: NOW,
  });
  assert.equal(scoreMod.profileAffinity(songFeature, immature), 0, "immature profile never uses long-term taste");
});

test("the same recording under two catalog ids is offered once", () => {
  const profile = profileMod.buildProfile({
    songs: [],
    artists: [],
    albums: [],
    mood: {},
    longTerm: types.emptyLongTerm(),
    longTermCount: 0,
    now: NOW,
  });
  const candidates = [
    { feature: feature("34Na4j8AVgA", "Artist A"), stats: null, negative: { fastSkips: 0, completions: 0 } },
    {
      feature: feature("catalog-1", "Artist A", { youtubeId: "34Na4j8AVgA" }),
      stats: null,
      negative: { fastSkips: 0, completions: 0 },
    },
  ];

  const { picks } = diversity.rankCandidates({ candidates, profile, seed: null, now: NOW, limit: 5 });
  assert.equal(picks.length, 1, "duplicate video id is dropped");
});

test("net-negative candidates are never used to fill a slate", () => {
  const profile = profileMod.buildProfile({
    songs: [],
    artists: [],
    albums: [],
    mood: {},
    longTerm: types.emptyLongTerm(),
    longTermCount: 0,
    now: NOW,
  });
  const candidates = [
    {
      feature: feature("bad", "Skipped Artist"),
      stats: stats("bad", { plays: 10, qualitySum: 0, completions: 0, lastPlayedAt: null }),
      negative: { fastSkips: 8, completions: 0 },
    },
  ];

  const { picks } = diversity.rankCandidates({ candidates, profile, seed: null, now: NOW, limit: 5 });
  assert.equal(picks.length, 0);
});
