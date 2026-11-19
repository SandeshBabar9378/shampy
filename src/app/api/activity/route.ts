import { NextRequest, NextResponse } from "next/server";
import { withTransaction, type Queryable } from "@/lib/db";
import { rethrowPrerenderSignal, resolveUserId } from "@/lib/auth";
import { EVENT_RETENTION_DAYS, REFRESH } from "@/lib/recommender/config";
import { classifyPlay, mergeLongTerm, mergeMood } from "@/lib/recommender/profile";
import {
  applyKeyStat,
  applySongStat,
  insertListeningEvent,
  lockUserProfile,
  parseLongTerm,
  parseMood,
  saveUserProfile,
  toFeature,
  upsertFeatures,
  type ListeningEventInput,
  type TrackLike,
} from "@/lib/recommender/store";

const KINDS = new Set(["play", "complete", "skip", "like", "unlike", "playlist_add"]);
const MAX_EVENTS = 40;
const DAY_MS = 86_400_000;

interface IncomingEvent {
  kind?: unknown;
  songId?: unknown;
  instanceId?: unknown;
  positionSeconds?: unknown;
  durationSeconds?: unknown;
  replay?: unknown;
  negative?: unknown;
  track?: unknown;
}

interface ActivityBody {
  userId?: unknown;
  sessionId?: unknown;
  events?: unknown;
}

interface PreparedEvent {
  kind: string;
  songId: string;
  instanceId: string | null;
  positionSeconds: number;
  durationSeconds: number;
  replay: number;
  negative: boolean;
  feature: ReturnType<typeof toFeature> | null;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function number(value: unknown, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(max, Math.round(parsed)));
}

function parseTrack(raw: unknown): TrackLike | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = text(record.id, 200);
  if (!id) return null;
  return {
    id,
    title: text(record.title, 500),
    artist: text(record.artist, 500),
    album: text(record.album, 500),
    coverUrl: text(record.coverUrl, 1000),
    duration: number(record.duration, 100_000),
    youtubeId: text(record.youtubeId, 32) || undefined,
    genre: text(record.genre, 100) || undefined,
    language: text(record.language, 100) || undefined,
  };
}

function ok(extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, ...extra });
}

