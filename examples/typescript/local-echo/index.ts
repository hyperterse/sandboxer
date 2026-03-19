import { Sandboxer } from "../../../sdks/typescript/src/index.js";

async function main() {
  const client = new Sandboxer({ provider: "local" });
  const [sb, info] = await client.createSandbox();
  try {
    console.log("sandbox:", info.id);
    const res = await sb.runCommand({ cmd: "echo hello from local" });
    console.log("stdout:", res.stdout.trim());
  } finally {
    await sb.kill();
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
