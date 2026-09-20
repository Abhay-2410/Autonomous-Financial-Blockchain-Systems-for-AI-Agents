import { NextResponse } from "next/server";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ??
  "https://gaq4ipibk8.execute-api.eu-north-1.amazonaws.com/dev"
).replace(/\/$/, "");

/** Proxy top-up so the client only talks to Next. */
export async function POST(req: Request) {
  const parsed = (await req.json()) as { agentId?: string; amount?: number };
  if (!parsed.agentId || typeof parsed.amount !== "number") {
    return NextResponse.json(
      { message: "agentId and amount required" },
      { status: 400 }
    );
  }

  const res = await fetch(
    `${API_BASE}/wallets/${encodeURIComponent(parsed.agentId)}/topup`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: parsed.amount }),
    }
  );
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
