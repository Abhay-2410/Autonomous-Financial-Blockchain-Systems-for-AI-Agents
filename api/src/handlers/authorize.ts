import type { APIGatewayProxyHandlerV2 } from "aws-lambda";

export const handler: APIGatewayProxyHandlerV2 = async (_event) => {
  // TODO: implement
  return {
    statusCode: 501,
    body: JSON.stringify({ message: "Not implemented" }),
  };
};
