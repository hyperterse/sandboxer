/**
 * Bump release semver across Go (sandboxer.Version), TypeScript SDK, and Python SDK.
 * Same workflow as https://github.com/hyperterse/hyperterse/blob/main/scripts/version.ts
 */
import { $ } from "bun";
import { resolve, dirname } from "node:path";
import semver from "semver";

const scriptDir = dirname(new URL(import.meta.url).pathname);
const projectRoot = resolve(scriptDir, "..");
$.cwd(projectRoot);

const paths = {
  tsPkg: resolve(projectRoot, "sdks/typescript/package.json"),
  pyProject: resolve(projectRoot, "sdks/python/pyproject.toml"),
  goVersion: resolve(projectRoot, "sdks/go/core/version.go"),
} as const;

function usage(): never {
  console.log("Usage: bun run scripts/version.ts [OPTIONS]");
  console.log("");
  console.log("Options:");
  console.log(
    "  --major              Bump major version (e.g., 1.0.0 -> 2.0.0)",
  );
  console.log(
    "  --minor              Bump minor version (e.g., 1.0.0 -> 1.1.0)",
  );
  console.log(
    "  --patch              Bump patch version (e.g., 1.0.0 -> 1.0.1)",
  );
  console.log(
    "  --prerelease <tag>   Create a prerelease (e.g., --prerelease alpha)",
  );
  console.log(
    "  --version <version>  Set exact version (e.g., --version 1.2.3)",
  );
  console.log(
    "  --push               Push commits and tags (git push --follow-tags)",
  );
  console.log("  --no-commit          Update files only; do not commit or tag");
  console.log("");
  console.log(
    "Updates: sdks/go/core/version.go, TypeScript package.json, Python pyproject.toml",
  );
  process.exit(1);
}

async function getLatestTagVersion(): Promise<string> {
  const output = (await $`git tag -l "v*"`.quiet().text()).trim();
  if (!output) return "0.0.0";

  const tags = output
    .split("\n")
    .filter(Boolean)
    .map((t) => t.replace(/^v/, ""))
    .filter((v) => semver.valid(v));

  if (tags.length === 0) return "0.0.0";
  return semver.rsort(tags)[0]!;
}

/** Highest valid semver among git tags and current Go manifest (avoids 0.0.1 when repo is already 0.1.0 but untagged). */
async function getBaselineVersion(): Promise<string> {
  const tagV = await getLatestTagVersion();
  const goV = await readGoVersion();
  const candidates = [tagV, goV].filter((v) => semver.valid(v));
  if (candidates.length === 0) return "0.0.0";
  return semver.rsort(candidates)[0]!;
}

async function readGoVersion(): Promise<string> {
  const text = await Bun.file(paths.goVersion).text();
  const m = text.match(/const Version = "([^"]*)"/);
  return m?.[1]?.trim() ?? "";
}

function updatePyProject(content: string, newVersion: string): string {
  const lines = content.split("\n");
  let inProject = false;
  const next = lines.map((line) => {
    if (/^\[project\]\s*$/.test(line)) {
      inProject = true;
      return line;
    }
    if (/^\[/.test(line) && !/^\[project\]/.test(line)) {
      inProject = false;
    }
    if (inProject && /^version\s*=\s*"[^"]*"\s*$/.test(line)) {
      return `version = "${newVersion}"`;
    }
    return line;
  });
  return next.join("\n");
}

/** TS/Python package versions (hand-maintained alongside Go). */
async function writeSdkPackageVersions(version: string): Promise<void> {
  const tsPkg = await Bun.file(paths.tsPkg).json();
  tsPkg.version = version;
  await Bun.write(paths.tsPkg, JSON.stringify(tsPkg, null, 2) + "\n");

  let py = await Bun.file(paths.pyProject).text();
  py = updatePyProject(py, version);
  await Bun.write(paths.pyProject, py);
}

type BaseBumpType = "major" | "minor" | "patch";
let bumpType: BaseBumpType = "patch";
let bumpTypeProvided = false;
let prereleaseRequested = false;
let prereleaseTag = "";
let explicitVersion = "";
let push = false;
let noCommit = false;

const args = process.argv.slice(2);
let i = 0;
while (i < args.length) {
  switch (args[i]) {
    case "--major":
      bumpType = "major";
      bumpTypeProvided = true;
      i++;
      break;
    case "--minor":
      bumpType = "minor";
      bumpTypeProvided = true;
      i++;
      break;
    case "--patch":
      bumpType = "patch";
      bumpTypeProvided = true;
      i++;
      break;
    case "--prerelease":
      prereleaseRequested = true;
      prereleaseTag = args[i + 1] || "";
      if (!prereleaseTag) {
        console.error("❌ Error: --prerelease requires a tag");
        usage();
      }
      i += 2;
      break;
    case "--version":
      explicitVersion = args[i + 1] || "";
      if (!explicitVersion) {
        console.error("❌ Error: --version requires a version number");
        usage();
      }
      i += 2;
      break;
    case "--push":
      push = true;
      i++;
      break;
    case "--no-commit":
      noCommit = true;
      i++;
      break;
    case "--help":
    case "-h":
      usage();
    default:
      console.error(`❌ Error: Unknown option: ${args[i]}`);
      usage();
  }
}

