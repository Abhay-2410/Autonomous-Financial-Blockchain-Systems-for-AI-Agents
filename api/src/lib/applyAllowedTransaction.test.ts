/**
 * Concurrent applyAllowedTransaction race against in-process DynamoDB (dynalite).
 * Env + jest.resetModules() so dynamo's module-level client picks up the endpoint.
 */
import { createServer } from "node:net";
import dynalite from "dynalite";
import {
  buildAgentWallet,
  buildTransaction,
  Keys,
  type AgentWallet,
  type Transaction,
} from "./schema";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("no port"));
        return;
      }
      const { port } = addr;
      s.close(() => resolve(port));
    });
  });
}

describe("applyAllowedTransaction concurrency", () => {
  let server: ReturnType<typeof dynalite>;
  let applyAllowedTransaction: (
    input: import("./applyAllowedTransaction").ApplyAllowedTransactionInput
  ) => Promise<import("./applyAllowedTransaction").ApplyAllowedTransactionResult>;
  let DailyLimitRaceError: new () => Error;
  let ensureTable: () => Promise<void>;
  let putItem: <T>(item: T) => Promise<T>;
  let getItem: <T>(keys: { pk: string; sk: string }) => Promise<T | null>;

  const TODAY = new Date().toISOString().slice(0, 10);
  const NOW = new Date().toISOString();
  const WALLET_ID = "org-limitx";
  const AGENT_ID = "shopping-bot";

  beforeAll(async () => {
    const port = await freePort();
    process.env.AWS_REGION = "eu-north-1";
    process.env.AWS_DEFAULT_REGION = "eu-north-1";
    process.env.AWS_ACCESS_KEY_ID = "local";
    process.env.AWS_SECRET_ACCESS_KEY = "local";
    process.env.DYNAMODB_ENDPOINT = `http://127.0.0.1:${port}`;
    process.env.TABLE_NAME = `agent-wallet-race-${port}`;
    process.env.WALLET_ID = WALLET_ID;

    server = dynalite({ createTableMs: 0, deleteTableMs: 0, updateTableMs: 0 });
    await new Promise<void>((resolve, reject) => {
      server.listen(port, "127.0.0.1", () => resolve());
      server.once("error", reject);
    });

    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dynamo = require("./dynamo") as typeof import("./dynamo");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const apply = require("./applyAllowedTransaction") as typeof import("./applyAllowedTransaction");

    ensureTable = dynamo.ensureTable;
    putItem = dynamo.putItem;
    getItem = dynamo.getItem;
    applyAllowedTransaction = apply.applyAllowedTransaction;
    DailyLimitRaceError = apply.DailyLimitRaceError;

    await ensureTable();
  }, 30000);

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("allows only one of two concurrent spends that together exceed dailyLimit", async () => {
    // dailyLimit 3000; two parallel 2000 spends → only one can commit.
    const agent = buildAgentWallet({
      walletId: WALLET_ID,
      agentId: AGENT_ID,
      name: AGENT_ID,
      status: "ACTIVE",
      dailyLimit: 3000,
      perTransactionLimit: 2500,
      allowedMerchants: ["Amazon"],
      spentToday: 0,
      spentTodayDate: TODAY,
      apiKey: "shopping-bot-secret",
      allocatedBalance: 100000,
    });
    await putItem(agent);

    const txnA = buildTransaction({
      agentId: AGENT_ID,
      txnId: "txn-a",
      amount: 2000,
      recipient: "Amazon",
      type: "purchase",
      purpose: "race-a",
      timestamp: NOW,
      status: "ALLOWED",
      reason: "ALLOWED",
    });
    const txnB = buildTransaction({
      agentId: AGENT_ID,
      txnId: "txn-b",
      amount: 2000,
      recipient: "Amazon",
      type: "purchase",
      purpose: "race-b",
      timestamp: NOW,
      status: "ALLOWED",
      reason: "ALLOWED",
    });
    await putItem(txnA);
    await putItem(txnB);

    const run = (transaction: Transaction) =>
      applyAllowedTransaction({
        agent,
        transaction,
        amount: 2000,
        recipient: "Amazon",
        timestamp: NOW,
      });

    const results = await Promise.allSettled([run(txnA), run(txnB)]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      DailyLimitRaceError
    );

    const latest = await getItem<AgentWallet>(
      Keys.agentWallet(WALLET_ID, AGENT_ID)
    );
    expect(latest?.spentToday).toBe(2000);
  });
});
