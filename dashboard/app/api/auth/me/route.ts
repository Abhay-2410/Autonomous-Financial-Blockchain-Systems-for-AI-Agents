import { NextResponse } from "next/server";
import { getSessionToken } from "../../../../lib/auth";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ??
  "https://gaq4ipibk8.execute-api.eu-north-1.amazonaws.com/dev"
).replace(/\/$/, "");

/** GET /api/auth/me — proxy with session cookie → Bearer */
export async function GET() {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json(
      { message: "Sign in with your phone number." },
      { status: 401 }
    );
  }

  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
