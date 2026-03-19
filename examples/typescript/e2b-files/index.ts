import { Sandboxer } from "../../../sdks/typescript/src/index.js";

async function main() {
  const apiKey = process.env.E2B_API_KEY;
  if (!apiKey) {
    console.error("Set E2B_API_KEY");
    process.exit(1);
  }
  const client = new Sandboxer({
    provider: "e2b",
    config: {
      apiKey,
      baseUrl: process.env.E2B_API_BASE ?? "https://api.e2b.app",
    },
  });
  const [sb] = await client.createSandbox({ timeoutSeconds: 600 });
  try {
    await sb.writeFile(
      "/tmp/e2b.txt",
      new TextEncoder().encode("typescript\n"),
    );
    const raw = await sb.readFile("/tmp/e2b.txt");
    console.log(new TextDecoder().decode(raw));
  } finally {
    await sb.kill();
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
