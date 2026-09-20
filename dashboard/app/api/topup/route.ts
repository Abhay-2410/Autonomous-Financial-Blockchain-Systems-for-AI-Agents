import { NextResponse } from "next/server";

/** Proxy top-up with the signed-in session. */
export async function POST(req: Request) {
  const { proxyToApi } = await import("../../../lib/proxy");
  const parsed = (await req.json()) as { agentId?: string; amount?: number };
  if (!parsed.agentId || typeof parsed.amount !== "number") {
    return NextResponse.json(
      { message: "agentId and amount required" },
      { status: 400 }
    );
  }

  return proxyToApi(`/wallets/${encodeURIComponent(parsed.agentId)}/topup`, {
    method: "POST",
    body: JSON.stringify({ amount: parsed.amount }),
  });
}
