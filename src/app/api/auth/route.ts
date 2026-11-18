import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, withTransaction } from "@/lib/db";
import {
  SESSION_COOKIE,
  clientIp,
  createSession,
  destroySession,
  hashPin,
  isGuestId,
  isValidPin,
  mergeGuestIntoAccount,
  newSalt,
  normalizeEmail,
  rateLimited,
  safeEqualHex,
  sessionCookieOptions,
} from "@/lib/auth";

interface AccountRow {
  user_id: string;
  email: string;
  pin_hash: string;
  pin_salt: string;
  locked_until: number;
}

interface ProfileRow {
  username: string;
  avatar: string;
}

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function loadProfile(userId: string) {
  return queryOne<ProfileRow>("SELECT username, avatar FROM users WHERE id = $1", [userId]);
}

async function sessionResponse(req: NextRequest, userId: string, email: string) {
  const profile = await loadProfile(userId);
  const token = await createSession(userId);
  const res = NextResponse.json({
    user: { id: userId, username: profile?.username ?? email.split("@")[0], avatar: profile?.avatar ?? "", email },
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(req));
  return res;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid request", 400);
  }

  try {
    switch (body.action) {
      case "signup":
        return await signUp(req, body);
      case "signin":
        return await signIn(req, body);
      case "signout":
        return await signOut(req);
      default:
        return fail("Invalid action", 400);
    }
  } catch (err) {
    console.error("API /auth error:", err);
    return fail("Something went wrong. Please try again.", 500);
  }
}

async function signUp(req: NextRequest, body: Record<string, unknown>) {
  if (rateLimited(`signup:${clientIp(req)}`, 10, 60 * 60_000)) {
    return fail("Too many sign-up attempts. Please try again later.", 429);
  }

  const email = normalizeEmail(body.email);
  if (!email) return fail("Enter a valid email address.", 400);
  if (!isValidPin(body.pin)) return fail("PIN must be exactly 4 digits.", 400);

  if (await queryOne("SELECT 1 FROM accounts WHERE email = $1", [email])) {
    return fail("An account with this email already exists. Sign in instead.", 409);
  }

  const salt = newSalt();
  const pinHash = await hashPin(body.pin, salt);
  const userId = `acct_${crypto.randomUUID()}`;

  // A guest keeps their name and avatar when they upgrade to an account.
  const guestProfile = isGuestId(body.guestId) ? await loadProfile(body.guestId) : undefined;
  const username = guestProfile?.username || email.split("@")[0].slice(0, 24);
  const avatar = guestProfile?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${userId}`;

  try {
    await withTransaction(async (tx) => {
      await tx.query("INSERT INTO users (id, username, avatar) VALUES ($1, $2, $3)", [userId, username, avatar]);
      await tx.query("INSERT INTO accounts (user_id, email, pin_hash, pin_salt) VALUES ($1, $2, $3, $4)", [
        userId,
        email,
        pinHash,
        salt,
      ]);
    });
  } catch (err) {
    // Lost a race with another sign-up for the same email (unique violation).
    if ((err as { code?: string }).code === "23505") {
      return fail("An account with this email already exists. Sign in instead.", 409);
    }
    throw err;
  }

  await mergeGuestIntoAccount(body.guestId, userId);
  return sessionResponse(req, userId, email);
}

async function signIn(req: NextRequest, body: Record<string, unknown>) {
  if (rateLimited(`signin:${clientIp(req)}`, 30, 10 * 60_000)) {
    return fail("Too many attempts. Please wait a few minutes.", 429);
  }

  const email = normalizeEmail(body.email);
  if (!email || !isValidPin(body.pin)) return fail("Incorrect email or PIN.", 401);

  const account = await queryOne<AccountRow>(
    "SELECT user_id, email, pin_hash, pin_salt, locked_until FROM accounts WHERE email = $1",
    [email],
  );

  if (!account) {
    // Spend the same time as a real check so response timing does not reveal
    // which emails are registered.
    await hashPin(body.pin, "00".repeat(16));
    return fail("Incorrect email or PIN.", 401);
  }

  // Reserve this attempt *before* checking the PIN, atomically in SQL. Counting
  // after the (slow) hash check would let a burst of parallel guesses all pass
  // the lock test first. Every 5th consecutive failure locks the account for
  // 15 min, doubling each time up to 24 h, so working through all 10,000 PINs
  // takes weeks. A locked account matches no row here.
  const now = Date.now();
  const reserved = await queryOne<{ failed_attempts: number; locked_until: number }>(
    `UPDATE accounts
        SET failed_attempts = failed_attempts + 1,
            locked_until = CASE WHEN (failed_attempts + 1) % 5 = 0
              THEN $2::bigint + LEAST(900000 * POWER(2, (failed_attempts + 1) / 5 - 1), 86400000)::bigint
              ELSE 0 END
      WHERE user_id = $1 AND locked_until <= $2
  RETURNING failed_attempts, locked_until`,
    [account.user_id, now],
  );

  if (!reserved) {
    const current = await queryOne<{ locked_until: number }>("SELECT locked_until FROM accounts WHERE user_id = $1", [
      account.user_id,
    ]);
    return lockedResponse(Math.max(0, (current?.locked_until ?? now) - now));
  }

  const candidate = await hashPin(body.pin, account.pin_salt);
  if (!safeEqualHex(candidate, account.pin_hash)) {
    return reserved.locked_until > now ? lockedResponse(reserved.locked_until - now) : fail("Incorrect email or PIN.", 401);
  }

  await query("UPDATE accounts SET failed_attempts = 0, locked_until = 0 WHERE user_id = $1", [account.user_id]);

  await mergeGuestIntoAccount(body.guestId, account.user_id);
  return sessionResponse(req, account.user_id, account.email);
}

function lockedResponse(ms: number) {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const label = minutes >= 120 ? `${Math.ceil(minutes / 60)} hours` : `${minutes} minute${minutes === 1 ? "" : "s"}`;
  return NextResponse.json(
    { error: `Too many wrong PIN attempts. Try again in ${label}.`, retryAfterSeconds: seconds },
    { status: 429, headers: { "Retry-After": String(seconds) } },
  );
}

async function signOut(req: NextRequest) {
  await destroySession(req.cookies.get(SESSION_COOKIE)?.value);
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(req), maxAge: 0 });
  return res;
}
