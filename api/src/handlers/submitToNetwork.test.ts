import { networkConfirmDelayMs } from "./submitToNetwork";

describe("submitToNetwork (demo stub)", () => {
  const prevLambda = process.env.AWS_LAMBDA_FUNCTION_NAME;
  const prevDelay = process.env.NETWORK_CONFIRM_DELAY_MS;

  afterEach(() => {
    if (prevLambda === undefined) {
      delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    } else {
      process.env.AWS_LAMBDA_FUNCTION_NAME = prevLambda;
    }
    if (prevDelay === undefined) {
      delete process.env.NETWORK_CONFIRM_DELAY_MS;
    } else {
      process.env.NETWORK_CONFIRM_DELAY_MS = prevDelay;
    }
  });

  it("uses 1.5s delay outside Lambda", () => {
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    delete process.env.NETWORK_CONFIRM_DELAY_MS;
    expect(networkConfirmDelayMs()).toBe(1500);
  });

  it("skips delay inside Lambda", () => {
    process.env.AWS_LAMBDA_FUNCTION_NAME = "agent-wallet-request-txn-dev";
    expect(networkConfirmDelayMs()).toBe(0);
  });
});
