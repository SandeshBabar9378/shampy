import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { UserProfile } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  let id = searchParams.get("id");

  if (!id) {
    id = "user_" + Math.random().toString(36).substring(2, 9);
  }

  const db = getDb();
  let user = db.prepare("SELECT id, username, avatar FROM users WHERE id = ?").get(id) as UserProfile | undefined;

  if (!user) {
    const hex = id.slice(-4).toUpperCase();
    const defaultUsername = `Listener #${hex}`;
    const defaultAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${id}`;

    db.prepare("INSERT INTO users (id, username, avatar) VALUES (?, ?, ?)").run(
      id,
      defaultUsername,
      defaultAvatar
    );

    user = {
      id,
      username: defaultUsername,
      avatar: defaultAvatar,
    };
  }

  return NextResponse.json({ user });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, username, avatar } = body;

    if (!id || !username) {
      return NextResponse.json({ error: "id and username are required" }, { status: 400 });
    }

    const db = getDb();
    db.prepare(
      "INSERT OR REPLACE INTO users (id, username, avatar) VALUES (?, ?, ?)"
    ).run(id, username, avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${id}`);

    return NextResponse.json({ success: true, user: { id, username, avatar } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
