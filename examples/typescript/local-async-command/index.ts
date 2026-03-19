import { Sandboxer } from "../../../sdks/typescript/src/index.js";

async function main() {
  const client = new Sandboxer({ provider: "local" });
  const [sb] = await client.createSandbox();
  try {
    const { handleId } = await sb.startCommand({
      cmd: "sleep 1 && echo async-done",
    });
    const res = await sb.waitForHandle(handleId);
    console.log(res.stdout.trim(), "exit:", res.exitCode);
  } finally {
    await sb.kill();
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
