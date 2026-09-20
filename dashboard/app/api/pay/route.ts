import { NextResponse } from "next/server";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ??
  "https://gaq4ipibk8.execute-api.eu-north-1.amazonaws.com/dev"
).replace(/\/$/, "");

const OWNER_KEY =
  process.env.OWNER_API_KEY ?? "limitx-owner-demo-key";

/** Proxy Pay → API Gateway with server-side owner key (not exposed to the browser). */
export async function POST(req: Request) {
  const body = await req.text();
  const res = await fetch(`${API_BASE}/transactions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-owner-key": OWNER_KEY,
    },
    body,
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
