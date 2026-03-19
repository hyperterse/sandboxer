import { Sandboxer } from "../../../sdks/typescript/src/index.js";

async function main() {
  const client = new Sandboxer({ provider: "local" });
  const [sb] = await client.createSandbox();
  try {
    await sb.writeFile(
      "/tmp/hello.txt",
      new TextEncoder().encode("sandboxer\n"),
    );
    const data = await sb.readFile("/tmp/hello.txt");
    console.log(new TextDecoder().decode(data));
  } finally {
    await sb.kill();
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
