import {
  SFNClient,
  SendTaskSuccessCommand,
} from "@aws-sdk/client-sfn";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { getTransactionById } from "../lib/dynamo";
import { json } from "../lib/http";

const sfn = new SFNClient({});

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const transactionId = event.pathParameters?.transactionId;
  if (!transactionId) {
    return json(400, { message: "transactionId path parameter required" });
  }

  const txn = await getTransactionById(transactionId);
  if (!txn) {
    return json(404, { message: `Transaction not found: ${transactionId}` });
  }
  if (txn.status !== "PENDING_APPROVAL") {
    return json(409, {
      message: `Transaction is not PENDING_APPROVAL (status=${txn.status})`,
    });
  }
  if (!txn.approvalTaskToken) {
    return json(409, {
      message: "Approval task token not ready yet; retry shortly",
    });
  }

  await sfn.send(
    new SendTaskSuccessCommand({
      taskToken: txn.approvalTaskToken,
      output: JSON.stringify({
        approved: true,
        transactionId,
        agentId: txn.agentId,
        timestamp: txn.timestamp,
      }),
    })
  );

  return json(200, {
    transactionId,
    decision: "APPROVED",
    message: "SendTaskSuccess delivered; OnApprove will run next",
  });
};
