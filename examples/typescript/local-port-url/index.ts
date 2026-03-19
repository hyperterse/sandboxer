import {
  NotSupportedError,
  Sandboxer,
} from "../../../sdks/typescript/src/index.js";

async function main() {
  const client = new Sandboxer({ provider: "local" });
  const [sb] = await client.createSandbox();
  try {
    try {
      const url = await sb.portUrl(8080);
      console.log("portUrl:", url);
    } catch (e) {
      if (e instanceof NotSupportedError) {
        console.log(
          "portUrl: no host port published for this container (expected for default local create).",
        );
      } else {
        throw e;
      }
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
