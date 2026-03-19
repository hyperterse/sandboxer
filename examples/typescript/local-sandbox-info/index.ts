import { Sandboxer } from "../../../sdks/typescript/src/index.js";

async function main() {
  const client = new Sandboxer({ provider: "local" });
  const [sb, created] = await client.createSandbox();
  try {
    const info = await sb.info();
    console.log("created id:", created.id, "status:", created.status);
    console.log("info():", info.id, info.status, info.template);
  } finally {
    await sb.kill();
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
