import { Sandboxer } from "../../../sdks/typescript/src/index.js";

async function main() {
  const client = new Sandboxer({ provider: "local" });
  const [sb, info] = await client.createSandbox({
    metadata: { filterTag: "list-sandboxes-filter-demo" },
  });
  try {
    const narrow = await client.listSandboxes({
      provider: "local",
      metadataFilter: "list-sandboxes-filter-demo",
      limit: 10,
    });
    const hit = narrow.some((r) => r.id === info.id);
    console.log("filter hit this sandbox:", hit, "count:", narrow.length);
  } finally {
    await sb.kill();
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
