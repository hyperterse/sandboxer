import {
  NotSupportedError,
  Sandboxer,
} from "../../../sdks/typescript/src/index.js";

async function main() {
  const client = new Sandboxer({ provider: "local" });
  const [sb] = await client.createSandbox();
  try {
    try {
      await sb.createPty({});
    } catch (e) {
      if (e instanceof NotSupportedError) {
        console.log("instanceof NotSupportedError");
        return;
      }
      if (e instanceof Error && e.name === "NotSupportedError") {
        console.log("caught by name:", e.name);
        return;
      }
      throw e;
    }
  } finally {
    await sb.kill();
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
