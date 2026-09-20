import {
  authorizeTransaction,
  AuthReason,
} from "./authorizeTransaction";
import { buildAgentWallet, type AgentWallet } from "../lib/schema";

const TODAY = new Date().toISOString().slice(0, 10);
const NOW = new Date().toISOString();
const WALLET_ID = "org-limitx";

/** Seed-shaped shopping-bot fixture. */
function shoppingBot(overrides: Partial<AgentWallet> = {}): AgentWallet {
  return buildAgentWallet({
    walletId: WALLET_ID,
    agentId: "shopping-bot",
    name: "shopping-bot",
    status: "ACTIVE",
    dailyLimit: 5000,
    perTransactionLimit: 2000,
    allowedMerchants: ["Amazon", "Flipkart"],
    spentToday: 0,
    spentTodayDate: TODAY,
    apiKey: "shopping-bot-secret",
    walletExpiresAt: "2099-12-31T23:59:59.000Z",
    permittedTransactionTypes: ["purchase", "payment", "transfer", "refund"],
    allocatedBalance: 100000,
    ...overrides,
  });
}

/** Seed-shaped vendor-agent fixture. */
function vendorAgent(overrides: Partial<AgentWallet> = {}): AgentWallet {
  return buildAgentWallet({
    walletId: WALLET_ID,
    agentId: "vendor-agent",
    name: "vendor-agent",
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
    ...overrides,
  });
}

describe("authorizeTransaction — three decision branches", () => {
  it("ALLOWED: shopping-bot within all hard + soft limits (Cedar allow)", async () => {
    const agent = shoppingBot();
    const result = await authorizeTransaction({
      agent,
      apiKey: "shopping-bot-secret",
      transaction: {
        agentId: "shopping-bot",
        amount: 1500,
        recipient: "Amazon",
        type: "purchase",
        purpose: "office supplies",
        timestamp: NOW,
      },
      now: NOW,
    });

    expect(result.decision).toBe("ALLOWED");
    expect(result.reasons).toContain(AuthReason.cedarAllow);
    expect(result.failedCheck).toBeUndefined();
  });

  it("ALLOWED: vendor-agent within limits", async () => {
    const agent = vendorAgent();
    const result = await authorizeTransaction({
      agent,
      apiKey: "vendor-agent-secret",
      transaction: {
        agentId: "vendor-agent",
        amount: 8000,
        recipient: "VendorA",
        type: "payment",
        purpose: "invoice #42",
        timestamp: NOW,
      },
      now: NOW,
    });

    expect(result.decision).toBe("ALLOWED");
    expect(result.reasons).toContain(AuthReason.cedarAllow);
  });

  it("PENDING_APPROVAL: shopping-bot over per-transaction soft ceiling only", async () => {
    const agent = shoppingBot();
    const result = await authorizeTransaction({
      agent,
      apiKey: "shopping-bot-secret",
      transaction: {
        agentId: "shopping-bot",
        amount: 2500, // > perTransactionLimit 2000, but merchant/type ok
        recipient: "Flipkart",
        type: "purchase",
        purpose: "bulk order",
        timestamp: NOW,
      },
      now: NOW,
    });

    expect(result.decision).toBe("PENDING_APPROVAL");
    expect(result.reasons).toContain(AuthReason.overPerTransactionLimit);
    expect(result.failedCheck).toBe(4);
  });

  it("PENDING_APPROVAL: vendor-agent over daily soft ceiling only", async () => {
    const agent = vendorAgent({ spentToday: 15000 });
    const result = await authorizeTransaction({
      agent,
      apiKey: "vendor-agent-secret",
      transaction: {
        agentId: "vendor-agent",
        amount: 6000, // 15000+6000 > dailyLimit 20000; still <= perTxn 10000
        recipient: "VendorB",
        type: "payment",
        purpose: "overage",
        timestamp: NOW,
      },
      now: NOW,
    });

    expect(result.decision).toBe("PENDING_APPROVAL");
    expect(result.reasons).toContain(AuthReason.overDailyLimit);
    expect(result.failedCheck).toBe(5);
  });

  it("DENIED: shopping-bot disallowed merchant (hard check 6)", async () => {
    const agent = shoppingBot();
    const result = await authorizeTransaction({
      agent,
      apiKey: "shopping-bot-secret",
      transaction: {
        agentId: "shopping-bot",
        amount: 500,
        recipient: "Walmart",
        type: "purchase",
        purpose: "not allowed",
        timestamp: NOW,
      },
      now: NOW,
    });

    expect(result.decision).toBe("DENIED");
    expect(result.reasons).toEqual([AuthReason.disallowedMerchant]);
    expect(result.failedCheck).toBe(6);
  });

  it("DENIED: vendor-agent revoked (hard check 2)", async () => {
    const agent = vendorAgent({ status: "REVOKED" });
    const result = await authorizeTransaction({
      agent,
      apiKey: "vendor-agent-secret",
      transaction: {
        agentId: "vendor-agent",
        amount: 100,
        recipient: "VendorA",
        type: "payment",
        purpose: "should fail",
        timestamp: NOW,
      },
      now: NOW,
    });

    expect(result.decision).toBe("DENIED");
    expect(result.reasons).toEqual([AuthReason.agentInactive]);
    expect(result.failedCheck).toBe(2);
  });

  it("DENIED: soft ceiling fail + hard merchant fail → DENIED (hard wins)", async () => {
    const agent = shoppingBot();
    const result = await authorizeTransaction({
      agent,
      apiKey: "shopping-bot-secret",
      transaction: {
        agentId: "shopping-bot",
        amount: 2500,
        recipient: "Walmart",
        type: "purchase",
        purpose: "both fail",
        timestamp: NOW,
      },
      now: NOW,
    });

    expect(result.decision).toBe("DENIED");
    expect(result.reasons).toEqual([AuthReason.disallowedMerchant]);
    expect(result.failedCheck).toBe(6);
  });

  it("DENIED: bad API key (hard check 1)", async () => {
    const agent = shoppingBot();
    const result = await authorizeTransaction({
      agent,
      apiKey: "wrong-key",
      transaction: {
        agentId: "shopping-bot",
        amount: 100,
        recipient: "Amazon",
        type: "purchase",
        purpose: "auth fail",
        timestamp: NOW,
      },
      now: NOW,
    });

    expect(result.decision).toBe("DENIED");
    expect(result.reasons).toEqual([AuthReason.authFailed]);
    expect(result.failedCheck).toBe(1);
  });
});
