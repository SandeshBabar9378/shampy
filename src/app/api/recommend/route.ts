import { NextRequest, NextResponse } from "next/server";
import { rethrowPrerenderSignal, resolveUserId } from "@/lib/auth";
import { getDefaultArtworkFallbackUrl } from "@/lib/artwork";
import { CURATED_TRACKS } from "@/lib/musicProvider";
import type { Track } from "@/lib/types";
import { isValidVideoId } from "@/lib/videoId";
import { LIMITS, REFRESH, SELECTION } from "@/lib/recommender/config";
import { buildProfile } from "@/lib/recommender/profile";
import { affinityLong, queueScore } from "@/lib/recommender/score";
import { isPlayableFeature } from "@/lib/recommender/similar";
import { rankCandidates } from "@/lib/recommender/diversity";
import { fetchRadioTracks } from "@/lib/recommender/radio";
import {
  coListenLookup,
  countSignalsSince,
  ensureUserProfile,
  loadAlbumStats,
  loadArtistStats,
  loadCoListenMap,
  loadFeatures,
  loadLikedFeatures,
  loadMostPlayed,
  loadNegativeEvidence,
  loadPlayedInLast,
  loadSlate,
  loadSongStats,
  markRecommended,
  parseLongTerm,
  parseMood,
  saveSlate,
  saveUserProfile,
  toFeature,
  upsertFeatures,
} from "@/lib/recommender/store";
import type { BuiltProfile } from "@/lib/recommender/profile";
import type { TrackFeature } from "@/lib/recommender/types";

const DAY_MS = 86_400_000;
const QUEUE_SEED_COUNT = 3;
const RADIO_LIMIT = 25;

type Section = "recommended" | "queue" | "most" | "for-you";

function featureToTrack(feature: TrackFeature): Track {
  const youtubeId = isValidVideoId(feature.youtubeId) ? feature.youtubeId : undefined;
  const track: Track = {
    id: feature.songId,
    title: feature.title || "Unknown track",
    artist: feature.artist || "Unknown Artist",
    album: feature.album || "",
    coverUrl: feature.coverUrl || getDefaultArtworkFallbackUrl(),
    duration: feature.duration > 0 ? feature.duration : 180,
    youtubeId,
  };
  if (feature.genre) track.genre = feature.genre;
  if (feature.language) track.language = feature.language;
  return track;
}

function curatedFeatures(): TrackFeature[] {
  return CURATED_TRACKS.map(toFeature).filter(isPlayableFeature);
}

function staticPayload(section: Section, limit: number, seedVideoId: string) {
  const pool = curatedFeatures();
  if (section === "queue") {
    const queueSeeds = pool
      .filter((feature) => feature.songId !== seedVideoId && feature.youtubeId !== seedVideoId)
      .slice(0, limit)
      .map(featureToTrack);
    return { recommended: [] as Track[], queueSeeds, tracks: [] as Track[] };
  }
  return {
    recommended: pool.slice(0, limit).map(featureToTrack),
    queueSeeds: [] as Track[],
    tracks: pool.slice(0, limit).map(featureToTrack),
  };
}

function debugPayload(value: Record<string, unknown>): Record<string, unknown> | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  return value;
}

/** Keeps the richest metadata when the same song arrives from several sources. */
function mergeFeature(existing: TrackFeature, incoming: TrackFeature): TrackFeature {
  return {
    ...existing,
    youtubeId: existing.youtubeId ?? incoming.youtubeId,
    title: existing.title || incoming.title,
    artist: existing.artist || incoming.artist,
    artistKey: existing.artistKey || incoming.artistKey,
    album: existing.album || incoming.album,
    albumKey: existing.albumKey || incoming.albumKey,
    coverUrl: existing.coverUrl || incoming.coverUrl,
    genre: existing.genre ?? incoming.genre,
    language: existing.language ?? incoming.language,
    duration: existing.duration > 0 ? existing.duration : incoming.duration,
  };
}

/** True for failures that mean the database itself is unavailable/broken. */
function isDatabaseError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code !== "string") return false;
  return code.startsWith("42") || code.startsWith("57") || ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "EPIPE"].includes(code);
}

/** Filters a scored list down to diverse, playable queue additions. */
function pickDiverse<T extends { feature: TrackFeature }>(rows: T[], limit: number): T[] {
  const picked: T[] = [];
  const perArtist = new Map<string, number>();
  for (const row of rows) {
    if (picked.length >= limit) break;
    const artist = row.feature.artistKey;
    if (artist) {
      const used = perArtist.get(artist) ?? 0;
      if (used >= LIMITS.queuePerArtist) continue;
      perArtist.set(artist, used + 1);
    }
    picked.push(row);
  }
  return picked;
}

