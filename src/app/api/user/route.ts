import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getSessionUserId, isGuestId, rethrowPrerenderSignal } from "@/lib/auth";
import { UserProfile } from "@/lib/types";

// Returns the signed-in account if there is a session, otherwise the guest
// profile for the device id (created on first use, as before).
export async function GET(req: NextRequest) {
  // Touch request data before the try block (see rethrowPrerenderSignal).
  const requestedId = new URL(req.url).searchParams.get("id");
  try {
    const sessionUser = await getSessionUserId(req);
    if (sessionUser) {
      const row = await queryOne<UserProfile & { email: string }>(
        `SELECT u.id, u.username, u.avatar, a.email
           FROM users u JOIN accounts a ON a.user_id = u.id
          WHERE u.id = $1`,
        [sessionUser],
      );
      if (row) return NextResponse.json({ user: row });
    }

    const id = requestedId || "user_" + Math.random().toString(36).substring(2, 9);
    if (!isGuestId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    let user = await queryOne<UserProfile>("SELECT id, username, avatar FROM users WHERE id = $1", [id]);
    if (!user) {
      const username = `Listener #${id.slice(-4).toUpperCase()}`;
      const avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${id}`;
      await query("INSERT INTO users (id, username, avatar) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING", [
        id,
        username,
        avatar,
      ]);
      user = { id, username, avatar };
    }

    return NextResponse.json({ user });
  } catch (err) {
    rethrowPrerenderSignal(err);
    console.error("API /user GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, avatar } = body;

    // A session decides whose profile this is; a guest may only edit their own
    // guest id, never an account's.
    const sessionUser = await getSessionUserId(req);
    const id = sessionUser ?? body.id;

    if (!id || !username || typeof username !== "string") {
      return NextResponse.json({ error: "id and username are required" }, { status: 400 });
    }
    if (!sessionUser && !isGuestId(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const finalAvatar = typeof avatar === "string" && avatar ? avatar : `https://api.dicebear.com/7.x/bottts/svg?seed=${id}`;
    await query(
      `INSERT INTO users (id, username, avatar) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, avatar = EXCLUDED.avatar`,
      [id, username.slice(0, 40), finalAvatar],
    );

    return NextResponse.json({ success: true, user: { id, username: username.slice(0, 40), avatar: finalAvatar } });
  } catch (err) {
    console.error("API /user POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
