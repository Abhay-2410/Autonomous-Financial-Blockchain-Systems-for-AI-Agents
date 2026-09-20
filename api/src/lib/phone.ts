/**
 * Phone normalization + OTP helpers for LimitX Pay signup/signin.
 */

import { createHash, randomInt } from "node:crypto";

const E164_RE = /^\+[1-9]\d{7,14}$/;

/** Typical national (subscriber) length by country calling code. */
const NATIONAL_LENGTH: Record<string, number> = {
  "1": 10, // NANP
  "44": 10,
  "91": 10, // India mobiles
  "61": 9,
  "81": 10,
  "49": 11,
  "33": 9,
  "86": 11,
};

/**
 * Digits-only national number → E.164 with default country calling code.
 *
 * Important: Indian mobiles can start with "91" (e.g. 9108561980). That is NOT
 * the country code — only treat a leading CC as present when the digit length
 * matches CC + national length (12 for India).
 */
export function normalizePhone(
  raw: string,
  defaultCountryCode = process.env.DEFAULT_PHONE_COUNTRY ?? "91"
): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("+")) {
    const digits = `+${trimmed.slice(1).replace(/\D/g, "")}`;
    return E164_RE.test(digits) ? digits : null;
  }

  let national = trimmed.replace(/\D/g, "");
  // Strip a leading 0 (common for local dialing).
  if (national.startsWith("0")) {
    national = national.slice(1);
  }

  const cc = defaultCountryCode.replace(/\D/g, "");
  if (!cc || !national) return null;

  const expectedNational = NATIONAL_LENGTH[cc] ?? 10;

  // Full international without +: e.g. 919108561980 (12 digits for India)
  if (
    national.startsWith(cc) &&
    national.length >= cc.length + expectedNational
  ) {
    const e164 = `+${national}`;
    return E164_RE.test(e164) ? e164 : null;
  }

  // National only: e.g. 9108561980 with country 91 → +919108561980
  const e164 = `+${cc}${national}`;
  return E164_RE.test(e164) ? e164 : null;
}

export function maskPhone(phone: string): string {
  if (phone.length < 6) return phone;
  return `${phone.slice(0, 3)}•••${phone.slice(-4)}`;
}

export function generateOtpCode(length = 6): string {
  const max = 10 ** length;
  return String(randomInt(0, max)).padStart(length, "0");
}

export function hashOtp(phone: string, code: string): string {
  const pepper = process.env.SESSION_SECRET ?? process.env.OWNER_API_KEY ?? "limitx";
  return createHash("sha256")
    .update(`${phone}:${code}:${pepper}`)
    .digest("hex");
}

export function otpTtlSeconds(): number {
  const n = Number(process.env.OTP_TTL_SECONDS ?? "300");
  return Number.isFinite(n) && n > 30 ? n : 300;
}

/** When true (default), /auth/phone/start may return the code for hackathon demos. */
export function isAuthDevMode(): boolean {
  const v = (process.env.AUTH_DEV_MODE ?? "1").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function smsEnabled(): boolean {
  const v = (process.env.SMS_ENABLED ?? "0").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
