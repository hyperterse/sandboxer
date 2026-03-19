import {
  NotSupportedError,
  Sandboxer,
} from "../../../sdks/typescript/src/index.js";

async function main() {
  const apiKey = process.env.E2B_API_KEY;
  if (!apiKey) {
    console.error("Set E2B_API_KEY");
    process.exit(1);
  }
  const client = new Sandboxer({
    provider: "e2b",
    config: {
      apiKey,
      baseUrl: process.env.E2B_API_BASE ?? "https://api.e2b.app",
    },
  });
  const [sb] = await client.createSandbox({ timeoutSeconds: 600 });
  try {
    try {
      const pty = await sb.createPty({ rows: 24, cols: 80 });
      console.log("pty pid:", pty.pid);
    } catch (e) {
      if (e instanceof NotSupportedError) {
        console.log("PTY not supported in this SDK build yet (expected)");
        return;
      }
      throw e;
    }
  } finally {
    await sb.kill();
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
