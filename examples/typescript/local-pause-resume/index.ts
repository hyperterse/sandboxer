import { Sandboxer } from "../../../sdks/typescript/src/index.js";

async function main() {
  const client = new Sandboxer({ provider: "local" });
  const [sb] = await client.createSandbox();
  try {
    console.log("running:", await sb.isRunning());
    await sb.pause();
    console.log("after pause, info status:", (await sb.info()).status);
    await sb.resume();
    console.log("after resume, running:", await sb.isRunning());
    const res = await sb.runCommand({ cmd: "echo resumed-ok" });
    console.log(res.stdout.trim());
  } finally {
    await sb.kill();
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
