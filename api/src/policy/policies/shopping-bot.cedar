// Shopping-bot spend policy: ACTIVE status, per-txn / daily budget, allow-listed merchants.
@id("shopping-bot-permit")
permit (
  principal == Agent::"shopping-bot",
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