/**
 * Ingests a batch of listening events.
 *
 * Every event runs in its own transaction: the raw row is inserted first and
 * its aggregates, key stats and profile merge only happen when that insert
 * actually succeeded. A retried request (same user + instance + event) is
 * therefore a complete no-op instead of double counting, and a failure rolls
 * the event's changes back as one unit.
 *
 * Input is validated up front so one malformed event cannot poison the batch.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as ActivityBody | null;
    if (!body || !Array.isArray(body.events) || body.events.length === 0) return ok({ ignored: true });

    const userId = await resolveUserId(req, body.userId);
    if (!userId) return ok({ ignored: true });

    const sessionId = text(body.sessionId, 64) || null;
    const now = Date.now();

    const prepared: PreparedEvent[] = [];
    for (const event of (body.events as IncomingEvent[]).slice(0, MAX_EVENTS)) {
      const kind = text(event.kind, 32);
      if (!KINDS.has(kind)) continue;
      const songId = text(event.songId, 200);
      if (!songId) continue;
      const track = parseTrack(event.track);
      const feature = track ? toFeature(track) : null;
      prepared.push({
        kind,
        songId,
        instanceId: text(event.instanceId, 80) || null,
        durationSeconds: number(event.durationSeconds ?? track?.duration ?? 0, 100_000),
        positionSeconds: number(event.positionSeconds, 100_000),
        replay: event.replay === true ? 1 : 0,
        negative: event.negative === true,
        feature: feature && feature.youtubeId ? feature : null,
      });
    }

    if (prepared.length === 0) return ok({ ignored: true });

    const features = [...new Map(
      prepared.filter((event) => event.feature).map((event) => [event.feature!.songId, event.feature!]),
    ).values()];
    if (features.length > 0) {
      await upsertFeatures(features, "activity").catch((err) => {
        console.error("[api/activity] feature upsert failed:", err);
      });
    }

    let processed = 0;
    let duplicates = 0;
    let failed = 0;

    for (const event of prepared) {
      try {
        const applied = await applyEvent(userId, sessionId, event, now);
        if (applied) processed += 1;
        else duplicates += 1;
      } catch (err) {
        failed += 1;
        console.error("[api/activity] event failed:", event.kind, err);
      }
    }

    if (processed > 0) {
      await withTransaction(async (tx) => {
        await tx.query(
          `DELETE FROM listening_events WHERE user_id = $1 AND created_at < now() - interval '${EVENT_RETENTION_DAYS} days'`,
          [userId],
        );
      }).catch((err) => {
        console.error("[api/activity] retention sweep failed:", err);
      });
    }

    // A batch where every event failed is a real failure, not telemetry noise.
    if (processed === 0 && failed > 0) {
      return NextResponse.json(
        { ok: false, error: "activity_ingest_failed", processed, failed },
        { status: 500 },
      );
    }

    return ok({ processed, duplicates, failed });
  } catch (err) {
    rethrowPrerenderSignal(err);
    console.error("[api/activity] error:", err);
    return NextResponse.json({ ok: false, error: "activity_ingest_failed" }, { status: 500 });
  }
}

/** Applies one already-validated event atomically. Returns false for a duplicate. */
async function applyEvent(
  userId: string,
  sessionId: string | null,
  event: PreparedEvent,
  now: number,
): Promise<boolean> {
  const { kind, songId, instanceId, positionSeconds, durationSeconds, replay, negative, feature } = event;

  return withTransaction(async (tx) => {
    const base: ListeningEventInput = {
      songId,
      event: kind,
      positionSeconds,
      durationSeconds,
      completion: null,
      quality: null,
      negative: false,
      instanceId,
      sessionId,
    };

    if (kind === "play") {
      if (!(await insertListeningEvent(tx, userId, base))) return false;
      const plays = await applySongStat(
        userId,
        songId,
        { plays: 1, replays: replay, lastPlayedAt: now },
        tx,
      );
      if (feature) {
        const delta = { plays: 1, replays: replay, lastPlayedAt: now };
        await applyKeyStat("artist_stats", "artist_key", userId, feature.artistKey, delta, tx);
        await applyKeyStat("album_stats", "album_key", userId, feature.albumKey, delta, tx);
      }
      if (plays > 0 && plays % 5 === 0) {
        await bumpSignal(tx, userId, sessionId);
      }
      return true;
    }

    if (kind === "complete") {
      const classification = classifyPlay({
        positionSeconds: Math.max(positionSeconds, durationSeconds),
        durationSeconds,
        complete: true,
        replays: replay,
      });
      if (
        !(await insertListeningEvent(tx, userId, {
          ...base,
          positionSeconds,
          completion: classification.pct,
          quality: classification.quality,
        }))
      ) {
        return false;
      }
      await applySongStat(
        userId,
        songId,
        { quality: classification.quality, completions: 1, lastPlayedAt: now },
        tx,
      );
      if (feature) {
        const delta = { quality: classification.quality, completions: 1, lastPlayedAt: now };
        await applyKeyStat("artist_stats", "artist_key", userId, feature.artistKey, delta, tx);
        await applyKeyStat("album_stats", "album_key", userId, feature.albumKey, delta, tx);
      }
      await updateTaste(tx, userId, sessionId, songId, classification.quality, feature, now, 1);
      return true;
    }

    if (kind === "skip") {
      const classification = classifyPlay({
        positionSeconds,
        durationSeconds,
        complete: false,
        replays: replay,
      });
      // An explicit "back" after real listening is a late skip, not a fast
      // rejection. Early skips (and anything under 10%) stay negative.
      const fastSkip =
        (classification.isFastSkip || negative) &&
        (classification.pct === null || classification.pct < 0.5);
      if (
        !(await insertListeningEvent(tx, userId, {
          ...base,
          completion: classification.pct,
          quality: classification.quality,
          negative: fastSkip,
        }))
      ) {
        return false;
      }
      await applySongStat(
        userId,
        songId,
        {
          quality: classification.quality,
          fastSkips: fastSkip ? 1 : 0,
          lateSkips: classification.isLateSkip ? 1 : 0,
          lastPlayedAt: now,
        },
        tx,
      );
      if (feature) {
        const delta = {
          quality: classification.quality,
          fastSkips: fastSkip ? 1 : 0,
          lateSkips: classification.isLateSkip ? 1 : 0,
          lastPlayedAt: now,
        };
        await applyKeyStat("artist_stats", "artist_key", userId, feature.artistKey, delta, tx);
        await applyKeyStat("album_stats", "album_key", userId, feature.albumKey, delta, tx);
      }
      if (fastSkip) {
        await tx.query(
          `UPDATE song_stats SET times_recommended_ignored = times_recommended_ignored + 1
            WHERE user_id = $1 AND song_id = $2 AND times_recommended > 0 AND last_recommended_at > $3`,
          [userId, songId, now - REFRESH.recentPlayDays * DAY_MS],
        );
      }
      await updateTaste(tx, userId, sessionId, songId, classification.quality, feature, now, 1);
      return true;
    }

    // like / unlike / playlist_add
    if (!(await insertListeningEvent(tx, userId, { ...base, positionSeconds, durationSeconds }))) {
      return false;
    }
    if (kind === "like" || kind === "unlike") {
      const delta = kind === "like" ? 1 : -1;
      await applySongStat(userId, songId, { likes: delta }, tx);
      if (feature) {
        await applyKeyStat("artist_stats", "artist_key", userId, feature.artistKey, { likes: delta }, tx);
        await applyKeyStat("album_stats", "album_key", userId, feature.albumKey, { likes: delta }, tx);
      }
    } else {
      await applySongStat(userId, songId, { playlistAdds: 1 }, tx);
      if (feature) {
        await applyKeyStat("artist_stats", "artist_key", userId, feature.artistKey, { playlistAdds: 1 }, tx);
        await applyKeyStat("album_stats", "album_key", userId, feature.albumKey, { playlistAdds: 1 }, tx);
      }
    }
    await bumpSignal(tx, userId, sessionId);
    return true;
  });
}

