/**
 * Amount fidelity: a $25 Pay request must stay exactly 25 through
 * requestTransaction → Transaction / spentToday / audit (no ×1000 / stroops).
 */
import { createServer } from "node:net";
import dynalite from "dynalite";
import {
  buildAgentWallet,
  Keys,
  type AgentWallet,
  type AuditEvent,
  type Transaction,
} from "../lib/schema";

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

describe("requestTransaction amount fidelity ($25 stays $25)", () => {
  let server: ReturnType<typeof dynalite>;
  let handler: (event: {
    body?: string;
    headers?: Record<string, string>;
  }) => Promise<{ statusCode?: number; body?: string }>;
  let ensureTable: () => Promise<void>;
  let putItem: <T>(item: T) => Promise<T>;
  let getItem: <T>(keys: { pk: string; sk: string }) => Promise<T | null>;
  let docClient: { send: (cmd: unknown) => Promise<{ Items?: unknown[] }> };
  let getTableName: () => string;
  let QueryCommand: new (input: unknown) => unknown;

  const TODAY = new Date().toISOString().slice(0, 10);
  const NOW = new Date().toISOString();
  const WALLET_ID = "org-limitx";
  const AGENT_ID = "shopping-bot";
  const AMOUNT = 25;

  beforeAll(async () => {
    const port = await freePort();
    process.env.AWS_REGION = "eu-north-1";
    process.env.AWS_DEFAULT_REGION = "eu-north-1";
    process.env.AWS_ACCESS_KEY_ID = "local";
    process.env.AWS_SECRET_ACCESS_KEY = "local";
    process.env.DYNAMODB_ENDPOINT = `http://127.0.0.1:${port}`;
    process.env.TABLE_NAME = `agent-wallet-amt-${port}`;
    process.env.WALLET_ID = WALLET_ID;
    process.env.OWNER_API_KEY = "limitx-owner-demo-key";
    // Skip KMS / Stellar settlement — we only assert policy-unit persistence.
    delete process.env.SIGN_TRANSACTION_FUNCTION_NAME;
    delete process.env.AUTHORIZE_AND_SIGN_VIA_ENCLAVE_FUNCTION_NAME;

    server = dynalite({ createTableMs: 0, deleteTableMs: 0, updateTableMs: 0 });
    await new Promise<void>((resolve, reject) => {
      server.listen(port, "127.0.0.1", () => resolve());
      server.once("error", reject);
    });

    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dynamo = require("../lib/dynamo") as typeof import("../lib/dynamo");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const libDynamo = require("@aws-sdk/lib-dynamodb") as typeof import("@aws-sdk/lib-dynamodb");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const req = require("./requestTransaction") as typeof import("./requestTransaction");

    ensureTable = dynamo.ensureTable;
    putItem = dynamo.putItem;
    getItem = dynamo.getItem;
    docClient = dynamo.docClient as typeof docClient;
    getTableName = dynamo.getTableName;
    QueryCommand = libDynamo.QueryCommand;
    handler = req.handler as typeof handler;

    await ensureTable();
  }, 30000);

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("records exactly 25 on Transaction, spentToday, and audit — not 25000", async () => {
    const agent = buildAgentWallet({
      walletId: WALLET_ID,
      agentId: AGENT_ID,
      name: AGENT_ID,
      status: "ACTIVE",
      dailyLimit: 5000,
      perTransactionLimit: 2000,
      allowedMerchants: ["Amazon"],
      spentToday: 0,
      spentTodayDate: TODAY,
      apiKey: "shopping-bot-secret",
      allocatedBalance: 100000,
    });
    await putItem(agent);

    const res = await handler({
      headers: {
        "x-owner-key": "limitx-owner-demo-key",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        agentId: AGENT_ID,
        amount: AMOUNT,
        recipient: "Amazon",
        type: "purchase",
        purpose: "unit-fidelity",
        timestamp: NOW,
        settlementRail: "chain",
      }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body ?? "{}") as {
      transactionId: string;
      decision: string;
    };
    expect(body.decision).toBe("ALLOWED");
    expect(body.transactionId).toBeTruthy();

    const txn = await getItem<Transaction>(
      Keys.transaction(AGENT_ID, NOW, body.transactionId)
    );
    expect(txn?.amount).toBe(25);
    expect(txn?.amount).not.toBe(25_000);
    expect(txn?.amount).not.toBe(25 * 1000);

    const updatedAgent = await getItem<AgentWallet>(
      Keys.agentWallet(WALLET_ID, AGENT_ID)
    );
    expect(updatedAgent?.spentToday).toBe(25);
    expect(updatedAgent?.spentToday).not.toBe(25_000);

    const auditPage = await docClient.send(
      new QueryCommand({
        TableName: getTableName(),
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: {
          ":pk": `AGENT#${AGENT_ID}`,
          ":sk": "AUDIT#",
        },
      })
    );
    const audits = (auditPage.Items ?? []) as AuditEvent[];
    const allowed = audits.find(
      (a) =>
        a.entityType === "AuditEvent" &&
        (a.details as { type?: string; amount?: number })?.type ===
          "TRANSACTION_ALLOWED"
    );
    expect(allowed).toBeTruthy();
    expect((allowed!.details as { amount: number }).amount).toBe(25);
    expect((allowed!.details as { amount: number }).amount).not.toBe(25_000);
  });
});