export async function GET(req: NextRequest) {
  // Touch request data before any try block (see rethrowPrerenderSignal).
  const params = new URL(req.url).searchParams;
  const claimedId = params.get("userId");
  const rawSection = params.get("section");
  const section: Section =
    rawSection === "queue" ? "queue" : rawSection === "most" ? "most" : rawSection === "for-you" ? "for-you" : "recommended";
  const rawLimit = Number(params.get("limit"));
  const mode = params.get("mode") === "low" ? "low" : "high";
  const maxLimit = mode === "low" ? Math.min(12, LIMITS.max) : LIMITS.max;
  const defaultLimit = section === "queue" ? LIMITS.queueDefault : LIMITS.default;
  const limit = Math.min(
    maxLimit,
    Math.max(1, Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : defaultLimit),
  );
  const seedVideoId = (params.get("seedVideoId") ?? "").trim();
  const sessionId = (params.get("session") ?? "").slice(0, 64) || null;
  const queueIds = (params.get("queueIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(isValidVideoId)
    .slice(0, 50);

  const fallback = () => NextResponse.json(staticPayload(section, limit, seedVideoId));

  try {
    const userId = await resolveUserId(req, claimedId);
    if (!userId) return fallback();

    const now = Date.now();
    const today = new Date(now).toISOString().slice(0, 10);
    const profileRow = await ensureUserProfile(userId);

    // ── "Your Most Played" is real play counts, never localStorage ──────────
    if (section === "most") {
      const featureList = await loadMostPlayed(userId, limit);
      const tracks = featureList.filter(isPlayableFeature).map(featureToTrack);
      // No invented "most played": an empty list lets Home use its recents
      // fallback instead of presenting curated songs as personal history.
      return NextResponse.json({
        recommended: [] as Track[],
        queueSeeds: [] as Track[],
        tracks,
      });
    }

    const [stats, artistStats, albumStats, likedFeatures] = await Promise.all([
      loadSongStats(userId),
      loadArtistStats(userId),
      loadAlbumStats(userId),
      loadLikedFeatures(userId),
    ]);
    const mood = parseMood(profileRow.mood_json);
    const longTerm = parseLongTerm(profileRow.long_term_json);
    const profile = buildProfile({
      songs: stats,
      artists: artistStats,
      albums: albumStats,
      mood,
      longTerm,
      longTermCount: profileRow.long_term_count ?? 0,
      now,
    });
    const statsMap = new Map(stats.map((row) => [row.songId, row]));

    // ── Section cache: Home must not reshuffle on every render ──────────────
    if (section === "recommended") {
      const slate = await loadSlate(userId, section);
      let sessionStartedAt = profileRow.session_started_at;
      if (profileRow.session_id !== sessionId || sessionStartedAt === null) {
        sessionStartedAt = now;
        await saveUserProfile(userId, { sessionId, sessionStartedAt: now });
      }

      if (slate && sessionId !== null) {
        const sameSession = slate.session_id === sessionId;
        const sessionExpired = now - sessionStartedAt > REFRESH.sessionMinutes * 60_000;
        const dayChanged = slate.built_day !== today;
        // Qualified signals = closed plays / explicit feedback, and they must
        // span at least two distinct tracks. Three events from one song cannot
        // reshuffle the whole Home page.
        const signals = await countSignalsSince(userId, slate.built_at);
        const signalsMoved =
          signals.count >= REFRESH.signalDelta && signals.tracks >= REFRESH.signalDistinctTracks;
        if (sameSession && !sessionExpired && !dayChanged && !signalsMoved) {
          try {
            const cached = JSON.parse(slate.payload) as { recommended?: Track[] };
            if (Array.isArray(cached.recommended) && cached.recommended.length > 0) {
              const cachedDebug = debugPayload({ cached: true, stage: profile.stage });
              return NextResponse.json({
                recommended: cached.recommended,
                queueSeeds: [],
                ...(cachedDebug ? { debug: cachedDebug } : {}),
              });
            }
          } catch {
            /* corrupt cache falls through to a rebuild */
          }
        }
      }
    }

    // ── Candidate pool ─────────────────────────────────────────────────────
    const [negatives, coListenMap, playedInLast3] = await Promise.all([
      loadNegativeEvidence(userId, REFRESH.negativeWindowDays),
      loadCoListenMap(userId, 60),
      loadPlayedInLast(userId, 3),
    ]);
    const coListen = coListenLookup(coListenMap);

    const featureMap = new Map<string, TrackFeature>();
    const videoOwner = new Map<string, string>();
    const addFeature = (feature: TrackFeature | null | undefined) => {
      if (!isPlayableFeature(feature)) return;
      const videoId = feature.youtubeId;
      const ownerId = videoId ? videoOwner.get(videoId) : undefined;
      if (videoId && ownerId && ownerId !== feature.songId) {
        // Same recording, different catalog id. Prefer the identity that has
        // real stats so personalisation is not split in two.
        const owner = featureMap.get(ownerId);
        const incomingHasStats = statsMap.has(feature.songId);
        const ownerHasStats = statsMap.has(ownerId);
        if (incomingHasStats && !ownerHasStats) {
          featureMap.delete(ownerId);
          featureMap.set(feature.songId, mergeFeature(feature, owner ?? feature));
          videoOwner.set(videoId, feature.songId);
        } else if (owner) {
          featureMap.set(ownerId, mergeFeature(owner, feature));
        }
        return;
      }
      const existing = featureMap.get(feature.songId);
      featureMap.set(feature.songId, existing ? mergeFeature(existing, feature) : feature);
      if (videoId) videoOwner.set(videoId, feature.songId);
    };

    for (const feature of curatedFeatures()) addFeature(feature);
    for (const feature of likedFeatures) addFeature(feature);

    const knownIds = [...new Set([...stats.map((row) => row.songId), ...likedFeatures.map((f) => f.songId)])]
      .slice(0, SELECTION.candidateCap);
    if (knownIds.length > 0) {
      const stored = await loadFeatures(knownIds);
      for (const feature of stored.values()) addFeature(feature);
    }

    // Seeds use the catalog identity but must resolve to a playable video id.
    const seeds = [...stats]
      .filter((row) => row.plays > 0)
      .map((row) => {
        const videoId =
          featureMap.get(row.songId)?.youtubeId ??
          (isValidVideoId(row.songId) ? row.songId : null);
        return {
          videoId,
          songId: row.songId,
          weight: affinityLong(row, now) + (profile.mood.get(row.songId) ?? 0),
        };
      })
      .filter((row): row is { videoId: string; songId: string; weight: number } =>
        Boolean(row.videoId && isValidVideoId(row.videoId)),
      )
      .sort((a, b) => b.weight - a.weight)
      .slice(0, QUEUE_SEED_COUNT);

    // No play history yet? Likes are still a real, personal signal and make a
    // far better radio seed than a generic chart track.
    if (seeds.length < QUEUE_SEED_COUNT) {
      for (const feature of likedFeatures) {
        if (seeds.length >= QUEUE_SEED_COUNT) break;
        if (!feature.youtubeId || !isValidVideoId(feature.youtubeId)) continue;
        if (seeds.some((seed) => seed.videoId === feature.youtubeId)) continue;
        seeds.push({ videoId: feature.youtubeId, songId: feature.songId, weight: 0 });
      }
    }

    const radioSeed = isValidVideoId(seedVideoId) ? seedVideoId : seeds[0]?.videoId;
    const radioSeeds = [...new Set([radioSeed, ...seeds.map((row) => row.videoId)].filter((id): id is string => Boolean(id)))]
      .slice(0, QUEUE_SEED_COUNT);

    const radioPages = await Promise.all(radioSeeds.map((id) => fetchRadioTracks(id, RADIO_LIMIT)));
    const radioFeatures = radioPages.flat().map((track) =>
      toFeature({
        id: track.videoId,
        title: track.title,
        artist: track.artist,
        album: track.album,
        coverUrl: track.thumbnail,
        duration: track.duration,
        youtubeId: track.videoId,
      }),
    );
    for (const feature of radioFeatures) addFeature(feature);

    if (radioFeatures.length > 0) {
      await upsertFeatures(radioFeatures, "radio").catch((err) => {
        console.error("[api/recommend] feature upsert failed:", err);
      });
    }

    const candidates = [...featureMap.values()].slice(0, SELECTION.candidateCap);
    const seedFeature =
      (radioSeed ? featureMap.get(videoOwner.get(radioSeed) ?? "") ?? null : null) ??
      (radioSeed
        ? {
            songId: videoOwner.get(radioSeed) ?? radioSeed,
            youtubeId: radioSeed,
            title: "",
            artist: "",
            artistKey: "",
            album: "",
            albumKey: "",
            coverUrl: "",
            genre: null,
            language: null,
            duration: 0,
          }
        : null);

    // ── Queue: current-track driven, never touches the manual queue ────────
    if (section === "queue") {
      const queueSet = new Set(queueIds);
      const lastThree = new Set(playedInLast3);
      const isQueued = (feature: TrackFeature) =>
        queueSet.has(feature.songId) || Boolean(feature.youtubeId && queueSet.has(feature.youtubeId));
      const isSeed = (feature: TrackFeature) =>
        feature.songId === seedVideoId ||
        feature.youtubeId === seedVideoId ||
        (seedFeature ? feature.songId === seedFeature.songId : false);

      const scored = candidates
        .filter((feature) => !isSeed(feature) && !isQueued(feature))
        .map((feature) => ({
          feature,
          score: queueScore({
            stats: statsMap.get(feature.songId) ?? null,
            feature,
            profile,
            seed: seedFeature,
            coListen: coListen(seedFeature?.songId ?? "", feature.songId),
            inQueue: false,
            playedInLast3: lastThree.has(feature.songId),
            now,
          }),
        }))
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score || a.feature.songId.localeCompare(b.feature.songId));

      const diverse = pickDiverse(scored, limit);
      const queueSeeds =
        diverse.length > 0
          ? diverse.map((row) => featureToTrack(row.feature))
          : staticPayload("queue", limit, seedVideoId).queueSeeds;

      const queueDebug = debugPayload({
        stage: profile.stage,
        candidates: candidates.length,
        seed: seedFeature?.songId ?? null,
      });
      return NextResponse.json({
        recommended: [] as Track[],
        queueSeeds,
        ...(queueDebug ? { debug: queueDebug } : {}),
      });
    }

    // ── Recommended / for-you slate ────────────────────────────────────────
    const excluded = (songId: string): boolean => {
      const row = statsMap.get(songId);
      if (!row || row.plays > 0) return false;
      if (row.timesRecommended < REFRESH.exclusionRecommendations) return false;
      if (row.lastRecommendedAt === null) return false;
      return now - row.lastRecommendedAt < REFRESH.exclusionDays * DAY_MS;
    };

    // "for-you" deliberately ignores the current seed so it reflects overall
    // taste; "recommended" leans on the strongest recent track.
    const rankSeed: TrackFeature | null = section === "for-you" ? null : seedFeature;
    const rankLimit = section === "for-you" ? Math.min(limit, 12) : limit;

    const { picks, buckets } = rankCandidates({
      candidates: candidates.map((feature) => ({
        feature,
        stats: statsMap.get(feature.songId) ?? null,
        negative: negatives.get(feature.songId) ?? { fastSkips: 0, completions: 0 },
      })),
      profile: profile as BuiltProfile,
      seed: rankSeed,
      now,
      limit: rankLimit,
      coListen,
      exclude: excluded,
    });

    const tracks = picks.map((pick) => featureToTrack(pick.feature));
    if (tracks.length === 0) return fallback();

    if (section === "for-you") {
      const debug = debugPayload({
        stage: profile.stage,
        plays: profile.plays,
        candidates: candidates.length,
        buckets,
      });
      return NextResponse.json({
        recommended: [] as Track[],
        queueSeeds: [] as Track[],
        tracks,
        ...(debug ? { debug } : {}),
      });
    }

    await markRecommended(userId, picks.map((pick) => pick.feature.songId), now).catch((err) => {
      console.error("[api/recommend] markRecommended failed:", err);
    });
    await saveSlate(
      userId,
      "recommended",
      JSON.stringify({ recommended: tracks }),
      profileRow.signal_version ?? 0,
      now,
      sessionId,
      today,
    ).catch((err) => {
      console.error("[api/recommend] slate save failed:", err);
    });

    const debug = debugPayload({
      stage: profile.stage,
      plays: profile.plays,
      candidates: candidates.length,
      radioSeeds,
      buckets,
      cached: false,
    });

    return NextResponse.json({
      recommended: tracks,
      queueSeeds: [] as Track[],
      ...(debug ? { debug } : {}),
    });
  } catch (err) {
    rethrowPrerenderSignal(err);
    console.error("[api/recommend] error:", err);
    // A degraded recommendation is acceptable; pretending the database is
    // healthy when it is not is not. Home falls back locally on a non-2xx.
    if (isDatabaseError(err)) {
      return NextResponse.json({ error: "database_unavailable" }, { status: 503 });
    }
    return fallback();
  }
}
