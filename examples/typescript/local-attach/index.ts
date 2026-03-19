import { Sandboxer } from "../../../sdks/typescript/src/index.js";

async function main() {
  const client = new Sandboxer({ provider: "local" });
  const [sb1, info] = await client.createSandbox();
  try {
    const sb2 = await client.attachSandbox(info.id);
    const res = await sb2.runCommand({ cmd: "echo attached-ok" });
    console.log(res.stdout.trim());
  } finally {
    await sb1.kill();
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
