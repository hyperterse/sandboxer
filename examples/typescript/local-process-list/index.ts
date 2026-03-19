import { Sandboxer } from "../../../sdks/typescript/src/index.js";

async function main() {
  const client = new Sandboxer({ provider: "local" });
  const [sb] = await client.createSandbox();
  try {
    const procs = await sb.listProcesses();
    console.log("process count:", procs.length);
    for (const p of procs.slice(0, 8)) {
      console.log(p.pid, p.command);
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
