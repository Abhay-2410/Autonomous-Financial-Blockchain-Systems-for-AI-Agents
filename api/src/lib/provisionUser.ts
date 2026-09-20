/**
 * Create a LimitX user + prepaid treasury + Stellar Testnet XLM accounts.
 */

import { randomUUID } from "node:crypto";
import { getItem, putItem } from "./dynamo";
import {
  buildAgentWallet,
  buildCognitoIndex,
  buildParentWallet,
  buildPhoneIndex,
  buildUser,
  Keys,
  type CognitoIndex,
  type PhoneIndex,
  type User,
} from "./schema";
import { provisionStellarAccount, STELLAR } from "./stellar";

const DEMO_WALLET_ID = process.env.WALLET_ID ?? "org-limitx";

/** Comma-separated E.164 phones that attach to the shared demo treasury. */
function demoOwnerPhones(): Set<string> {
  const raw = process.env.DEMO_OWNER_PHONES ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function shortId(userId: string): string {
  return userId.replace(/-/g, "").slice(0, 8);
}

export async function findUserByPhone(phone: string): Promise<User | null> {
  const index = await getItem<PhoneIndex>(Keys.phoneIndex(phone));
  if (!index || index.entityType !== "PhoneIndex") return null;
  const user = await getItem<User>(Keys.user(index.userId));
  return user?.entityType === "User" ? user : null;
}

export async function findUserByCognitoSub(
  cognitoSub: string
): Promise<User | null> {
  const index = await getItem<CognitoIndex>(Keys.cognitoIndex(cognitoSub));
  if (!index || index.entityType !== "CognitoIndex") return null;
  const user = await getItem<User>(Keys.user(index.userId));
  return user?.entityType === "User" ? user : null;
}

async function provisionWalletForUser(
  userId: string,
  phone: string
): Promise<{ walletId: string; isDemoTreasury: boolean }> {
  if (demoOwnerPhones().has(phone)) {
    return { walletId: DEMO_WALLET_ID, isDemoTreasury: true };
  }

  const walletId = `u_${shortId(userId)}`;
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const suffix = shortId(userId);

  const [parentStellar, shopStellar, opsStellar] = await Promise.all([
    provisionStellarAccount(`parent:${walletId}`),
    provisionStellarAccount(`agent:shop-${suffix}`),
    provisionStellarAccount(`agent:ops-${suffix}`),
  ]);

  const parent = buildParentWallet({
    walletId,
    orgName: "LimitX",
    createdAt: now,
    balance: 10_000,
    address: parentStellar.publicKey,
    stellarSecretEnc: parentStellar.sealedSecret,
    chainId: STELLAR.chainId,
    tokenSymbol: STELLAR.tokenSymbol,
    chainName: STELLAR.chainName,
  });

  const shopping = buildAgentWallet({
    walletId,
    agentId: `shop-${suffix}`,
    name: "Shopping",
    status: "ACTIVE",
    dailyLimit: 2000,
    perTransactionLimit: 500,
    allowedMerchants: ["Amazon", "Flipkart", "DemoStore"],
    spentToday: 0,
    spentTodayDate: today,
    apiKey: `shop-${suffix}-secret`,
    walletExpiresAt: "2099-12-31T23:59:59.000Z",
    permittedTransactionTypes: ["purchase", "payment", "transfer", "refund"],
    allocatedBalance: 5000,
    address: shopStellar.publicKey,
    stellarSecretEnc: shopStellar.sealedSecret,
    chainId: STELLAR.chainId,
    tokenSymbol: STELLAR.tokenSymbol,
    chainName: STELLAR.chainName,
  });

  const ops = buildAgentWallet({
    walletId,
    agentId: `ops-${suffix}`,
    name: "Vendor ops",
    status: "ACTIVE",
    dailyLimit: 5000,
    perTransactionLimit: 2000,
    allowedMerchants: ["VendorA", "VendorB"],
    spentToday: 0,
    spentTodayDate: today,
    apiKey: `ops-${suffix}-secret`,
    walletExpiresAt: "2099-12-31T23:59:59.000Z",
    permittedTransactionTypes: ["purchase", "payment", "transfer", "refund"],
    allocatedBalance: 5000,
    address: opsStellar.publicKey,
    stellarSecretEnc: opsStellar.sealedSecret,
    chainId: STELLAR.chainId,
    tokenSymbol: STELLAR.tokenSymbol,
    chainName: STELLAR.chainName,
  });

  await putItem(parent);
  await putItem(shopping);
  await putItem(ops);

  return { walletId, isDemoTreasury: false };
}

export async function getOrCreateUser(phone: string): Promise<{
  user: User;
  isNew: boolean;
}> {
  const existing = await findUserByPhone(phone);
  if (existing) {
    return { user: existing, isNew: false };
  }

  const userId = randomUUID();
  const now = new Date().toISOString();
  const { walletId } = await provisionWalletForUser(userId, phone);

  const user = buildUser({
    userId,
    phone,
    walletId,
    displayName: phone,
    authProvider: "phone",
    createdAt: now,
    lastLoginAt: now,
  });
  const index = buildPhoneIndex({ phone, userId });

  await putItem(user);
  await putItem(index);

  return { user, isNew: true };
}

/**
 * Cognito Hosted UI / email signup → same wallet provisioning as phone auth.
 * Identity key is Cognito `sub`; `phone` stores `cognito:<sub>` so session JWTs stay valid.
 * Uses lite wallet provisioning (no Friendbot) so Cognito signup stays fast/reliable.
 * UI must display `email` / `displayName`, never the `phone` cognito: key.
 */
export async function getOrCreateUserFromCognito(input: {
  cognitoSub: string;
  email: string;
  emailVerified?: boolean;
}): Promise<{ user: User; isNew: boolean }> {
  const existing = await findUserByCognitoSub(input.cognitoSub);
  if (existing) {
    const refreshed: User = {
      ...existing,
      email: input.email || existing.email,
      emailVerified:
        input.emailVerified !== undefined
          ? input.emailVerified
          : existing.emailVerified,
      displayName: input.email || existing.displayName || existing.email,
      authProvider: existing.authProvider ?? "cognito",
      cognitoSub: input.cognitoSub,
    };
    await putItem(refreshed);
    return { user: await touchLastLogin(refreshed), isNew: false };
  }

  const userId = randomUUID();
  const now = new Date().toISOString();
  const phoneKey = `cognito:${input.cognitoSub}`;
  const { walletId } = await provisionWalletLite(userId, input.email);

  const user = buildUser({
    userId,
    phone: phoneKey,
    email: input.email,
    emailVerified: input.emailVerified ?? false,
    cognitoSub: input.cognitoSub,
    authProvider: "cognito",
    walletId,
    displayName: input.email,
    createdAt: now,
    lastLoginAt: now,
  });
  const index = buildCognitoIndex({
    cognitoSub: input.cognitoSub,
    userId,
  });

  await putItem(user);
  await putItem(index);

  return { user, isNew: true };
}

/** Fast wallet rows without Stellar Friendbot (Cognito public signup). */
async function provisionWalletLite(
  userId: string,
  label: string
): Promise<{ walletId: string }> {
  const walletId = `u_${shortId(userId)}`;
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const suffix = shortId(userId);
  const seedAddr = (s: string) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const hex = (h >>> 0).toString(16).padStart(8, "0");
    return `0x${hex}${"a".repeat(32)}`.slice(0, 42);
  };

  const parent = buildParentWallet({
    walletId,
    orgName: "LimitX",
    createdAt: now,
    balance: 10_000,
    address: seedAddr(`parent:${walletId}:${label}`),
    chainId: 84532,
    tokenSymbol: "USDC",
    chainName: "Base Sepolia",
  });

  const shopping = buildAgentWallet({
    walletId,
    agentId: `shop-${suffix}`,
    name: "Shopping",
    status: "ACTIVE",
    dailyLimit: 2000,
    perTransactionLimit: 500,
    allowedMerchants: ["Amazon", "Flipkart", "DemoStore"],
    spentToday: 0,
    spentTodayDate: today,
    apiKey: `shop-${suffix}-secret`,
    walletExpiresAt: "2099-12-31T23:59:59.000Z",
    permittedTransactionTypes: ["purchase", "payment", "transfer", "refund"],
    allocatedBalance: 5000,
    address: seedAddr(`agent:shop-${suffix}`),
    chainId: 84532,
    tokenSymbol: "USDC",
    chainName: "Base Sepolia",
  });

  const ops = buildAgentWallet({
    walletId,
    agentId: `ops-${suffix}`,
    name: "Vendor ops",
    status: "ACTIVE",
    dailyLimit: 5000,
    perTransactionLimit: 2000,
    allowedMerchants: ["VendorA", "VendorB"],
    spentToday: 0,
    spentTodayDate: today,
    apiKey: `ops-${suffix}-secret`,
    walletExpiresAt: "2099-12-31T23:59:59.000Z",
    permittedTransactionTypes: ["purchase", "payment", "transfer", "refund"],
    allocatedBalance: 5000,
    address: seedAddr(`agent:ops-${suffix}`),
    chainId: 84532,
    tokenSymbol: "USDC",
    chainName: "Base Sepolia",
  });

  await putItem(parent);
  await putItem(shopping);
  await putItem(ops);
  return { walletId };
}

export async function touchLastLogin(user: User): Promise<User> {
  const now = new Date().toISOString();
  const updated: User = { ...user, lastLoginAt: now };
  await putItem(updated);
  return updated;
}
