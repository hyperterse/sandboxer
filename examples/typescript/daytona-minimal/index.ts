import { Sandboxer } from "../../../sdks/typescript/src/index.js";

async function main() {
  const tok = process.env.DAYTONA_API_KEY ?? process.env.DAYTONA_TOKEN ?? "";
  if (!tok) {
    console.error("Set DAYTONA_API_KEY or DAYTONA_TOKEN");
    process.exit(1);
  }
  const client = new Sandboxer({
    provider: "daytona",
    config: {
      apiKey: tok,
      baseUrl: process.env.DAYTONA_API_BASE ?? "https://app.daytona.io/api",
    },
  });
  const [sb] = await client.createSandbox();
  try {
    const res = await sb.runCommand({ cmd: "echo daytona-ok" });
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