if (explicitVersion && (bumpTypeProvided || prereleaseRequested)) {
  console.error("❌ Error: Cannot combine --version with bumping options");
  usage();
}

if (push && noCommit) {
  console.error("❌ Error: Cannot use --push with --no-commit");
  usage();
}

try {
  await $`git rev-parse --git-dir`.quiet();
} catch {
  console.error("❌ Error: Not in a git repository");
  process.exit(1);
}

let dirty = false;
try {
  await $`git diff --quiet HEAD`.quiet();
} catch {
  dirty = true;
}

if (dirty) {
  const nonInteractive =
    !process.stdin.isTTY ||
    process.env.CI === "true" ||
    process.env.GITHUB_ACTIONS === "true";
  if (nonInteractive) {
    console.error(
      "❌ Error: Uncommitted changes. Commit or stash before bumping.",
    );
    process.exit(1);
  }
  console.log("⚠️  Warning: You have uncommitted changes");
  process.stdout.write("   Continue anyway? (y/N) ");
  process.stdin.setRawMode(true);
  const response = await new Promise<string>((resolve) => {
    process.stdin.once("data", (data) => {
      process.stdin.setRawMode(false);
      resolve(data.toString().trim());
    });
  });
  console.log();
  if (!/^[Yy]$/.test(response)) {
    console.error("❌ Aborted");
    process.exit(1);
  }
}

let newVersion: string;
if (explicitVersion) {
  newVersion = explicitVersion.replace(/^v/, "");
} else {
  const currentVersion = await getBaselineVersion();
  const tagOnly = await getLatestTagVersion();
  console.log(
    `📋 Baseline version: v${currentVersion} (latest tag: v${tagOnly})`,
  );

  let releaseType: semver.ReleaseType = bumpType;
  if (prereleaseRequested) {
    if (bumpType === "major") releaseType = "premajor";
    else if (bumpType === "minor") releaseType = "preminor";
    else releaseType = bumpTypeProvided ? "prepatch" : "prerelease";
  }

  const bumped = semver.inc(currentVersion, releaseType, prereleaseTag || "");
  if (!bumped) {
    console.error(
      `❌ Error: Failed to bump ${currentVersion} with ${releaseType}`,
    );
    process.exit(1);
  }
  newVersion = bumped;
}

if (!semver.valid(newVersion)) {
  console.error(`❌ Error: Invalid version format: ${newVersion}`);
  process.exit(1);
}

const manifestVersion = await readGoVersion();
let skipManifestUpdate = false;
if (newVersion === manifestVersion && manifestVersion) {
  console.log(`ℹ️  Version ${newVersion} already set in manifests`);
  skipManifestUpdate = true;
}

const tagName = `v${newVersion}`;
try {
  await $`git rev-parse ${tagName}`.quiet();
  console.error(`❌ Error: Tag ${tagName} already exists`);
  process.exit(1);
} catch {
  // ok
}

if (!skipManifestUpdate) {
  console.log("");
  console.log("📦 Updating version manifests...");

  let goSrc = await Bun.file(paths.goVersion).text();
  goSrc = goSrc.replace(
    /const Version = "[^"]*"/,
    `const Version = "${newVersion}"`,
  );
  await Bun.write(paths.goVersion, goSrc);
  console.log(`   ✓ ${paths.goVersion}`);

  await writeSdkPackageVersions(newVersion);
  console.log(`   ✓ ${paths.tsPkg}`);
  console.log(`   ✓ ${paths.pyProject}`);
}

if (!noCommit && !skipManifestUpdate) {
  console.log("");
  console.log("💾 Committing release version bump...");
  await $`git add sdks/go/core/version.go sdks/typescript/package.json sdks/python/pyproject.toml`;
  await $`git commit -m ${`v${newVersion}`}`;
  console.log("   ✓ Committed");
}

const timestamp = new Date()
  .toISOString()
  .replace("T", " ")
  .replace(/\.\d+Z/, " UTC");

if (!noCommit) {
  console.log("");
  console.log(`🏷️  Creating tag: ${tagName}`);
  console.log(`    Timestamp: ${timestamp}`);
  await $`git tag -a ${tagName} -m ${`Release ${tagName}\n\nTimestamp: ${timestamp}`}`;
  console.log(`✅ Created tag: ${tagName}`);
}

if (push) {
  console.log("");
  console.log("🚀 Pushing...");
  await $`git push --follow-tags`;
  console.log(`✅ Pushed ${tagName}`);
} else if (!noCommit) {
  console.log("");
  console.log("Next: git push --follow-tags");
}
