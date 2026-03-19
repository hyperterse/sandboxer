import { Sandboxer } from "../../../sdks/typescript/src/index.js";

async function main() {
  const client = new Sandboxer({ provider: "local" });
  const [sb] = await client.createSandbox({
    envs: { SANDBOX_CREATED: "1" },
  });
  try {
    const res = await sb.runCommand({
      cmd: "sh -c 'echo CREATED=$SANDBOX_CREATED; echo HELLO=$HELLO'",
      env: { HELLO: "world" },
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
