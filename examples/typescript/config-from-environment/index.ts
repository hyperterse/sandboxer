import {
  Sandboxer,
  type ProviderName,
} from "../../../sdks/typescript/src/index.js";

function clientFromEnv(): Sandboxer {
  const name = (process.env.SANDBOXER_PROVIDER ?? "local") as ProviderName;
  const apiKey = process.env.SANDBOXER_API_KEY;
  const baseUrl = process.env.SANDBOXER_BASE_URL;

  switch (name) {
    case "local":
      return new Sandboxer({ provider: "local" });
    case "e2b":
      return new Sandboxer({
        provider: "e2b",
        config: {
          apiKey: apiKey ?? process.env.E2B_API_KEY,
          baseUrl: baseUrl ?? process.env.E2B_API_BASE,
        },
      });
    case "daytona":
      return new Sandboxer({
        provider: "daytona",
        config: {
          apiKey: apiKey ?? process.env.DAYTONA_API_KEY,
          baseUrl: baseUrl,
        },
      });
    case "runloop":
      return new Sandboxer({
        provider: "runloop",
        config: {
          apiKey: apiKey ?? process.env.RUNLOOP_API_KEY,
          baseUrl: baseUrl,
        },
      });
    case "fly-machines":
      return new Sandboxer({
        provider: "fly-machines",
        config: {
          apiKey: apiKey ?? process.env.FLY_API_TOKEN,
          baseUrl: baseUrl ?? process.env.FLY_API_HOSTNAME,
        },
      });
    case "blaxel":
      return new Sandboxer({
        provider: "blaxel",
        config: { apiKey: apiKey ?? process.env.BLAXEL_API_KEY },
      });
    default:
      throw new Error(`unknown SANDBOXER_PROVIDER: ${name}`);
  }
}

async function main() {
  const client = clientFromEnv();
  try {
    const rows = await client.listSandboxes({ limit: 3 });
    console.log("listed:", rows.length);
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
