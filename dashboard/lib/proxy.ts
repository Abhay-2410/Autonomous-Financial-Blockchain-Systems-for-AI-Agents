import { NextResponse } from "next/server";
import { getSessionToken } from "./auth";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ??
  "https://gaq4ipibk8.execute-api.eu-north-1.amazonaws.com/dev"
).replace(/\/$/, "");

const OWNER_KEY =
  process.env.OWNER_API_KEY ?? "limitx-owner-demo-key";

/**
 * Authenticated proxy → API Gateway.
 * Prefer phone session JWT; fall back to OWNER_API_KEY for local demos.
 */
export async function proxyToApi(
  path: string,
  init?: RequestInit
): Promise<NextResponse> {
  const token = await getSessionToken();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else {
    headers["x-owner-key"] = OWNER_KEY;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
