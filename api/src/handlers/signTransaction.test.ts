import {
  assertAllowedForSigning,
  canonicalTransactionJson,
} from "./signTransaction";
import { buildTransaction, type Transaction } from "../lib/schema";

const NOW = new Date().toISOString();

function allowedTxn(overrides: Partial<Transaction> = {}): Transaction {
  return buildTransaction({
    agentId: "shopping-bot",
    txnId: "txn-1",
    amount: 1000,
    recipient: "Amazon",
    type: "purchase",
    purpose: "supplies",
    timestamp: NOW,
    status: "ALLOWED",
    reason: "ALLOWED",
    ...overrides,
  });
}

describe("signTransaction trust-boundary helpers", () => {
  it("canonicalTransactionJson is stable and key-sorted", () => {
    const a = canonicalTransactionJson(allowedTxn());
    const b = canonicalTransactionJson(allowedTxn());
    expect(a).toBe(b);
    const parsed = JSON.parse(a) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual([
      "agentId",
      "amount",
      "purpose",
      "recipient",
      "status",
      "timestamp",
      "txnId",
      "type",
    ]);
    expect(parsed.status).toBe("ALLOWED");
  });

  it("assertAllowedForSigning accepts ALLOWED only", () => {
    expect(assertAllowedForSigning(allowedTxn()).status).toBe("ALLOWED");
    expect(() =>
      assertAllowedForSigning(allowedTxn({ status: "PENDING_APPROVAL" }))
    ).toThrow(/ALLOWED/);
    expect(() => assertAllowedForSigning(null)).toThrow(/not found/);
  });
});
