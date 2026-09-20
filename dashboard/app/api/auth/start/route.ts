import { NextResponse } from "next/server";

/** POST /api/auth/start — send OTP to phone */
export async function POST(req: Request) {
  const API_BASE = (
    process.env.NEXT_PUBLIC_API_URL ??
    "https://gaq4ipibk8.execute-api.eu-north-1.amazonaws.com/dev"
  ).replace(/\/$/, "");

  const body = await req.text();
  const res = await fetch(`${API_BASE}/auth/phone/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
