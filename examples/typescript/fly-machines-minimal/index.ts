import { Sandboxer } from "../../../sdks/typescript/src/index.js";

async function main() {
  const token = process.env.FLY_API_TOKEN;
  const app = process.env.FLY_APP_NAME ?? process.env.SANDBOXER_FLY_APP ?? "";
  if (!token || !app) {
    console.error("Set FLY_API_TOKEN and FLY_APP_NAME (or SANDBOXER_FLY_APP)");
    process.exit(1);
  }
  const client = new Sandboxer({
    provider: "fly-machines",
    config: {
      apiKey: token,
      baseUrl: process.env.FLY_API_HOSTNAME ?? "https://api.machines.dev",
    },
  });
  const rows = await client.listSandboxes({ limit: 5 });
  console.log("machines (sample):", rows.length);
  for (const r of rows) {
    console.log(r.id, r.status);
  }
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
