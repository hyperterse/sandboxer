import { Sandboxer } from "../../../sdks/typescript/src/index.js";

async function main() {
  const client = new Sandboxer({ provider: "local" });
  const [sb] = await client.createSandbox();
  try {
    const [a, b, _] = await Promise.all([
      sb.runCommand({ cmd: "echo parallel-a" }),
      sb.writeFile("/tmp/w.txt", new TextEncoder().encode("parallel-write\n")),
      sb.runCommand({ cmd: "echo parallel-b" }),
    ]);
    console.log("parallel stdout:", a.stdout.trim(), b.stdout.trim());

    const r1 = await sb.runCommand({ cmd: "echo step-1" });
    const r2 = await sb.runCommand({ cmd: "echo step-2" });
    console.log("sequential:", r1.stdout.trim(), r2.stdout.trim());
  } finally {
    await sb.kill();
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
