/**
 * Wipe Transaction + AuditEvent rows for a clean demo slate.
 * Leaves ParentWallet / AgentWallet (and User / OTP) intact so activity
 * always references agents that still exist after seed.
 *
 * Local:
 *   pnpm --filter @agent-wallet/api demo:reset
 *
 * AWS:
 *   $env:TABLE_NAME = "agent-wallet-dev"
 *   $env:AWS_REGION = "eu-north-1"
 *   pnpm --filter @agent-wallet/api demo:reset:aws
 */

import {
  deleteItem,
  ensureTable,
  getDynamoEndpoint,
  getTableName,
  scanByEntityType,
} from "../src/lib/dynamo";

export async function runDemoReset(): Promise<void> {
  const endpoint = getDynamoEndpoint();
  console.log(
    `Demo reset on "${getTableName()}"` +
      (endpoint ? ` via ${endpoint}` : " (AWS)")
  );

  await ensureTable();

  const transactions = await scanByEntityType("Transaction");
  const audits = await scanByEntityType("AuditEvent");

  let deleted = 0;
  for (const item of [...transactions, ...audits]) {
    await deleteItem({ pk: item.pk, sk: item.sk });
    deleted += 1;
    console.log(`delete ${item.entityType} ${item.pk} / ${item.sk}`);
  }

  console.log(
    `Removed ${deleted} Transaction/AuditEvent row(s). Agent wallets left intact.`
  );
  console.log(
    "Tip: re-seed fixed agents with  pnpm --filter @agent-wallet/api seed"
  );
}

const entry = (process.argv[1] ?? "").replace(/\\/g, "/");
if (
  entry.endsWith("/scripts/demo-reset.ts") ||
  entry.endsWith("/demo-reset.ts")
) {
  runDemoReset().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
