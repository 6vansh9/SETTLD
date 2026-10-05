import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * "Use my Google photo": fetch the signed-in user's Google picture server-side (no CORS, no
 * hot-linking) and hand the bytes to the browser, which crops, compresses and uploads it to our
 * own bucket like any other photo. Only Google's image host is ever fetched.
 */
export async function GET() {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const meta = user.user_metadata ?? {};
  const raw = typeof meta.avatar_url === "string" ? meta.avatar_url : typeof meta.picture === "string" ? meta.picture : null;
  if (!raw) return NextResponse.json({ error: "No Google photo on this account" }, { status: 404 });

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return NextResponse.json({ error: "No Google photo on this account" }, { status: 404 });
  }
  if (url.protocol !== "https:" || !/(^|\.)googleusercontent\.com$/.test(url.hostname)) {
    return NextResponse.json({ error: "Not a Google photo" }, { status: 400 });
  }
  // Ask for a bigger square than the default 96 px thumbnail.
  url.pathname = url.pathname.replace(/=s\d+(-c)?$/, "=s512-c");

  const res = await fetch(url, { cache: "no-store", redirect: "follow" });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.startsWith("image/")) return NextResponse.json({ error: "Couldn't get your Google photo" }, { status: 502 });
  const body = await res.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return NextResponse.json({ error: "Google photo too large" }, { status: 502 });
  return new NextResponse(body, { headers: { "content-type": type, "cache-control": "private, no-store" } });
}
