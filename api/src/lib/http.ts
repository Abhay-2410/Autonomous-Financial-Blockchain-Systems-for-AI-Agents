/** Shared API Gateway responses (Lambda proxy + browser CORS). */

const CORS_HEADERS = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "Content-Type,X-Api-Key,Authorization,X-Requested-With,X-Owner-Key",
  "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
} as const;

export function json(
  statusCode: number,
  body: Record<string, unknown> | unknown[]
) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS },
    body: JSON.stringify(body),
  };
}
