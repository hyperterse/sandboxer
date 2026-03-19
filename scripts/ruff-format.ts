/**
 * Run `ruff format` on paths passed as argv (Lefthook passes {staged_files}).
 * Prefers .venv from scripts/ensure-ruff.ts, then global ruff, then python -m ruff, then uvx.
 */
import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const scriptDir = dirname(new URL(import.meta.url).pathname);
const projectRoot = resolve(scriptDir, "..");

const files = process.argv.slice(2).filter(Boolean);
if (files.length === 0) process.exit(0);

function localRuff(): string | null {
  const unix = join(projectRoot, ".venv", "bin", "ruff");
  const win = join(projectRoot, ".venv", "Scripts", "ruff.exe");
  if (existsSync(unix)) return unix;
  if (existsSync(win)) return win;
  return null;
}

function run(cmd: string, args: string[], opts: SpawnSyncOptions<string> = {}) {
  return spawnSync(cmd, args, { cwd: projectRoot, stdio: "inherit", ...opts });
}

const local = localRuff();
if (local) {
  const r = run(local, ["format", ...files]);
  process.exit(r.status === null ? 1 : r.status);
}

let r = run("ruff", ["format", ...files], {
  shell: process.platform === "win32",
});
if (r.status === 0) process.exit(0);

if (process.platform === "win32") {
  r = run("py", ["-3", "-m", "ruff", "format", ...files]);
} else {
  r = run("python3", ["-m", "ruff", "format", ...files]);
}
if (r.status === 0) process.exit(0);

r = run("uvx", ["ruff", "format", ...files]);
if (r.status === 0) process.exit(0);

console.error(
  "ruff not found. Run: bun install (creates .venv + ruff)  OR  pip install ruff  OR  uv tool install ruff",
);
process.exit(1);
