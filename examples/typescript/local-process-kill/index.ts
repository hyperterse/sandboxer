import { Sandboxer } from "../../../sdks/typescript/src/index.js";

async function main() {
  const client = new Sandboxer({ provider: "local" });
  const [sb] = await client.createSandbox();
  try {
    const spawned = await sb.runCommand({
      cmd: `sh -c 'sleep 120 & echo $!'`,
    });
    const pid = parseInt(spawned.stdout.trim(), 10);
    if (!Number.isFinite(pid)) {
      throw new Error("could not parse background pid");
    }
    await sb.killProcess(pid);
    console.log("sent kill to pid", pid);
  } finally {
    await sb.kill();
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
