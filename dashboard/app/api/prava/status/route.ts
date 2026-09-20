import { NextResponse } from "next/server";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ??
  "https://gaq4ipibk8.execute-api.eu-north-1.amazonaws.com/dev"
).replace(/\/$/, "");

/** Proxy → GET /transactions/{id}/prava */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const transactionId = searchParams.get("transactionId");
  if (!transactionId) {
    return NextResponse.json(
      { message: "transactionId required" },
      { status: 400 }
    );
  }
  const res = await fetch(
    `${API_BASE}/transactions/${encodeURIComponent(transactionId)}/prava`,
    { cache: "no-store" }
  );
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
