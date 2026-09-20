import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceInUseException,
  ResourceNotFoundException,
  type DynamoDBClientConfig,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  type DeleteCommandInput,
  type GetCommandInput,
  type PutCommandInput,
  type QueryCommandInput,
  type ScanCommandInput,
  type UpdateCommandInput,
} from "@aws-sdk/lib-dynamodb";
import type {
  AgentWallet,
  AgentWalletItem,
  AuditEvent,
  DynamoKeys,
  Transaction,
} from "./schema";
import { Keys, SkPrefix } from "./schema";

/** Matches infra/samconfig.toml default; override via AWS_REGION. */
const DEFAULT_REGION = "eu-north-1";

// Ensure the default provider chain also sees a region (SDK auth schemes read env).
if (!process.env.AWS_REGION && !process.env.AWS_DEFAULT_REGION) {
  process.env.AWS_REGION = DEFAULT_REGION;
}

const TABLE_NAME = process.env.TABLE_NAME ?? "agent-wallet-dev";
const REGION =
  process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? DEFAULT_REGION;
const ENDPOINT = process.env.DYNAMODB_ENDPOINT; // e.g. http://localhost:8000

function buildClientConfig(): DynamoDBClientConfig {
  const config: DynamoDBClientConfig = { region: REGION };

  if (ENDPOINT) {
    // DynamoDB Local accepts any credentials; the SDK still requires some values.
    config.endpoint = ENDPOINT;
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "local",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "local",
    };
  }

  return config;
}

const raw = new DynamoDBClient(buildClientConfig());
export const docClient = DynamoDBDocumentClient.from(raw, {
  marshallOptions: { removeUndefinedValues: true },
});

export function getTableName(): string {
  return TABLE_NAME;
}

export function getDynamoEndpoint(): string | undefined {
  return ENDPOINT;
}

/** Create the single-table schema if it does not already exist. */
export async function ensureTable(): Promise<void> {
  try {
    await raw.send(
      new DescribeTableCommand({ TableName: TABLE_NAME })
    );
    return;
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) {
      throw err;
    }
  }

  try {
    await raw.send(
      new CreateTableCommand({
        TableName: TABLE_NAME,
        BillingMode: "PAY_PER_REQUEST",
        AttributeDefinitions: [
          { AttributeName: "pk", AttributeType: "S" },
          { AttributeName: "sk", AttributeType: "S" },
        ],
        KeySchema: [
          { AttributeName: "pk", KeyType: "HASH" },
          { AttributeName: "sk", KeyType: "RANGE" },
        ],
      })
    );
  } catch (err) {
    if (!(err instanceof ResourceInUseException)) {
      throw err;
    }
  }
}

/** Typed GetItem by primary key. */
export async function getItem<T extends AgentWalletItem>(
  keys: DynamoKeys
): Promise<T | null> {
  const input: GetCommandInput = {
    TableName: TABLE_NAME,
    Key: { pk: keys.pk, sk: keys.sk },
  };
  const result = await docClient.send(new GetCommand(input));
  return (result.Item as T | undefined) ?? null;
}

/** Typed PutItem (overwrite). */
export async function putItem<T extends AgentWalletItem>(
  item: T,
  options?: Pick<
    PutCommandInput,
    "ConditionExpression" | "ExpressionAttributeNames" | "ExpressionAttributeValues"
  >
): Promise<T> {
  const input: PutCommandInput = {
    TableName: TABLE_NAME,
    Item: item,
    ...options,
  };
  await docClient.send(new PutCommand(input));
  return item;
}

/** Typed DeleteItem by primary key. */
export async function deleteItem(keys: DynamoKeys): Promise<void> {
  const input: DeleteCommandInput = {
    TableName: TABLE_NAME,
    Key: { pk: keys.pk, sk: keys.sk },
  };
  await docClient.send(new DeleteCommand(input));
}

/**
 * Scan all items of a given entityType (paginated). Used by demo-reset.
 */
export async function scanByEntityType(
  entityType: string
): Promise<AgentWalletItem[]> {
  const items: AgentWalletItem[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const input: ScanCommandInput = {
      TableName: TABLE_NAME,
      FilterExpression: "entityType = :et",
      ExpressionAttributeValues: { ":et": entityType },
      ExclusiveStartKey: exclusiveStartKey,
    };
    const result = await docClient.send(new ScanCommand(input));
    for (const item of result.Items ?? []) {
      items.push(item as AgentWalletItem);
    }
    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);
  return items;
}

export interface UpdateItemParams {
  keys: DynamoKeys;
  /** SET expressions, e.g. ["#status = :status", "spentToday = :spent"] */
  set?: string[];
  /** REMOVE attribute names */
  remove?: string[];
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, unknown>;
  conditionExpression?: string;
  returnValues?: UpdateCommandInput["ReturnValues"];
}

