import { Sandboxer } from "../../../sdks/typescript/src/index.js";

async function main() {
  const apiKey = process.env.RUNLOOP_API_KEY;
  if (!apiKey) {
    console.error("Set RUNLOOP_API_KEY");
    process.exit(1);
  }
  const client = new Sandboxer({
    provider: "runloop",
    config: {
      apiKey,
      baseUrl: process.env.RUNLOOP_API_BASE,
    },
  });
  const [sb] = await client.createSandbox();
  try {
    const res = await sb.runCommand({ cmd: "echo runloop-ok" });
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
