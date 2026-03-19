/**
 * Ensure Go / TypeScript / Python release versions match (and optionally match a git tag).
 */
import { resolve, dirname } from "node:path";
import semver from "semver";

const scriptDir = dirname(new URL(import.meta.url).pathname);
const projectRoot = resolve(scriptDir, "..");

const paths = {
  tsPkg: resolve(projectRoot, "sdks/typescript/package.json"),
  pyProject: resolve(projectRoot, "sdks/python/pyproject.toml"),
  goVersion: resolve(projectRoot, "sdks/go/core/version.go"),
} as const;

async function readGoVersion(): Promise<string> {
  const text = await Bun.file(paths.goVersion).text();
  const m = text.match(/const Version = "([^"]*)"/);
  return m?.[1]?.trim() ?? "";
}

async function readTsVersion(): Promise<string> {
  const pkg = await Bun.file(paths.tsPkg).json();
  return String(pkg.version ?? "").trim();
}

async function readPyVersion(): Promise<string> {
  const text = await Bun.file(paths.pyProject).text();
  let inProject = false;
  for (const line of text.split("\n")) {
    if (/^\[project\]\s*$/.test(line)) {
      inProject = true;
      continue;
    }
    if (/^\[/.test(line) && !/^\[project\]/.test(line)) {
      inProject = false;
      continue;
    }
    const m = inProject && line.match(/^version\s*=\s*"([^"]*)"\s*$/);
    if (m) return m[1]!.trim();
  }
  return "";
}

function usage(): never {
  console.log(
    "Usage: bun run scripts/verify-versions.ts [--expect <version|vX.Y.Z>]",
  );
  process.exit(1);
}

let expect = "";
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--expect") {
    expect = args[i + 1] || "";
    if (!expect) usage();
    expect = expect.replace(/^v/, "");
    i++;
  } else if (args[i] === "-h" || args[i] === "--help") {
    usage();
  } else {
    console.error(`Unknown option: ${args[i]}`);
    usage();
  }
}

const goV = await readGoVersion();
const tsV = await readTsVersion();
const pyV = await readPyVersion();

const missing = !goV || !tsV || !pyV;
if (missing) {
  console.error("❌ Could not read version from one or more files");
  console.error(`   Go: ${goV || "(missing)"}`);
  console.error(`   TS: ${tsV || "(missing)"}`);
  console.error(`   Py: ${pyV || "(missing)"}`);
  process.exit(1);
}

if (goV !== tsV || goV !== pyV) {
  console.error("❌ Version mismatch:");
  console.error(`   sdks/go/core/version.go: ${goV}`);
  console.error(`   sdks/typescript/package.json: ${tsV}`);
  console.error(`   sdks/python/pyproject.toml:   ${pyV}`);
  process.exit(1);
}

if (!semver.valid(goV)) {
  console.error(`❌ Invalid semver in manifests: ${goV}`);
  process.exit(1);
}

if (expect && goV !== expect) {
  console.error(`❌ Expected version ${expect}, but manifests have ${goV}`);
  process.exit(1);
}

console.log(`✅ All release versions match: v${goV}`);
if (expect) console.log(`   (matches --expect ${expect})`);
