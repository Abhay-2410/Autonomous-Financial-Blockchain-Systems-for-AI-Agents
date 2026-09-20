import { NextResponse } from "next/server";
import { getSessionToken } from "../../../lib/auth";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ??
  "https://gaq4ipibk8.execute-api.eu-north-1.amazonaws.com/dev"
).replace(/\/$/, "");

const OWNER_KEY =
  process.env.OWNER_API_KEY ?? "limitx-owner-demo-key";

/** Proxy Pay → API Gateway with session JWT (or legacy owner key). */
export async function POST(req: Request) {
  const body = await req.text();
  const token = await getSessionToken();
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else {
    headers["x-owner-key"] = OWNER_KEY;
  }

  const res = await fetch(`${API_BASE}/transactions`, {
    method: "POST",
    headers,
    body,
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
