import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { query, queryOne, withTransaction } from "@/lib/db";

export const SESSION_COOKIE = "shubhu_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // 180 days

// Guest identities are the random per-device ids the app has always used.
const GUEST_ID_RE = /^(device|user)_[A-Za-z0-9]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * With Cache Components, Next prerenders GET handlers at build time and aborts
 * that by throwing when request data is touched. A catch-all `try/catch` must
 * not swallow that signal, or a 500 gets baked into the build.
 */
export function rethrowPrerenderSignal(err: unknown): void {
  if (typeof err === "object" && err !== null && (err as { digest?: string }).digest === "NEXT_PRERENDER_INTERRUPTED") {
    throw err;
  }
}

export function isGuestId(id: unknown): id is string {
  return typeof id === "string" && GUEST_ID_RE.test(id);
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === "string" && /^\d{4}$/.test(pin);
}

// ─── PIN hashing ──────────────────────────────────────────────────────────────
// A 4-digit PIN has only 10,000 possibilities, so a leaked hash alone is easy
// to brute force. Two things keep that in check: a server-side secret mixed in
// before hashing (set AUTH_SECRET so it is not stored next to the data), and
// the online lockout below.

let cachedSecret: string | null = null;

async function getSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  if (process.env.AUTH_SECRET) {
    cachedSecret = process.env.AUTH_SECRET;
    return cachedSecret;
  }
  const generated = crypto.randomBytes(32).toString("hex");
  await query("INSERT INTO meta (key, value) VALUES ('auth_secret', $1) ON CONFLICT (key) DO NOTHING", [generated]);
  const row = await queryOne<{ value: string }>("SELECT value FROM meta WHERE key = 'auth_secret'");
  cachedSecret = row!.value;
  return cachedSecret;
}

function scrypt(password: Buffer, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 32, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPin(pin: string, saltHex: string): Promise<string> {
  const peppered = crypto.createHmac("sha256", await getSecret()).update(pin).digest();
  const key = await scrypt(peppered, Buffer.from(saltHex, "hex"));
  return key.toString("hex");
}

export function newSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// (Per-account PIN lockout is enforced atomically in SQL; see /api/auth.)

// ─── In-memory per-IP throttle (best effort; per server instance) ────────────

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > max;
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

// ─── Sessions ────────────────────────────────────────────────────────────────

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  await query("DELETE FROM sessions WHERE expires_at < $1", [now]);
  await query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [
    hashToken(token),
    userId,
    now + SESSION_MAX_AGE_SECONDS * 1000,
  ]);
  return token;
}

export async function destroySession(token: string | undefined) {
  if (!token) return;
  await query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
}

/** The signed-in account id for this request, or null for guests. */
export async function getSessionUserId(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await queryOne<{ user_id: string; expires_at: number }>(
    "SELECT user_id, expires_at FROM sessions WHERE token_hash = $1",
    [hashToken(token)],
  );
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    await destroySession(token);
    return null;
  }
  return row.user_id;
}

export function sessionCookieOptions(req: NextRequest) {
  const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "");
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    // Only mark Secure over https, otherwise browsers drop the cookie on
    // http://localhost or a LAN address and login silently fails.
    secure: proto === "https",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/**
 * Who is making this request?
 * - A valid session always wins; whatever id the client claims is ignored.
 * - Otherwise a guest id is accepted, but never an account id, so an account
 *   cannot be read or written without its session.
 */
export async function resolveUserId(req: NextRequest, claimedId?: unknown): Promise<string | null> {
  const sessionUser = await getSessionUserId(req);
  if (sessionUser) return sessionUser;
  return isGuestId(claimedId) ? claimedId : null;
}

// ─── Guest → account merge ───────────────────────────────────────────────────

function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

/**
 * Copies everything a guest identity accumulated into an account (union, never
 * deleting). Runs at most once per guest id so later deletions stick.
 * Returns true if a merge happened.
 */
export async function mergeGuestIntoAccount(guestId: unknown, userId: string): Promise<boolean> {
  if (!isGuestId(guestId)) return false;

  return withTransaction(async (tx) => {
    // Claiming the guest id first makes concurrent merges (double click, two
    // tabs) race on the primary key instead of duplicating rows.
    const claimed = await tx.query(
      "INSERT INTO merged_guests (guest_id, user_id) VALUES ($1, $2) ON CONFLICT (guest_id) DO NOTHING RETURNING guest_id",
      [guestId, userId],
    );
    if (claimed.length === 0) return false;

    await tx.query(
      `INSERT INTO liked_songs (user_id, song_id, title, artist, album, cover_url, duration, youtube_id, added_at)
       SELECT $1, song_id, title, artist, album, cover_url, duration, youtube_id, added_at
       FROM liked_songs WHERE user_id = $2
       ON CONFLICT (user_id, song_id) DO NOTHING`,
      [userId, guestId],
    );

    await tx.query(
      `INSERT INTO listening_history (user_id, song_id, title, artist, album, cover_url, duration, youtube_id, played_at)
       SELECT $1, song_id, title, artist, album, cover_url, duration, youtube_id, played_at
       FROM (SELECT * FROM listening_history WHERE user_id = $2 ORDER BY id DESC LIMIT 200) recent
       ORDER BY id ASC`,
      [userId, guestId],
    );

    await tx.query(
      `INSERT INTO downloads (user_id, song_id, title, artist, album, cover_url, duration, youtube_id, added_at)
       SELECT $1, song_id, title, artist, album, cover_url, duration, youtube_id, added_at
       FROM downloads WHERE user_id = $2
       ON CONFLICT (user_id, song_id) DO NOTHING`,
      [userId, guestId],
    );

    await tx.query(
      `INSERT INTO saved_playlists (user_id, playlist_id, title, author, thumbnail, track_count, added_at)
       SELECT $1, playlist_id, title, author, thumbnail, track_count, added_at
       FROM saved_playlists WHERE user_id = $2
       ON CONFLICT (user_id, playlist_id) DO NOTHING`,
      [userId, guestId],
    );

    await tx.query(
      `INSERT INTO followed_artists (user_id, browse_id, name, thumbnail, added_at)
       SELECT $1, browse_id, name, thumbnail, added_at
       FROM followed_artists WHERE user_id = $2
       ON CONFLICT (user_id, browse_id) DO NOTHING`,
      [userId, guestId],
    );

    const guestPlaylists = await tx.query<{
      id: string;
      name: string;
      description: string | null;
      cover_url: string | null;
    }>("SELECT id, name, description, cover_url FROM playlists WHERE user_id = $1", [guestId]);

    for (const pl of guestPlaylists) {
      const existing = await tx.queryOne<{ id: string }>(
        "SELECT id FROM playlists WHERE user_id = $1 AND name = $2 LIMIT 1",
        [userId, pl.name],
      );
      let targetId = existing?.id;
      if (!targetId) {
        targetId = randomId("pl");
        await tx.query(
          "INSERT INTO playlists (id, user_id, name, description, cover_url) VALUES ($1, $2, $3, $4, $5)",
          [targetId, userId, pl.name, pl.description, pl.cover_url],
        );
      }
      await tx.query(
        `INSERT INTO playlist_songs (playlist_id, song_id, title, artist, album, cover_url, duration, youtube_id, added_at)
         SELECT $1, song_id, title, artist, album, cover_url, duration, youtube_id, added_at
         FROM playlist_songs WHERE playlist_id = $2
         ON CONFLICT (playlist_id, song_id) DO NOTHING`,
        [targetId, pl.id],
      );
    }

    return true;
  });
}
