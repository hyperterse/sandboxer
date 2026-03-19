import { Sandboxer } from "../../../sdks/typescript/src/index.js";

async function main() {
  const client = new Sandboxer({ provider: "local" });
  const [sb] = await client.createSandbox();
  try {
    await sb.makeDir("/tmp/demo");
    await sb.writeFile("/tmp/demo/a.txt", new TextEncoder().encode("a"));
    const entries = await sb.listDirectory("/tmp/demo");
    for (const e of entries) {
      console.log(e.name, e.path);
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
