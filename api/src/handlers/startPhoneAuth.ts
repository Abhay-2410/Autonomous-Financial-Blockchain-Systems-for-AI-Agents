/**
 * POST /auth/phone/start
 * Body: { phone: string, countryCode?: string }
 *
 * Sends OTP via Twilio Verify (open signup — any valid phone).
 */

import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { putItem } from "../lib/dynamo";
import { json } from "../lib/http";
import { findUserByPhone } from "../lib/provisionUser";
import {
  generateOtpCode,
  hashOtp,
  isAuthDevMode,
  maskPhone,
  normalizePhone,
  otpTtlSeconds,
} from "../lib/phone";
import { buildPhoneOtp } from "../lib/schema";
import {
  hasSmsProvider,
  isPhoneAllowed,
  sendOtpSms,
} from "../lib/sms";

function parseBody(raw: string | undefined): {
  phone?: string;
  countryCode?: string;
} {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as { phone?: string; countryCode?: string };
  } catch {
    return {};
  }
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const body = parseBody(event.body);
  const phone = normalizePhone(
    body.phone ?? "",
    body.countryCode ?? process.env.DEFAULT_PHONE_COUNTRY ?? "91"
  );
  if (!phone) {
    return json(400, {
      message: "Enter a valid phone number with country code (E.164).",
    });
  }

  if (!isPhoneAllowed(phone)) {
    return json(403, {
      message: "This phone number is not registered for LimitX access.",
    });
  }

  const code = generateOtpCode(6);
  const ttl = otpTtlSeconds();
  const expiresAt = Math.floor(Date.now() / 1000) + ttl;

  // Marker row — Twilio Verify owns the real code when provider=twilio-verify.
  const otp = buildPhoneOtp({
    phone,
    codeHash: hashOtp(phone, code),
    attempts: 0,
    createdAt: new Date().toISOString(),
    expiresAt,
  });
  await putItem(otp);

  let smsSent = false;
  let smsProvider: string | undefined;
  let smsError: string | undefined;
  let usesTwilioVerify = false;

  if (hasSmsProvider()) {
    const result = await sendOtpSms(phone, code, ttl);
    if (result.ok) {
      smsSent = true;
      smsProvider = result.provider;
      usesTwilioVerify = Boolean(result.usesTwilioVerify);
      if (usesTwilioVerify) {
        // Local hash is unused; mark so verify handler prefers Twilio.
        await putItem({
          ...otp,
          codeHash: `twilio-verify:${result.provider}`,
        });
      }
    } else {
      smsError = result.error;
    }
  }

  if (!smsSent && !isAuthDevMode()) {
    return json(502, {
      message:
        "Could not send SMS. Check the number is correct. On a Twilio trial, add the phone as a verified tester (or upgrade) to text any user.",
      detail: smsError,
    });
  }

  const existing = await findUserByPhone(phone);
  const payload: Record<string, unknown> = {
    ok: true,
    phoneMasked: maskPhone(phone),
    expiresIn: ttl,
    isNew: !existing,
    smsSent,
  };
  if (smsProvider) payload.smsProvider = smsProvider;

  if (!smsSent && isAuthDevMode()) {
    payload.devCode = code;
    payload.message =
      "Demo mode — SMS not delivered. Check Twilio credentials / trial verified numbers.";
  }

  return json(200, payload);
};
