import { NextResponse } from "next/server";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ??
  "https://gaq4ipibk8.execute-api.eu-north-1.amazonaws.com/dev"
).replace(/\/$/, "");

/** Proxy → POST /transactions/{id}/prava/complete */
export async function POST(req: Request) {
  const body = (await req.json()) as { transactionId?: string };
  if (!body.transactionId) {
    return NextResponse.json(
      { message: "transactionId required" },
      { status: 400 }
    );
  }
  const res = await fetch(
    `${API_BASE}/transactions/${encodeURIComponent(body.transactionId)}/prava/complete`,
    { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }
  );
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