/** Typed UpdateItem with SET / REMOVE helpers. */
export async function updateItem<T extends AgentWalletItem = AgentWalletItem>(
  params: UpdateItemParams
): Promise<T | null> {
  const parts: string[] = [];
  if (params.set?.length) {
    parts.push(`SET ${params.set.join(", ")}`);
  }
  if (params.remove?.length) {
    parts.push(`REMOVE ${params.remove.join(", ")}`);
  }
  if (!parts.length) {
    throw new Error("updateItem requires at least one SET or REMOVE expression");
  }

  const input: UpdateCommandInput = {
    TableName: TABLE_NAME,
    Key: { pk: params.keys.pk, sk: params.keys.sk },
    UpdateExpression: parts.join(" "),
    ExpressionAttributeNames: params.expressionAttributeNames,
    ExpressionAttributeValues: params.expressionAttributeValues,
    ConditionExpression: params.conditionExpression,
    ReturnValues: params.returnValues ?? "ALL_NEW",
  };

  const result = await docClient.send(new UpdateCommand(input));
  return (result.Attributes as T | undefined) ?? null;
}

/**
 * Look up an AgentWallet by agentId.
 * Prefers WALLET_ID env (GetItem); falls back to a filtered Scan.
 */
export async function getAgentById(
  agentId: string
): Promise<AgentWallet | null> {
  const walletId = process.env.WALLET_ID;
  if (walletId) {
    const item = await getItem<AgentWallet>(
      Keys.agentWallet(walletId, agentId)
    );
    if (item?.entityType === "AgentWallet") {
      return item;
    }
  }

  const input: ScanCommandInput = {
    TableName: TABLE_NAME,
    FilterExpression: "entityType = :et AND agentId = :aid",
    ExpressionAttributeValues: {
      ":et": "AgentWallet",
      ":aid": agentId,
    },
  };
  const result = await docClient.send(new ScanCommand(input));
  const match = (result.Items ?? []).find(
    (i) => (i as AgentWallet).entityType === "AgentWallet"
  ) as AgentWallet | undefined;
  return match ?? null;
}

/** Reset daily spend counters when the calendar day has rolled over. */
export async function resetSpentTodayIfNeeded(
  agent: AgentWallet,
  today: string = new Date().toISOString().slice(0, 10)
): Promise<AgentWallet> {
  if (agent.spentTodayDate === today) {
    return agent;
  }

  const updated = await updateItem<AgentWallet>({
    keys: Keys.agentWallet(agent.walletId, agent.agentId),
    set: ["spentToday = :zero", "spentTodayDate = :today"],
    expressionAttributeValues: {
      ":zero": 0,
      ":today": today,
    },
  });

  return (
    updated ?? {
      ...agent,
      spentToday: 0,
      spentTodayDate: today,
    }
  );
}

/** Look up a Transaction by txnId (scan — fine for hackathon scale). */
export async function getTransactionById(
  txnId: string
): Promise<Transaction | null> {
  const input: ScanCommandInput = {
    TableName: TABLE_NAME,
    FilterExpression: "entityType = :et AND txnId = :tid",
    ExpressionAttributeValues: {
      ":et": "Transaction",
      ":tid": txnId,
    },
  };
  const result = await docClient.send(new ScanCommand(input));
  const match = (result.Items ?? [])[0] as Transaction | undefined;
  return match?.entityType === "Transaction" ? match : null;
}

/** All transactions awaiting human approval (dashboard inbox). */
export async function listPendingApprovalTransactions(): Promise<
  Transaction[]
> {
  const input: ScanCommandInput = {
    TableName: TABLE_NAME,
    FilterExpression: "entityType = :et AND #status = :pending",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":et": "Transaction",
      ":pending": "PENDING_APPROVAL",
    },
  };
  const result = await docClient.send(new ScanCommand(input));
  return (result.Items ?? []).filter(
    (i) => (i as Transaction).entityType === "Transaction"
  ) as Transaction[];
}

export interface AuditLogPage {
  items: AuditEvent[];
  nextToken?: string;
}

/**
 * AuditEvents for an agent (PK=AGENT#id, SK begins_with AUDIT#), newest first.
 */
export async function queryAuditEvents(
  agentId: string,
  opts: { limit?: number; nextToken?: string } = {}
): Promise<AuditLogPage> {
  const limit = opts.limit ?? 50;
  let exclusiveStartKey: Record<string, unknown> | undefined;
  if (opts.nextToken) {
    try {
      exclusiveStartKey = JSON.parse(
        Buffer.from(opts.nextToken, "base64url").toString("utf8")
      ) as Record<string, unknown>;
    } catch {
      throw new Error("Invalid nextToken");
    }
  }

  const input: QueryCommandInput = {
    TableName: TABLE_NAME,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
    ExpressionAttributeValues: {
      ":pk": `AGENT#${agentId}`,
      ":sk": SkPrefix.audit,
    },
    ScanIndexForward: false,
    Limit: limit,
    ExclusiveStartKey: exclusiveStartKey,
  };

  const result = await docClient.send(new QueryCommand(input));
  const items = (result.Items ?? []).filter(
    (i) => (i as AuditEvent).entityType === "AuditEvent"
  ) as AuditEvent[];

  const nextToken = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey), "utf8").toString(
        "base64url"
      )
    : undefined;

  return { items, nextToken };
}
