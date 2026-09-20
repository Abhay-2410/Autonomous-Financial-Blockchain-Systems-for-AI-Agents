import {
  evaluateTransaction,
  evaluateWithRules,
  ReasonCode,
  type PolicyAgentInput,
  type PolicyTransactionInput,
} from "./evaluate";

const shoppingBot: PolicyAgentInput = {
  agentId: "shopping-bot",
  status: "ACTIVE",
  dailyLimit: 5000,
  perTransactionLimit: 2000,
  allowedMerchants: ["Amazon", "Flipkart"],
};

function txn(
  partial: Partial<PolicyTransactionInput> &
    Pick<PolicyTransactionInput, "amount" | "recipient">
): PolicyTransactionInput {
  return { txnId: "test-txn", ...partial };
}

describe("evaluateTransaction", () => {
  it("allows when within limits", () => {
    const result = evaluateTransaction(
      shoppingBot,
      txn({ amount: 1000, recipient: "Amazon" }),
      5000
    );
    expect(result.decision).toBe("Allow");
    expect(result.reasons).toContain(ReasonCode.withinLimits);
  });

  it("denies when over per-transaction limit", () => {
    const result = evaluateTransaction(
      shoppingBot,
      txn({ amount: 2500, recipient: "Amazon" }),
      5000
    );
    expect(result.decision).toBe("Deny");
    expect(result.reasons).toEqual([ReasonCode.overPerTransactionLimit]);
  });

  it("denies when over daily limit (remaining budget)", () => {
    const result = evaluateTransaction(
      shoppingBot,
      txn({ amount: 1500, recipient: "Amazon" }),
      1000
    );
    expect(result.decision).toBe("Deny");
    expect(result.reasons).toEqual([ReasonCode.overDailyLimit]);
  });

  it("denies when merchant is not allow-listed", () => {
    const result = evaluateTransaction(
      shoppingBot,
      txn({ amount: 500, recipient: "Walmart" }),
      5000
    );
    expect(result.decision).toBe("Deny");
    expect(result.reasons).toEqual([ReasonCode.disallowedMerchant]);
  });

  it("denies when agent is revoked", () => {
    const revoked: PolicyAgentInput = { ...shoppingBot, status: "REVOKED" };
    const result = evaluateTransaction(
      revoked,
      txn({ amount: 500, recipient: "Amazon" }),
      5000
    );
    expect(result.decision).toBe("Deny");
    expect(result.reasons).toEqual([ReasonCode.agentRevoked]);
  });
});

describe("evaluateWithRules (fallback parity)", () => {
  it("uses the same check order as Cedar-backed evaluateTransaction", () => {
    const cases: Array<{
      agent: PolicyAgentInput;
      transaction: PolicyTransactionInput;
      remaining: number;
    }> = [
      {
        agent: shoppingBot,
        transaction: txn({ amount: 1000, recipient: "Amazon" }),
        remaining: 5000,
      },
      {
        agent: shoppingBot,
        transaction: txn({ amount: 2500, recipient: "Amazon" }),
        remaining: 5000,
      },
      {
        agent: shoppingBot,
        transaction: txn({ amount: 1500, recipient: "Amazon" }),
        remaining: 1000,
      },
      {
        agent: shoppingBot,
        transaction: txn({ amount: 500, recipient: "Walmart" }),
        remaining: 5000,
      },
      {
        agent: { ...shoppingBot, status: "REVOKED" },
        transaction: txn({ amount: 500, recipient: "Amazon" }),
        remaining: 5000,
      },
    ];

    for (const c of cases) {
      expect(
        evaluateTransaction(c.agent, c.transaction, c.remaining)
      ).toEqual(evaluateWithRules(c.agent, c.transaction, c.remaining));
    }
  });
});
