import { Sandboxer } from "../../../sdks/typescript/src/index.js";

async function main() {
  const client = new Sandboxer({ provider: "local" });
  const [sb, info] = await client.createSandbox({
    metadata: { example: "local-list-sandboxes" },
  });
  try {
    const rows = await client.listSandboxes();
    console.log("total listed:", rows.length);
    const mine = rows.filter((r) => r.id === info.id);
    console.log("this sandbox in list:", mine.length === 1);
  } finally {
    await sb.kill();
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
