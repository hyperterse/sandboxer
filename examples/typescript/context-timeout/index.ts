import { Sandboxer } from "../../../sdks/typescript/src/index.js";

async function main() {
  const client = new Sandboxer({ provider: "local" });
  const [sb] = await client.createSandbox();
  try {
    try {
      await sb.runCommand({
        cmd: "sleep 120",
        timeoutSeconds: 2,
      });
    } catch (e) {
      console.log(
        "command failed or timed out (expected):",
        e instanceof Error ? e.message : e,
      );
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
