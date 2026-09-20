/**
 * Seed example agent-wallet data into DynamoDB.
 *
 * Local (default — no AWS account needed):
 *   pnpm --filter @agent-wallet/api seed
 *
 * Against a real AWS table (needs AWS CLI credentials):
 *   $env:TABLE_NAME = "agent-wallet-dev"
 *   pnpm --filter @agent-wallet/api seed:aws
 */

import { DEMO_CHAIN, demoAddressFromSeed } from "../src/lib/chain";
import { buildAgentWallet, buildParentWallet } from "../src/lib/schema";
import {
  ensureTable,
  getDynamoEndpoint,
  getTableName,
  putItem,
} from "../src/lib/dynamo";

const WALLET_ID = "org-limitx";
const TODAY = new Date().toISOString().slice(0, 10);
const NOW = new Date().toISOString();

function formatSeedError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes("region is missing")) {
    return [
      "AWS region is missing.",
      "For local development without AWS:",
      "  pnpm --filter @agent-wallet/api seed:local",
      "Or set a region for AWS:",
      '  $env:AWS_REGION = "eu-north-1"',
    ].join("\n");
  }

  if (
    lower.includes("could not load credentials") ||
    lower.includes("credentialsprovidererror") ||
    (lower.includes("credentials") && lower.includes("provider"))
  ) {
    return [
      "AWS credentials are not configured on this machine.",
      "For local development without an AWS account:",
      "  pnpm --filter @agent-wallet/api seed:local",
    ].join("\n");
  }

  if (
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("networkingerror")
  ) {
    return [
      `Cannot reach DynamoDB${getDynamoEndpoint() ? ` at ${getDynamoEndpoint()}` : ""}.`,
      "Use the self-contained local seeder:",
      "  pnpm --filter @agent-wallet/api seed:local",
    ].join("\n");
  }

  return message;
}

export async function runSeed(): Promise<void> {
  const endpoint = getDynamoEndpoint();
  console.log(
    `Seeding table "${getTableName()}"` +
      (endpoint ? ` via ${endpoint}` : " (AWS)")
  );

  await ensureTable();

  const parent = buildParentWallet({
    walletId: WALLET_ID,
    orgName: "LimitX",
    createdAt: NOW,
    balance: 250000,
    address: demoAddressFromSeed(`parent:${WALLET_ID}`),
    chainId: DEMO_CHAIN.chainId,
    tokenSymbol: DEMO_CHAIN.tokenSymbol,
    chainName: DEMO_CHAIN.name,
  });

  const shoppingBot = buildAgentWallet({
    walletId: WALLET_ID,
    agentId: "shopping-bot",
    name: "Shopping",
    status: "ACTIVE",
    dailyLimit: 5000,
    perTransactionLimit: 2000,
    allowedMerchants: ["Amazon", "Flipkart", "DemoStore"],
    spentToday: 0,
    spentTodayDate: TODAY,
    apiKey: "shopping-bot-secret",
    walletExpiresAt: "2099-12-31T23:59:59.000Z",
    permittedTransactionTypes: ["purchase", "payment", "transfer", "refund"],
    allocatedBalance: 100000,
    address: demoAddressFromSeed("agent:shopping-bot"),
    chainId: DEMO_CHAIN.chainId,
    tokenSymbol: DEMO_CHAIN.tokenSymbol,
    chainName: DEMO_CHAIN.name,
  });

  const vendorAgent = buildAgentWallet({
    walletId: WALLET_ID,
    agentId: "vendor-agent",
    name: "Vendor ops",
    status: "ACTIVE",
    dailyLimit: 20000,
    perTransactionLimit: 10000,
    allowedMerchants: ["VendorA", "VendorB"],
    spentToday: 0,
    spentTodayDate: TODAY,
    apiKey: "vendor-agent-secret",
    walletExpiresAt: "2099-12-31T23:59:59.000Z",
    permittedTransactionTypes: ["purchase", "payment", "transfer", "refund"],
    allocatedBalance: 100000,
    address: demoAddressFromSeed("agent:vendor-agent"),
    chainId: DEMO_CHAIN.chainId,
    tokenSymbol: DEMO_CHAIN.tokenSymbol,
    chainName: DEMO_CHAIN.name,
  });

  const items = [parent, shoppingBot, vendorAgent];

  for (const item of items) {
    await putItem(item);
    console.log(`put ${item.entityType} ${item.pk} / ${item.sk}`);
  }

  console.log(`Seeded ${items.length} items into table.`);
}

const entry = (process.argv[1] ?? "").replace(/\\/g, "/");
if (entry.endsWith("/scripts/seed.ts") || entry.endsWith("/seed.ts")) {
  runSeed().catch((err) => {
    console.error(formatSeedError(err));
    process.exit(1);
  });
}
