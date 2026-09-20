/**
 * Custodial Stellar Testnet + XLM for LimitX.
 * Keypairs are ed25519; secrets sealed with AES-256-GCM (SESSION_SECRET).
 * @stellar/stellar-sdk is ESM — loaded via dynamic import for CJS Lambdas.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const STELLAR = {
  network: "testnet" as const,
  networkPassphrase: "Test SDF Network ; September 2015",
  horizonUrl:
    process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org",
  friendbotUrl:
    process.env.STELLAR_FRIENDBOT_URL ?? "https://friendbot.stellar.org",
  explorerAccount: "https://stellar.expert/explorer/testnet/account/",
  explorerTx: "https://stellar.expert/explorer/testnet/tx/",
  tokenSymbol: "XLM",
  chainName: "Stellar Testnet",
  chainId: 0,
  settlementMode: "stellar-testnet" as const,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sdkPromise: Promise<any> | null = null;

function loadSdk(): Promise<any> {
  if (!sdkPromise) {
    sdkPromise = import("@stellar/stellar-sdk");
  }
  return sdkPromise;
}

function sealKey(): Buffer {
  const secret =
    process.env.STELLAR_SEAL_KEY ??
    process.env.SESSION_SECRET ??
    process.env.OWNER_API_KEY ??
    "limitx-stellar-dev-seal";
  return createHash("sha256").update(secret).digest();
}

/** Encrypt Stellar secret seed (S…) for DynamoDB storage. */
export function sealStellarSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealKey(), iv);
  const enc = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function unsealStellarSecret(sealed: string): string {
  const buf = Buffer.from(sealed, "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", sealKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8"
  );
}

export async function keypairFromSeed(seed: string) {
  const { Keypair } = await loadSdk();
  const raw = createHash("sha256").update(`limitx-stellar:${seed}`).digest();
  return Keypair.fromRawEd25519Seed(raw);
}

export async function createRandomKeypair() {
  const { Keypair } = await loadSdk();
  return Keypair.random();
}

export function explorerAccountUrl(publicKey: string): string {
  return `${STELLAR.explorerAccount}${publicKey}`;
}

export function explorerTxUrl(hash: string): string {
  return `${STELLAR.explorerTx}${hash}`;
}

async function server() {
  const { Horizon } = await loadSdk();
  return new Horizon.Server(STELLAR.horizonUrl);
}

/** Fund a testnet account via Friendbot. */
export async function fundWithFriendbot(publicKey: string): Promise<void> {
  const url = `${STELLAR.friendbotUrl}?addr=${encodeURIComponent(publicKey)}`;
  const res = await fetch(url);
  if (res.ok) return;

  const text = await res.text();
  try {
    await (await server()).loadAccount(publicKey);
    return;
  } catch {
    throw new Error(`Friendbot failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

export async function getXlmBalance(publicKey: string): Promise<number> {
  try {
    const account = await (await server()).loadAccount(publicKey);
    const native = account.balances.find(
      (b: { asset_type: string; balance: string }) => b.asset_type === "native"
    );
    return native ? Number(native.balance) : 0;
  } catch {
    return 0;
  }
}

export interface StellarPaymentResult {
  hash: string;
  explorerUrl: string;
  from: string;
  to: string;
  amount: string;
}

/**
 * Send native XLM from a custodial account.
 * Creates the destination account when it does not exist yet.
 */
export async function submitXlmPayment(input: {
  sealedSecret: string;
  destination: string;
  amount: number;
  memo?: string;
}): Promise<StellarPaymentResult> {
  const {
    Asset,
    Horizon,
    Keypair,
    Memo,
    Networks,
    Operation,
    TransactionBuilder,
  } = await loadSdk();

  const secret = unsealStellarSecret(input.sealedSecret);
  const sourceKeys = Keypair.fromSecret(secret);
  const amountNum = Number(input.amount);
  if (!(amountNum > 0)) {
    throw new Error("Stellar payment amount must be > 0");
  }
  const amount = amountNum.toFixed(7);

  const horizon = new Horizon.Server(STELLAR.horizonUrl);
  const account = await horizon.loadAccount(sourceKeys.publicKey());

  let destinationExists = true;
  try {
    await horizon.loadAccount(input.destination);
  } catch {
    destinationExists = false;
  }

  const builder = new TransactionBuilder(account, {
    fee: "100000",
    networkPassphrase: Networks.TESTNET,
  });

  if (!destinationExists) {
    const starting = Math.max(amountNum, 2).toFixed(7);
    builder.addOperation(
      Operation.createAccount({
        destination: input.destination,
        startingBalance: starting,
      })
    );
  } else {
    builder.addOperation(
      Operation.payment({
        destination: input.destination,
        asset: Asset.native(),
        amount,
      })
    );
  }

  if (input.memo) {
    builder.addMemo(Memo.text(input.memo.slice(0, 28)));
  }

  const tx = builder.setTimeout(60).build();
  tx.sign(sourceKeys);

  const result = await horizon.submitTransaction(tx);
  const hash = result.hash;
  return {
    hash,
    explorerUrl: explorerTxUrl(hash),
    from: sourceKeys.publicKey(),
    to: input.destination,
    amount,
  };
}

export interface ProvisionedStellarAccount {
  publicKey: string;
  sealedSecret: string;
}

/** Create keypair, seal secret, Friendbot-fund on testnet. */
export async function provisionStellarAccount(
  label: string
): Promise<ProvisionedStellarAccount> {
  const kp = await keypairFromSeed(label);
  const sealedSecret = sealStellarSecret(kp.secret());
  await fundWithFriendbot(kp.publicKey());
  return { publicKey: kp.publicKey(), sealedSecret };
}
