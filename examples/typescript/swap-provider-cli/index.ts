import {
  Sandboxer,
  type ProviderName,
} from "../../../sdks/typescript/src/index.js";

function parseProvider(arg?: string): ProviderName {
  const name = (arg ?? "local") as ProviderName;
  const allowed: ProviderName[] = [
    "local",
    "e2b",
    "daytona",
    "runloop",
    "fly-machines",
    "blaxel",
  ];
  if (!allowed.includes(name)) {
    throw new Error(`provider must be one of: ${allowed.join(", ")}`);
  }
  return name;
}

function clientFor(name: ProviderName): Sandboxer {
  switch (name) {
    case "local":
      return new Sandboxer({ provider: "local" });
    case "e2b": {
      const apiKey = process.env.E2B_API_KEY;
      if (!apiKey) throw new Error("E2B_API_KEY required for e2b");
      return new Sandboxer({
        provider: "e2b",
        config: {
          apiKey,
          baseUrl: process.env.E2B_API_BASE ?? "https://api.e2b.app",
        },
      });
    }
    case "daytona": {
      const tok = process.env.DAYTONA_API_KEY ?? process.env.DAYTONA_TOKEN;
      if (!tok) throw new Error("DAYTONA_API_KEY or DAYTONA_TOKEN required");
      return new Sandboxer({
        provider: "daytona",
        config: { apiKey: tok },
      });
    }
    case "runloop": {
      const apiKey = process.env.RUNLOOP_API_KEY;
      if (!apiKey) throw new Error("RUNLOOP_API_KEY required");
      return new Sandboxer({ provider: "runloop", config: { apiKey } });
    }
    case "fly-machines": {
      const token = process.env.FLY_API_TOKEN;
      if (!token) throw new Error("FLY_API_TOKEN required");
      return new Sandboxer({
        provider: "fly-machines",
        config: {
          apiKey: token,
          baseUrl: process.env.FLY_API_HOSTNAME,
        },
      });
    }
    case "blaxel":
      return new Sandboxer({
        provider: "blaxel",
        config: { apiKey: process.env.BLAXEL_API_KEY },
      });
  }
}

async function main() {
  const name = parseProvider(process.argv[2]);
  const client = clientFor(name);
  try {
    const rows = await client.listSandboxes({ limit: 20 });
    console.log(`provider=${name} sandboxes=${rows.length}`);
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