async function bumpSignal(tx: Queryable, userId: string, sessionId: string | null): Promise<void> {
  const profile = await lockUserProfile(tx, userId);
  await saveUserProfile(
    userId,
    { signalVersion: (profile.signal_version ?? 0) + 1, sessionId },
    tx,
  );
}

/**
 * Merges one closed play into mood and long-term taste under the profile row
 * lock. Long-term JSON is built from the very first play (so the first 20 plays
 * are not lost); it only becomes *active* at 20 plays via the cold-start stage.
 */
async function updateTaste(
  tx: Queryable,
  userId: string,
  sessionId: string | null,
  songId: string,
  quality: number,
  feature: ReturnType<typeof toFeature> | null,
  now: number,
  countDelta: number,
): Promise<void> {
  const profile = await lockUserProfile(tx, userId);
  const mood = mergeMood(parseMood(profile.mood_json), songId, quality, now);
  const longTerm = feature
    ? mergeLongTerm(parseLongTerm(profile.long_term_json), feature, quality, now)
    : parseLongTerm(profile.long_term_json);
  const longTermCount = (profile.long_term_count ?? 0) + countDelta;

  await saveUserProfile(
    userId,
    {
      mood,
      longTerm,
      longTermCount,
      signalVersion: (profile.signal_version ?? 0) + 1,
      sessionId,
    },
    tx,
  );
}
