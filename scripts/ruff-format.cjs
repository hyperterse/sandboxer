#!/usr/bin/env node
/**
 * Run `ruff format` on paths passed as argv (Lefthook passes {staged_files}).
 * Prefers .venv from scripts/ensure-ruff.cjs, then global ruff, then python -m ruff, then uvx.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const files = process.argv.slice(2).filter(Boolean);
if (files.length === 0) process.exit(0);

function localRuff() {
  const unix = path.join(root, ".venv", "bin", "ruff");
  const win = path.join(root, ".venv", "Scripts", "ruff.exe");
  if (fs.existsSync(unix)) return unix;
  if (fs.existsSync(win)) return win;
  return null;
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: root, stdio: "inherit", ...opts });
}

const local = localRuff();
if (local) {
  const r = run(local, ["format", ...files]);
  process.exit(r.status === null ? 1 : r.status);
}

let r = run("ruff", ["format", ...files], { shell: process.platform === "win32" });
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
