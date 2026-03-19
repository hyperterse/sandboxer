#!/usr/bin/env node
/**
 * Ensures a project-local Ruff binary exists under .venv/ (gitignored).
 * Run from package.json prepare after bun/npm install.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function localRuff() {
  const unix = path.join(root, ".venv", "bin", "ruff");
  const win = path.join(root, ".venv", "Scripts", "ruff.exe");
  if (fs.existsSync(unix)) return unix;
  if (fs.existsSync(win)) return win;
  return null;
}

if (localRuff()) process.exit(0);

const py = process.platform === "win32" ? "py" : "python3";
const venvArgs = process.platform === "win32" ? ["-3", "-m", "venv", ".venv"] : ["-m", "venv", ".venv"];
const venv = spawnSync(py, venvArgs, { cwd: root, stdio: "inherit" });
if (venv.status !== 0) {
  console.warn(
    "[ensure-ruff] Could not create .venv (is Python 3 installed?). Install Ruff manually: pip install ruff",
  );
  process.exit(0);
}

const pip =
  process.platform === "win32"
    ? path.join(root, ".venv", "Scripts", "pip.exe")
    : path.join(root, ".venv", "bin", "pip");
const inst = spawnSync(pip, ["install", "-q", "ruff>=0.8"], { cwd: root, stdio: "inherit" });
process.exit(inst.status === null ? 1 : inst.status);
