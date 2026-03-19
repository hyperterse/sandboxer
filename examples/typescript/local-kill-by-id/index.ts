import { Sandboxer } from "../../../sdks/typescript/src/index.js";

async function main() {
  const client = new Sandboxer({ provider: "local" });
  const [_sb, info] = await client.createSandbox();
  try {
    await client.killSandbox(info.id);
    console.log("killSandbox:", info.id);
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
