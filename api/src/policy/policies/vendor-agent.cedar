// Vendor-agent spend policy: ACTIVE status, per-txn / daily budget, allow-listed merchants.
@id("vendor-agent-permit")
permit (
  principal == Agent::"vendor-agent",
  action == Action::"authorizeTransaction",
  resource
)
when {
  principal.status == "ACTIVE" &&
  resource.amount <= principal.perTransactionLimit &&
  resource.amount <= context.remainingDailyBudget &&
  context.remainingDailyBudget <= principal.dailyLimit &&
  principal.allowedMerchants.contains(resource.merchant)
};
