import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "../../../../lib/auth";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ??
  "https://gaq4ipibk8.execute-api.eu-north-1.amazonaws.com/dev"
).replace(/\/$/, "");

/** POST /api/auth/verify — check OTP, set httpOnly session cookie */
export async function POST(req: Request) {
  const body = await req.text();
  const res = await fetch(`${API_BASE}/auth/phone/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  const text = await res.text();
  let data: { token?: string; message?: string } = {};
  try {
    data = text ? (JSON.parse(text) as { token?: string; message?: string }) : {};
  } catch {
    data = {};
  }

  if (!res.ok || !data.token) {
    return new NextResponse(text, {
      status: res.status || 401,
      headers: { "content-type": "application/json" },
    });
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, data.token, sessionCookieOptions());

  return NextResponse.json(JSON.parse(text));
}
