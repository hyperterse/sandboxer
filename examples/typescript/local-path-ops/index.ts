import { Sandboxer } from "../../../sdks/typescript/src/index.js";

async function main() {
  const client = new Sandboxer({ provider: "local" });
  const [sb] = await client.createSandbox();
  try {
    await sb.makeDir("/tmp/p");
    await sb.writeFile("/tmp/p/x.txt", new TextEncoder().encode("x"));
    console.log("exists /tmp/p/x.txt:", await sb.exists("/tmp/p/x.txt"));
    await sb.remove("/tmp/p/x.txt");
    console.log("exists after remove:", await sb.exists("/tmp/p/x.txt"));
  } finally {
    await sb.kill();
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
