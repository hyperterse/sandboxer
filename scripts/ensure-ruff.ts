/**
 * Ensures a project-local Ruff binary exists under .venv/ (gitignored).
 * Run from package.json prepare after bun/npm install.
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { dirname, join } from "node:path";

const scriptDir = dirname(new URL(import.meta.url).pathname);
const root = join(scriptDir, "..");

function localRuff(): string | null {
  const unix = join(root, ".venv", "bin", "ruff");
  const win = join(root, ".venv", "Scripts", "ruff.exe");
  if (fs.existsSync(unix)) return unix;
  if (fs.existsSync(win)) return win;
  return null;
}

if (localRuff()) process.exit(0);

const py = process.platform === "win32" ? "py" : "python3";
const venvArgs =
  process.platform === "win32"
    ? ["-3", "-m", "venv", ".venv"]
    : ["-m", "venv", ".venv"];
const venv = spawnSync(py, venvArgs, { cwd: root, stdio: "inherit" });
if (venv.status !== 0) {
  console.warn(
    "[ensure-ruff] Could not create .venv (is Python 3 installed?). Install Ruff manually: pip install ruff",
  );
  process.exit(0);
}

const pip =
  process.platform === "win32"
    ? join(root, ".venv", "Scripts", "pip.exe")
    : join(root, ".venv", "bin", "pip");
const inst = spawnSync(pip, ["install", "-q", "ruff>=0.8"], {
  cwd: root,
  stdio: "inherit",
});
process.exit(inst.status === null ? 1 : inst.status);
