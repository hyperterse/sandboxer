import { Sandboxer } from "../../../sdks/typescript/src/index.js";

async function main() {
  const client = new Sandboxer({ provider: "local" });
  const [sb, info] = await client.createSandbox({
    template: "alpine:latest",
    metadata: { role: "demo" },
    envs: { DEMO: "1" },
    cpus: 1,
    memoryMb: 256,
    timeoutSeconds: 3600,
  });
  try {
    console.log("id:", info.id, "template:", info.template);
    const res = await sb.runCommand({
      cmd: "echo cpus-and-mem-ok; printenv DEMO",
    });
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
