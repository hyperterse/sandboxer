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
  const [sb, info] = await client.createSandbox({ timeoutSeconds: 600 });
  try {
    console.log("sandbox:", info.id);
    const res = await sb.runCommand({ cmd: "echo hello from e2b" });
    console.log(res.stdout.trim());
  } finally {
    await sb.kill();
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
