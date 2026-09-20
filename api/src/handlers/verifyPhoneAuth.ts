/**
 * POST /auth/phone/verify
 * Body: { phone, code, countryCode? }
 * → { token, user, isNew }
 */

import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { getItem, putItem, updateItem } from "../lib/dynamo";
import { json } from "../lib/http";
import { hashOtp, normalizePhone } from "../lib/phone";
import { getOrCreateUser, touchLastLogin } from "../lib/provisionUser";
import { Keys, type PhoneOtp } from "../lib/schema";
import { signSession } from "../lib/session";
import { checkTwilioVerify, twilioConfigured } from "../lib/sms";

const MAX_ATTEMPTS = 5;

function parseBody(raw: string | undefined): {
  phone?: string;
  code?: string;
  countryCode?: string;
} {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as {
      phone?: string;
      code?: string;
      countryCode?: string;
    };
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
  const code = (body.code ?? "").replace(/\D/g, "");
  if (!phone || code.length < 4) {
    return json(400, { message: "Phone and verification code are required." });
  }

  const otp = await getItem<PhoneOtp>(Keys.phoneOtp(phone));
  if (!otp || otp.entityType !== "PhoneOtp") {
    return json(400, { message: "Code expired. Request a new one." });
  }
  if (otp.expiresAt < Math.floor(Date.now() / 1000)) {
    return json(400, { message: "Code expired. Request a new one." });
  }
  if (otp.attempts >= MAX_ATTEMPTS) {
    return json(429, { message: "Too many attempts. Request a new code." });
  }

  const usesTwilioVerify = otp.codeHash.startsWith("twilio-verify:");
  let approved = false;

  if (usesTwilioVerify && twilioConfigured()) {
    const check = await checkTwilioVerify(phone, code);
    if (!check.ok) {
      await updateItem({
        keys: Keys.phoneOtp(phone),
        set: ["attempts = :a"],
        expressionAttributeValues: { ":a": otp.attempts + 1 },
      });
      return json(401, { message: check.error || "Incorrect code." });
    }
    approved = true;
  } else {
    const expected = hashOtp(phone, code);
    if (expected !== otp.codeHash) {
      await updateItem({
        keys: Keys.phoneOtp(phone),
        set: ["attempts = :a"],
        expressionAttributeValues: { ":a": otp.attempts + 1 },
      });
      return json(401, { message: "Incorrect code." });
    }
    approved = true;
  }

  if (!approved) {
    return json(401, { message: "Incorrect code." });
  }

  await putItem({
    ...otp,
    codeHash: "used",
    attempts: MAX_ATTEMPTS,
    expiresAt: Math.floor(Date.now() / 1000) + 60,
  });

  const { user, isNew } = await getOrCreateUser(phone);
  const refreshed = isNew ? user : await touchLastLogin(user);
  const token = signSession({
    userId: refreshed.userId,
    phone: refreshed.phone,
    walletId: refreshed.walletId,
  });

  return json(200, {
    token,
    isNew,
    user: {
      userId: refreshed.userId,
      phone: refreshed.phone,
      walletId: refreshed.walletId,
      displayName: refreshed.displayName ?? refreshed.phone,
    },
  });
};
