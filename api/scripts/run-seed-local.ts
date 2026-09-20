/**
 * Cross-platform local seed.
 * Starts an in-process DynamoDB (dynalite) if nothing is listening on :8000,
 * then seeds data. No AWS account or Docker required.
 *
 * Env must be set before importing dynamo/seed (client reads env at load time).
 */
process.env.AWS_REGION ??= "eu-north-1";
process.env.TABLE_NAME ??= "agent-wallet-dev";
process.env.DYNAMODB_ENDPOINT ??= "http://127.0.0.1:8000";
process.env.AWS_ACCESS_KEY_ID ??= "local";
process.env.AWS_SECRET_ACCESS_KEY ??= "local";

async function portFree(port: number): Promise<boolean> {
  const { createServer } = await import("node:net");
  return new Promise((resolve) => {
    const tester = createServer()
      .once("error", () => resolve(false))
      .once("listening", () => {
        tester.close(() => resolve(true));
      })
      .listen(port, "127.0.0.1");
  });
}

async function main(): Promise<void> {
  const { default: dynalite } = await import("dynalite");
  const PORT = Number(new URL(process.env.DYNAMODB_ENDPOINT!).port || 8000);

  let server: ReturnType<typeof dynalite> | undefined;

  if (await portFree(PORT)) {
    server = dynalite({ createTableMs: 0, deleteTableMs: 0, updateTableMs: 0 });
    await new Promise<void>((resolve, reject) => {
      server!.listen(PORT, "127.0.0.1", () => resolve());
      server!.once("error", reject);
    });
    console.log(`Started dynalite on http://127.0.0.1:${PORT}`);
  } else {
    console.log(`Using existing DynamoDB at http://127.0.0.1:${PORT}`);
  }

  try {
    const { runSeed } = await import("./seed");
    await runSeed();
  } finally {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
