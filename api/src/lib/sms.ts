/**
 * Outbound OTP — Twilio Verify (preferred), Twilio Messages, or SNS.
 * Verify does not need a From number; Twilio owns the sender ID.
 */

import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";

export type SmsResult =
  | { ok: true; provider: "twilio-verify" | "twilio" | "sns" }
  | { ok: false; error: string };

export type VerifyCheckResult =
  | { ok: true; status: string }
  | { ok: false; error: string; status?: string };

function twilioSid(): string | undefined {
  return process.env.TWILIO_ACCOUNT_SID?.trim() || undefined;
}

function twilioToken(): string | undefined {
  return process.env.TWILIO_AUTH_TOKEN?.trim() || undefined;
}

function twilioAuthHeader(): string | null {
  const sid = twilioSid();
  const token = twilioToken();
  if (!sid || !token) return null;
  return `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
}

export function twilioConfigured(): boolean {
  return Boolean(twilioSid() && twilioToken());
}

function messagesConfigured(): boolean {
  return Boolean(
    twilioConfigured() &&
      (process.env.TWILIO_FROM_NUMBER?.trim() ||
        process.env.TWILIO_MESSAGING_SERVICE_SID?.trim())
  );
}

/** Create or reuse a Twilio Verify service (cached in env / process). */
let cachedVerifyServiceSid: string | undefined =
  process.env.TWILIO_VERIFY_SERVICE_SID?.trim() || undefined;

async function ensureVerifyService(): Promise<string> {
  if (cachedVerifyServiceSid) return cachedVerifyServiceSid;
  const auth = twilioAuthHeader();
  const sid = twilioSid();
  if (!auth || !sid) {
    throw new Error("Twilio credentials missing");
  }

  const list = await fetch("https://verify.twilio.com/v2/Services?PageSize=20", {
    headers: { Authorization: auth },
  });
  if (list.ok) {
    const data = (await list.json()) as {
      services?: Array<{ sid: string; friendly_name: string }>;
    };
    const existing = data.services?.find((s) =>
      /limitx/i.test(s.friendly_name)
    );
    if (existing) {
      cachedVerifyServiceSid = existing.sid;
      return existing.sid;
    }
  }

  const body = new URLSearchParams();
  body.set("FriendlyName", "LimitX");
  body.set("CodeLength", "6");
  const create = await fetch("https://verify.twilio.com/v2/Services", {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!create.ok) {
    const text = await create.text();
    throw new Error(`Twilio Verify service create failed: ${text.slice(0, 300)}`);
  }
  const created = (await create.json()) as { sid: string };
  cachedVerifyServiceSid = created.sid;
  return created.sid;
}

/** Start SMS verification via Twilio Verify (no From number required). */
export async function startTwilioVerify(
  phoneE164: string
): Promise<SmsResult> {
  const auth = twilioAuthHeader();
  if (!auth) {
    return { ok: false, error: "Twilio credentials missing" };
  }

  try {
    const serviceSid = await ensureVerifyService();
    const body = new URLSearchParams();
    body.set("To", phoneE164);
    body.set("Channel", "sms");

    const res = await fetch(
      `https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`,
      {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("Twilio Verify start failed", res.status, text);
      return {
        ok: false,
        error: `Twilio Verify ${res.status}: ${text.slice(0, 300)}`,
      };
    }

    return { ok: true, provider: "twilio-verify" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Twilio Verify start error", err);
    return { ok: false, error: msg };
  }
}

/** Check the code the user typed against Twilio Verify. */
export async function checkTwilioVerify(
  phoneE164: string,
  code: string
): Promise<VerifyCheckResult> {
  const auth = twilioAuthHeader();
  if (!auth) {
    return { ok: false, error: "Twilio credentials missing" };
  }

  try {
    const serviceSid = await ensureVerifyService();
    const body = new URLSearchParams();
    body.set("To", phoneE164);
    body.set("Code", code);

    const res = await fetch(
      `https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`,
      {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }
    );

    const text = await res.text();
    let data: { status?: string; message?: string } = {};
    try {
      data = text ? (JSON.parse(text) as typeof data) : {};
    } catch {
      data = {};
    }

    if (!res.ok) {
      console.error("Twilio Verify check failed", res.status, text);
      return {
        ok: false,
        error: data.message ?? `Twilio Verify ${res.status}`,
        status: data.status,
      };
    }

    if (data.status !== "approved") {
      return {
        ok: false,
        error: "Incorrect or expired code.",
        status: data.status,
      };
    }

    return { ok: true, status: data.status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

async function sendViaTwilioMessages(
  phoneE164: string,
  message: string
): Promise<SmsResult> {
  const sid = twilioSid()!;
  const auth = twilioAuthHeader()!;
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();

  const body = new URLSearchParams();
  body.set("To", phoneE164);
  body.set("Body", message);
  if (messagingServiceSid) {
    body.set("MessagingServiceSid", messagingServiceSid);
  } else if (from) {
    body.set("From", from);
  }

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("Twilio SMS failed", res.status, text);
    return {
      ok: false,
      error: `Twilio ${res.status}: ${text.slice(0, 200)}`,
    };
  }

  return { ok: true, provider: "twilio" };
}

async function sendViaSns(
  phoneE164: string,
  message: string
): Promise<SmsResult> {
  const sns = new SNSClient({});
  try {
    await sns.send(
      new PublishCommand({
        PhoneNumber: phoneE164,
        Message: message,
        MessageAttributes: {
          "AWS.SNS.SMS.SMSType": {
            DataType: "String",
            StringValue: "Transactional",
          },
        },
      })
    );
    return { ok: true, provider: "sns" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("SNS SMS failed", err);
    return { ok: false, error: msg };
  }
}

/**
 * Start OTP delivery.
 * Prefer Twilio Verify (real OTP). Fall back to Messages API when From is set.
 * India trial accounts reject free-form Message bodies — Verify is required.
 */
export async function sendOtpSms(
  phoneE164: string,
  code: string,
  ttlSeconds: number
): Promise<SmsResult & { usesTwilioVerify?: boolean }> {
  // 1) Twilio Verify — correct OTP channel (works with your From + verified testers / paid)
  if (twilioConfigured()) {
    const verify = await startTwilioVerify(phoneE164);
    if (verify.ok) {
      return { ...verify, usesTwilioVerify: true };
    }

    // 2) Messages API (user-provided From=+1737…) — free-form body for paid accounts
    if (messagesConfigured()) {
      const mins = Math.max(1, Math.floor(ttlSeconds / 60));
      const message = `LimitX code: ${code}. Valid for ${mins} min. Do not share.`;
      const msg = await sendViaTwilioMessages(phoneE164, message);
      if (msg.ok) return msg;
      return {
        ok: false,
        error: `${verify.error} | Messages: ${msg.ok === false ? msg.error : ""}`,
      };
    }

    return verify;
  }

  const mins = Math.max(1, Math.floor(ttlSeconds / 60));
  const message = `LimitX code: ${code}. Valid for ${mins} min. Do not share.`;

  const smsFlag = (process.env.SMS_ENABLED ?? "0").toLowerCase();
  if (smsFlag === "1" || smsFlag === "true" || smsFlag === "yes") {
    return sendViaSns(phoneE164, message);
  }

  return {
    ok: false,
    error:
      "No SMS provider configured (set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER).",
  };
}

export function hasSmsProvider(): boolean {
  if (twilioConfigured()) return true;
  const smsFlag = (process.env.SMS_ENABLED ?? "0").toLowerCase();
  return smsFlag === "1" || smsFlag === "true" || smsFlag === "yes";
}

/**
 * Optional allow-list (comma-separated E.164). Empty = any valid phone (open signup).
 */
export function isPhoneAllowed(phoneE164: string): boolean {
  const raw = process.env.AUTH_ALLOWED_PHONES?.trim() ?? "";
  if (!raw) return true;
  const allowed = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return allowed.has(phoneE164);
}
