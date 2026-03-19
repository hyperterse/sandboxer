import {
  ProviderError,
  Sandboxer,
} from "../../../sdks/typescript/src/index.js";

async function main() {
  const apiKey =
    process.env.BLAXEL_API_KEY ||
    process.env.BL_API_KEY ||
    process.env.SANDBOXER_API_KEY;
  if (!apiKey) {
    console.error("Set BLAXEL_API_KEY (or BL_API_KEY / SANDBOXER_API_KEY).");
    process.exit(1);
  }
  const client = new Sandboxer({
    provider: "blaxel",
    config: { apiKey },
  });
  try {
    const [sb, info] = await client.createSandbox();
    console.log("created sandbox:", info.id, "status:", info.status);
    await sb.kill();
    console.log("deleted sandbox:", info.id);
  } catch (e) {
    if (e instanceof ProviderError) {
      console.error("provider error:", e.message);
      process.exit(1);
    }
    throw e;
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
