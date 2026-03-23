/**
 * Regenerate README.md files under examples/{go,python,typescript}/<name>/.
 */
import { dirname, join, relative, resolve } from "node:path";

const scriptDir = dirname(new URL(import.meta.url).pathname);
const projectRoot = resolve(scriptDir, "..");
const EXAMPLES = join(projectRoot, "examples");

const WIDTH = 80;

const _WHITESPACE = "\t\n\x0b\x0c\r ";

function reEscapeForCharClass(s: string): string {
  return [...s]
    .map((c) => {
      if (c === "\t") return "\\t";
      if (c === "\n") return "\\n";
      if (c === "\x0b") return "\\x0b";
      if (c === "\x0c") return "\\x0c";
      if (c === "\r") return "\\r";
      if (c === " ") return " ";
      return c;
    })
    .join("");
}

const _whitespaceClass = `[${reEscapeForCharClass(_WHITESPACE)}]`;
const _nowhitespaceClass = `[^${reEscapeForCharClass(_WHITESPACE)}]`;
const _wordPunct = `[\w!"'&.,?]`;
const _letter = "[^\\d\\W]";

/** Python `textwrap` wordsep regex; `\Z` is expressed as `$` for JavaScript. */
const WORDSEP_PATTERN =
  "(" +
  _whitespaceClass +
  "+|" +
  "(?<=" +
  _wordPunct +
  ")-{2,}(?=\\w)|" +
  _nowhitespaceClass +
  "+?(?:-(?:(?<=" +
  _letter +
  "{2}-)|(?<=" +
  _letter +
  "-" +
  _letter +
  "-))(?=" +
  _letter +
  "-?" +
  _letter +
  ")|(?=" +
  _whitespaceClass +
  "|$)|(?<=" +
  _wordPunct +
  ")(?=-{2,}\\w)))";

const WORDSEP_RE = new RegExp(WORDSEP_PATTERN, "us");

function expandTabs(text: string, tabSize = 8): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    let buf = "";
    let col = 0;
    for (let i = 0; i < line.length; i++) {
      const c = line[i]!;
      if (c === "\t") {
        const n = tabSize - (col % tabSize);
        buf += " ".repeat(n);
        col += n;
      } else {
        buf += c;
        col += 1;
      }
    }
    out.push(buf);
  }
  return out.join("\n");
}

function mungeWhitespace(
  text: string,
  expandTabsFlag: boolean,
  tabSize: number,
  replaceWhitespace: boolean,
): string {
  if (expandTabsFlag) text = expandTabs(text, tabSize);
  if (replaceWhitespace) {
    text = text.replace(/[\t\n\x0b\x0c\r ]/g, " ");
  }
  return text;
}

function splitWordsep(text: string): string[] {
  return text.split(WORDSEP_RE).filter((c) => c.length > 0);
}

class TextWrapper {
  width: number;
  initialIndent: string;
  subsequentIndent: string;
  expandTabsFlag: boolean;
  replaceWhitespace: boolean;
  fixSentenceEndings: boolean;
  breakLongWords: boolean;
  dropWhitespace: boolean;
  breakOnHyphens: boolean;
  tabSize: number;
  maxLines: number | undefined;
  placeholder: string;

  constructor(
    width = 70,
    initialIndent = "",
    subsequentIndent = "",
    options: {
      expandTabs?: boolean;
      replaceWhitespace?: boolean;
      fixSentenceEndings?: boolean;
      breakLongWords?: boolean;
      dropWhitespace?: boolean;
      breakOnHyphens?: boolean;
      tabSize?: number;
      maxLines?: number | null;
      placeholder?: string;
    } = {},
  ) {
    this.width = width;
    this.initialIndent = initialIndent;
    this.subsequentIndent = subsequentIndent;
    this.expandTabsFlag = options.expandTabs ?? true;
    this.replaceWhitespace = options.replaceWhitespace ?? true;
    this.fixSentenceEndings = options.fixSentenceEndings ?? false;
    this.breakLongWords = options.breakLongWords ?? true;
    this.dropWhitespace = options.dropWhitespace ?? true;
    this.breakOnHyphens = options.breakOnHyphens ?? true;
    this.tabSize = options.tabSize ?? 8;
    this.maxLines = options.maxLines ?? undefined;
    this.placeholder = options.placeholder ?? " [...]";
  }

  private splitChunks(text: string): string[] {
    text = mungeWhitespace(
      text,
      this.expandTabsFlag,
      this.tabSize,
      this.replaceWhitespace,
    );
    if (this.breakOnHyphens) {
      return splitWordsep(text);
    }
    return text
      .split(new RegExp(`(${_whitespaceClass}+)`, "u"))
      .filter((c) => c.length > 0);
  }

  private handleLongWord(
    reversedChunks: string[],
    curLine: string[],
    curLen: number,
    width: number,
  ): void {
    const spaceLeft = width < 1 ? 1 : width - curLen;

    if (this.breakLongWords) {
      let end = spaceLeft;
      const chunk = reversedChunks[reversedChunks.length - 1]!;
      if (this.breakOnHyphens && chunk.length > spaceLeft) {
        const hyphen = chunk.lastIndexOf("-", spaceLeft - 1);
        if (hyphen > 0 && [...chunk.slice(0, hyphen)].some((c) => c !== "-")) {
          end = hyphen + 1;
        }
      }
      curLine.push(chunk.slice(0, end));
      reversedChunks[reversedChunks.length - 1] = chunk.slice(end);
    } else if (curLine.length === 0) {
      curLine.push(reversedChunks.pop()!);
    }
  }

  private wrapChunks(chunks: string[]): string[] {
    const lines: string[] = [];
    if (this.width <= 0) {
      throw new Error(`invalid width ${this.width} (must be > 0)`);
    }
    if (this.maxLines !== undefined && this.maxLines !== null) {
      const indent =
        this.maxLines > 1 ? this.subsequentIndent : this.initialIndent;
      if (indent.length + this.placeholder.trimStart().length > this.width) {
        throw new Error("placeholder too large for max width");
      }
    }

    chunks = [...chunks].reverse();

    while (chunks.length > 0) {
      const curLine: string[] = [];
      let curLen = 0;
      const indent =
        lines.length > 0 ? this.subsequentIndent : this.initialIndent;
      const width = this.width - indent.length;

      if (
        this.dropWhitespace &&
        chunks[chunks.length - 1]!.trim() === "" &&
        lines.length > 0
      ) {
        chunks.pop();
      }

      while (chunks.length > 0) {
        const l = chunks[chunks.length - 1]!.length;
        if (curLen + l <= width) {
          curLine.push(chunks.pop()!);
          curLen += l;
        } else {
          break;
        }
      }

      if (chunks.length > 0 && chunks[chunks.length - 1]!.length > width) {
        this.handleLongWord(chunks, curLine, curLen, width);
        curLen = curLine.reduce((a, s) => a + s.length, 0);
      }

      if (
        this.dropWhitespace &&
        curLine.length > 0 &&
        curLine[curLine.length - 1]!.trim() === ""
      ) {
        curLen -= curLine[curLine.length - 1]!.length;
        curLine.pop();
      }

      if (curLine.length > 0) {
        const tailOk =
          (!chunks.length ||
            (this.dropWhitespace &&
              chunks.length === 1 &&
              chunks[0]!.trim() === "")) &&
          curLen <= width;
        if (
          this.maxLines === undefined ||
          this.maxLines === null ||
          lines.length + 1 < this.maxLines ||
          tailOk
        ) {
          lines.push(indent + curLine.join(""));
        } else {
          while (curLine.length > 0) {
            if (
              curLine[curLine.length - 1]!.trim() !== "" &&
              curLen + this.placeholder.length <= width
            ) {
              curLine.push(this.placeholder);
              lines.push(indent + curLine.join(""));
              break;
            }
            curLen -= curLine[curLine.length - 1]!.length;
            curLine.pop();
          }
          if (curLine.length === 0) {
            if (lines.length > 0) {
              const prevLine = lines[lines.length - 1]!.trimEnd();
              if (prevLine.length + this.placeholder.length <= this.width) {
                lines[lines.length - 1] = prevLine + this.placeholder;
                break;
              }
            }
            lines.push(indent + this.placeholder.trimStart());
            break;
          }
        }
      }
    }

    return lines;
  }

  wrap(text: string): string[] {
    const chunks = this.splitChunks(text);
    return this.wrapChunks(chunks);
  }

  fill(text: string): string {
    return this.wrap(text).join("\n");
  }
}

function wrap(s: string): string {
  s = s.trim();
  if (!s) return "";
  const tw = new TextWrapper(WIDTH);
  const parts: string[] = [];
  for (const para of s.split("\n\n")) {
    parts.push(tw.fill(para.trim()));
  }
  return parts.join("\n\n");
}

function bullets(items: string[]): string {
  const tw = new TextWrapper(WIDTH, "- ", "  ");
  const out: string[] = [];
  for (const x of items) {
    out.push(tw.fill(x));
  }
  return out.join("\n");
}

function readme(
  title: string,
  intro: string,
  prereq: string[],
  run: string,
): string {
  const body = [
    `# ${title}`,
    "",
    wrap(intro),
    "",
    "## Prerequisites",
    "",
    bullets(prereq),
    "",
    "## How to run",
    "",
    "```bash",
    run.replace(/\s+$/, ""),
    "```",
    "",
  ];
  return body.join("\n");
}

type ExampleSpec = {
  intro?: string;
  intro_go?: string;
  intro_py?: string;
  intro_ts?: string;
  prereq_go: string[];
  prereq_py: string[];
  prereq_ts: string[];
  run_go: string;
  run_py: string;
  run_ts: string;
};

const data: Record<string, ExampleSpec> = {
  "local-echo": {
    intro:
      "Creates a sandbox with the ``local`` provider (Docker on your machine), runs one ``echo`` command, then deletes the sandbox. This is the smallest end-to-end path: no cloud API key, only the Docker CLI talking to your container engine. Use it to confirm Sandboxer can provision and tear down workloads.",
    prereq_go: [
      "Go toolchain matching ``sdks/go/go.mod``.",
      "Docker installed and the daemon running; ``docker info`` must succeed.",
      "Commands below assume the ``examples/go`` module (``go.mod`` uses a ``replace`` to the SDK in this repo).",
    ],
    prereq_py: [
      "Python 3.10 or newer.",
      "Docker installed and the daemon running; ``docker info`` must succeed.",
      "The script prepends ``sdks/python/src`` to ``PYTHONPATH`` so you can run from a clone without installing ``hyperterse-sandboxer`` from PyPI.",
    ],
    prereq_ts: [
      "Node.js 18 or newer with ``npx``, or Bun to run TypeScript directly.",
      "Docker installed and the daemon running; ``docker info`` must succeed.",
      "The script imports the SDK from ``sdks/typescript/src``; build the SDK if you prefer importing from ``dist``.",
    ],
    run_go: "cd examples/go\ngo run ./local-echo",
    run_py:
      "PYTHONPATH=sdks/python/src python examples/python/local-echo/main.py",
    run_ts: "npx tsx examples/typescript/local-echo/index.ts",
  },
  "local-files": {
    intro:
      "Writes a small file inside the sandbox with ``WriteFile`` / ``write_file``, then reads it back with ``ReadFile`` / ``read_file``. Shows how binary-safe payloads move through the SDK on the local Docker backend.",
    prereq_go: [
      "Go toolchain matching ``sdks/go/go.mod``.",
      "Docker installed and the daemon running.",
      "Run from the ``examples/go`` module as described for ``local-echo``.",
    ],
    prereq_py: [
      "Python 3.10 or newer and Docker.",
      "Same ``PYTHONPATH`` pattern as other Python examples.",
    ],
    prereq_ts: [
      "Node.js 18 or newer (or Bun) and Docker.",
      "Same SDK import path as other TypeScript examples.",
    ],
    run_go: "cd examples/go\ngo run ./local-files",
    run_py:
      "PYTHONPATH=sdks/python/src python examples/python/local-files/main.py",
    run_ts: "npx tsx examples/typescript/local-files/index.ts",
  },
  "local-list-directory": {
    intro:
      "Lists directory entries under a path inside the container using ``ListDirectory`` / ``list_directory``. Useful when you build tools that inspect workspace outputs or cache directories.",
    prereq_go: ["Go toolchain and Docker; run from ``examples/go``."],
    prereq_py: [
      "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
    ],
    prereq_ts: ["Node.js 18 or newer (or Bun) and Docker."],
    run_go: "cd examples/go\ngo run ./local-list-directory",
    run_py:
      "PYTHONPATH=sdks/python/src python examples/python/local-list-directory/main.py",
    run_ts: "npx tsx examples/typescript/local-list-directory/index.ts",
  },
  "local-path-ops": {
    intro:
      "Creates a directory, checks that a path exists, and removes a path using ``MakeDir`` / ``make_dir``, ``Exists`` / ``exists``, and ``Remove`` / ``remove``. This mirrors common file tree setup before running commands.",
    prereq_go: ["Go toolchain and Docker; run from ``examples/go``."],
    prereq_py: [
      "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
    ],
    prereq_ts: ["Node.js 18 or newer (or Bun) and Docker."],
    run_go: "cd examples/go\ngo run ./local-path-ops",
    run_py:
      "PYTHONPATH=sdks/python/src python examples/python/local-path-ops/main.py",
    run_ts: "npx tsx examples/typescript/local-path-ops/index.ts",
  },
  "local-command-env": {
    intro:
      "Runs a command with ``Env`` / ``env`` on ``RunCommand`` / ``run_command`` (and optional sandbox env on create where the sample sets it). Shows how to pass environment variables into process execution inside the sandbox.",
    prereq_go: ["Go toolchain and Docker; run from ``examples/go``."],
    prereq_py: [
      "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
    ],
    prereq_ts: ["Node.js 18 or newer (or Bun) and Docker."],
    run_go: "cd examples/go\ngo run ./local-command-env",
    run_py:
      "PYTHONPATH=sdks/python/src python examples/python/local-command-env/main.py",
    run_ts: "npx tsx examples/typescript/local-command-env/index.ts",
  },
  "local-async-command": {
    intro:
      "Starts a command asynchronously with ``StartCommand`` / ``start_command``, then waits for completion with ``WaitForHandle`` / ``wait_for_handle``. Use this pattern for long-running tasks without blocking the initial API call.",
    prereq_go: ["Go toolchain and Docker; run from ``examples/go``."],
    prereq_py: [
      "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
    ],
    prereq_ts: ["Node.js 18 or newer (or Bun) and Docker."],
    run_go: "cd examples/go\ngo run ./local-async-command",
    run_py:
      "PYTHONPATH=sdks/python/src python examples/python/local-async-command/main.py",
    run_ts: "npx tsx examples/typescript/local-async-command/index.ts",
  },
  "local-sandbox-info": {
    intro:
      "Reads sandbox metadata from the create response and again via ``Info`` / ``info``. Helps you confirm identifiers and status while debugging lifecycle issues.",
    prereq_go: ["Go toolchain and Docker; run from ``examples/go``."],
    prereq_py: [
      "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
    ],
    prereq_ts: ["Node.js 18 or newer (or Bun) and Docker."],
    run_go: "cd examples/go\ngo run ./local-sandbox-info",
    run_py:
      "PYTHONPATH=sdks/python/src python examples/python/local-sandbox-info/main.py",
    run_ts: "npx tsx examples/typescript/local-sandbox-info/index.ts",
  },
  "local-process-list": {
    intro:
      "Calls ``ListProcesses`` / ``list_processes`` to inspect processes visible inside the container. Useful for debugging what is still running after you start background work.",
    prereq_go: ["Go toolchain and Docker; run from ``examples/go``."],
    prereq_py: [
      "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
    ],
    prereq_ts: ["Node.js 18 or newer (or Bun) and Docker."],
    run_go: "cd examples/go\ngo run ./local-process-list",
    run_py:
      "PYTHONPATH=sdks/python/src python examples/python/local-process-list/main.py",
    run_ts: "npx tsx examples/typescript/local-process-list/index.ts",
  },
  "local-process-kill": {
    intro:
      "Starts a long-running command, finds a process in the listing, and sends ``KillProcess`` / ``kill_process`` to stop it. Demonstrates process control when you cannot rely on the shell alone.",
    prereq_go: ["Go toolchain and Docker; run from ``examples/go``."],
    prereq_py: [
      "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
    ],
    prereq_ts: ["Node.js 18 or newer (or Bun) and Docker."],
    run_go: "cd examples/go\ngo run ./local-process-kill",
    run_py:
      "PYTHONPATH=sdks/python/src python examples/python/local-process-kill/main.py",
    run_ts: "npx tsx examples/typescript/local-process-kill/index.ts",
  },
  "local-pause-resume": {
    intro:
      "Pauses and resumes the container using ``Pause`` / ``pause`` and ``Resume`` / ``resume`` (Docker pause and unpause). Not every hosted provider supports this; the local driver maps it to ``docker pause`` and ``docker unpause``.",
    prereq_go: ["Go toolchain and Docker; run from ``examples/go``."],
    prereq_py: [
      "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
    ],
    prereq_ts: ["Node.js 18 or newer (or Bun) and Docker."],
    run_go: "cd examples/go\ngo run ./local-pause-resume",
    run_py:
      "PYTHONPATH=sdks/python/src python examples/python/local-pause-resume/main.py",
    run_ts: "npx tsx examples/typescript/local-pause-resume/index.ts",
  },
  "local-list-sandboxes": {
    intro:
      "Creates a sandbox, then calls ``ListSandboxes`` / ``list_sandboxes`` to list sandbox records the provider sees. On ``local``, containers are filtered by Sandboxer labels.",
    prereq_go: ["Go toolchain and Docker; run from ``examples/go``."],
    prereq_py: [
      "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
    ],
    prereq_ts: ["Node.js 18 or newer (or Bun) and Docker."],
    run_go: "cd examples/go\ngo run ./local-list-sandboxes",
    run_py:
      "PYTHONPATH=sdks/python/src python examples/python/local-list-sandboxes/main.py",
    run_ts: "npx tsx examples/typescript/local-list-sandboxes/index.ts",
  },
  "local-attach": {
    intro:
      "Creates a sandbox, then calls ``AttachSandbox`` / ``attach_sandbox`` with the same id to obtain a new handle. Use this when your process restarts but you still know the sandbox id.",
    prereq_go: ["Go toolchain and Docker; run from ``examples/go``."],
    prereq_py: [
      "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
    ],
    prereq_ts: ["Node.js 18 or newer (or Bun) and Docker."],
    run_go: "cd examples/go\ngo run ./local-attach",
    run_py:
      "PYTHONPATH=sdks/python/src python examples/python/local-attach/main.py",
    run_ts: "npx tsx examples/typescript/local-attach/index.ts",
  },
  "local-kill-by-id": {
    intro:
      "Creates a sandbox, then destroys it with ``KillSandbox`` / ``kill_sandbox`` on the client using the provider id without calling ``Kill`` on the handle first. Shows teardown when you only store the id string.",
    prereq_go: ["Go toolchain and Docker; run from ``examples/go``."],
    prereq_py: [
      "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
    ],
    prereq_ts: ["Node.js 18 or newer (or Bun) and Docker."],
    run_go: "cd examples/go\ngo run ./local-kill-by-id",
    run_py:
      "PYTHONPATH=sdks/python/src python examples/python/local-kill-by-id/main.py",
    run_ts: "npx tsx examples/typescript/local-kill-by-id/index.ts",
  },
  "local-create-options": {
    intro:
      "Passes optional create fields such as template image, metadata, and environment variables. Adjusts ``CreateSandboxRequest`` / ``createSandbox`` to show how you label and configure the machine before commands run.",
    prereq_go: ["Go toolchain and Docker; run from ``examples/go``."],
    prereq_py: [
      "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
    ],
    prereq_ts: ["Node.js 18 or newer (or Bun) and Docker."],
    run_go: "cd examples/go\ngo run ./local-create-options",
    run_py:
      "PYTHONPATH=sdks/python/src python examples/python/local-create-options/main.py",
    run_ts: "npx tsx examples/typescript/local-create-options/index.ts",
  },
  "local-port-url": {
    intro:
      "Calls ``PortURL`` / ``portUrl`` to resolve a preview or tunnel URL for a port inside the sandbox. The default local container does not publish host ports, so you often see ``ErrNotSupported`` or ``NotSupportedError`` until you map ports in your workflow.",
    prereq_go: ["Go toolchain and Docker; run from ``examples/go``."],
    prereq_py: [
      "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
    ],
    prereq_ts: ["Node.js 18 or newer (or Bun) and Docker."],
    run_go: "cd examples/go\ngo run ./local-port-url",
    run_py:
      "PYTHONPATH=sdks/python/src python examples/python/local-port-url/main.py",
    run_ts: "npx tsx examples/typescript/local-port-url/index.ts",
  },
  "e2b-echo": {
    intro:
      "Creates a sandbox on E2B and runs ``echo``. This is the smallest hosted flow: you need an E2B API key and network access to the E2B API.",
    prereq_go: [
      "Go toolchain; run from ``examples/go``.",
      "An E2B API key in ``E2B_API_KEY`` or ``SANDBOXER_API_KEY``.",
      "Optional ``E2B_API_BASE`` if you use a non-default API origin.",
    ],
    prereq_py: [
      "Python 3.10 or newer.",
      "An E2B API key in ``E2B_API_KEY`` (or ``SANDBOXER_API_KEY`` if your script mirrors other samples).",
      "Optional ``E2B_API_BASE``.",
    ],
    prereq_ts: [
      "Node.js 18 or newer (or Bun).",
      "An E2B API key in ``E2B_API_KEY`` or ``SANDBOXER_API_KEY``.",
      "Optional ``E2B_API_BASE``.",
    ],
    run_go:
      "export E2B_API_KEY=your_key_here\ncd examples/go\ngo run ./e2b-echo",
    run_py:
      "export E2B_API_KEY=your_key_here\nPYTHONPATH=sdks/python/src python examples/python/e2b-echo/main.py",
    run_ts:
      "export E2B_API_KEY=your_key_here\nnpx tsx examples/typescript/e2b-echo/index.ts",
  },
  "e2b-files": {
    intro:
      "Writes and reads a file in an E2B sandbox over the provider API. Compare with ``local-files`` to see the same file API on a hosted backend.",
    prereq_go: [
      "Go toolchain; run from ``examples/go``.",
      "``E2B_API_KEY`` or ``SANDBOXER_API_KEY``; optional ``E2B_API_BASE``.",
    ],
    prereq_py: [
      "Python 3.10 or newer; ``E2B_API_KEY``; optional ``E2B_API_BASE``.",
    ],
    prereq_ts: [
      "Node.js 18 or newer (or Bun); ``E2B_API_KEY``; optional ``E2B_API_BASE``.",
    ],
    run_go:
      "export E2B_API_KEY=your_key_here\ncd examples/go\ngo run ./e2b-files",
    run_py:
      "export E2B_API_KEY=your_key_here\nPYTHONPATH=sdks/python/src python examples/python/e2b-files/main.py",
    run_ts:
      "export E2B_API_KEY=your_key_here\nnpx tsx examples/typescript/e2b-files/index.ts",
  },
  "daytona-minimal": {
    intro:
      "Creates a Daytona sandbox and runs a short shell command. You need Daytona credentials and a base URL that match your workspace.",
    prereq_go: [
      "Go toolchain; run from ``examples/go``.",
      "``DAYTONA_API_KEY`` or ``DAYTONA_TOKEN`` or ``SANDBOXER_API_KEY``.",
      "Optional ``DAYTONA_API_BASE`` or ``DAYTONA_TOOLBOX_BASE_URL`` per your driver.",
    ],
    prereq_py: [
      "Python 3.10 or newer.",
      "Daytona token in ``DAYTONA_API_KEY`` or ``DAYTONA_TOKEN`` or ``SANDBOXER_API_KEY``.",
    ],
    prereq_ts: [
      "Node.js 18 or newer (or Bun).",
      "Daytona credentials as in the TypeScript sample (see source file).",
    ],
    run_go:
      "export DAYTONA_API_KEY=your_token_here\ncd examples/go\ngo run ./daytona-minimal",
    run_py:
      "export DAYTONA_API_KEY=your_token_here\nPYTHONPATH=sdks/python/src python examples/python/daytona-minimal/main.py",
    run_ts:
      "export DAYTONA_API_KEY=your_token_here\nnpx tsx examples/typescript/daytona-minimal/index.ts",
  },
  "runloop-minimal": {
    intro:
      "Creates a Runloop sandbox and runs ``echo``. Validates your Runloop API key and base URL configuration.",
    prereq_go: [
      "Go toolchain; run from ``examples/go``.",
      "``RUNLOOP_API_KEY`` or ``SANDBOXER_API_KEY``; optional ``RUNLOOP_API_BASE``.",
    ],
    prereq_py: [
      "Python 3.10 or newer; ``RUNLOOP_API_KEY``; optional ``RUNLOOP_API_BASE``.",
    ],
    prereq_ts: [
      "Node.js 18 or newer (or Bun); ``RUNLOOP_API_KEY``; optional base URL.",
    ],
    run_go:
      "export RUNLOOP_API_KEY=your_key_here\ncd examples/go\ngo run ./runloop-minimal",
    run_py:
      "export RUNLOOP_API_KEY=your_key_here\nPYTHONPATH=sdks/python/src python examples/python/runloop-minimal/main.py",
    run_ts:
      "export RUNLOOP_API_KEY=your_key_here\nnpx tsx examples/typescript/runloop-minimal/index.ts",
  },
  "blaxel-minimal": {
    intro:
      "Creates a Blaxel sandbox through the control plane (default ``https://api.blaxel.ai/v0``), prints its id, then deletes it. Uses the Blaxel API key as a Bearer token; optional workspace via ``BL_WORKSPACE`` / ``BLAXEL_WORKSPACE`` (Python: ``extra.workspace``). Pause, resume, and PTY are not supported by this provider.",
    prereq_go: [
      "Go toolchain; run from ``examples/go``.",
      "``BLAXEL_API_KEY``, ``BL_API_KEY``, or ``SANDBOXER_API_KEY``; optional ``BLAXEL_API_BASE``.",
      "Optional ``BL_WORKSPACE`` / ``BLAXEL_WORKSPACE`` for ``X-Blaxel-Workspace``.",
    ],
    prereq_py: [
      "Python 3.10 or newer.",
      "``BLAXEL_API_KEY``, ``BL_API_KEY``, or ``SANDBOXER_API_KEY``; optional ``BLAXEL_API_BASE``.",
      "Optional ``BL_WORKSPACE`` / ``BLAXEL_WORKSPACE``.",
    ],
    prereq_ts: [
      "Node.js 18 or newer (or Bun).",
      "``BLAXEL_API_KEY``, ``BL_API_KEY``, or ``SANDBOXER_API_KEY``; optional ``BLAXEL_API_BASE``.",
      "Optional ``BL_WORKSPACE`` / ``BLAXEL_WORKSPACE``.",
    ],
    run_go:
      "export BLAXEL_API_KEY=your_key_here\ncd examples/go\ngo run ./blaxel-minimal",
    run_py:
      "export BLAXEL_API_KEY=your_key_here\nPYTHONPATH=sdks/python/src python examples/python/blaxel-minimal/main.py",
    run_ts:
      "export BLAXEL_API_KEY=your_key_here\nnpx tsx examples/typescript/blaxel-minimal/index.ts",
  },
  "fly-machines-minimal": {
    intro_go:
      "Creates a Fly Machine in your app, runs a command over the driver exec path, then destroys the machine. Requires a Fly API token and app name.",
    intro_py:
      "Creates a Fly Machine sandbox, runs ``echo``, then destroys the machine. Requires ``FLY_API_TOKEN`` and an app name.",
    intro_ts:
      "Lists Fly Machines for your app using ``listSandboxes`` with a ``limit``. It does not create a sandbox in this TypeScript sample; compare with the Go and Python examples that provision a machine.",
    prereq_go: [
      "Go toolchain; run from ``examples/go``.",
      "``FLY_API_TOKEN`` or ``SANDBOXER_API_KEY``.",
      "``FLY_APP_NAME`` or ``SANDBOXER_FLY_APP``.",
      "Optional ``FLY_API_HOSTNAME`` and ``FLY_REGION`` for API routing.",
    ],
    prereq_py: [
      "Python 3.10 or newer.",
      "``FLY_API_TOKEN``; ``FLY_APP_NAME`` or ``SANDBOXER_FLY_APP``.",
      "Optional ``FLY_API_HOSTNAME`` (defaults in the driver).",
    ],
    prereq_ts: [
      "Node.js 18 or newer (or Bun).",
      "``FLY_API_TOKEN``; ``FLY_APP_NAME`` or ``SANDBOXER_FLY_APP``.",
      "This sample only lists machines; it does not create one.",
    ],
    run_go:
      "export FLY_API_TOKEN=your_token_here\nexport FLY_APP_NAME=your_app_here\ncd examples/go\ngo run ./fly-machines-minimal",
    run_py:
      "export FLY_API_TOKEN=your_token_here\nexport FLY_APP_NAME=your_app_here\nPYTHONPATH=sdks/python/src python examples/python/fly-machines-minimal/main.py",
    run_ts:
      "export FLY_API_TOKEN=your_token_here\nexport FLY_APP_NAME=your_app_here\nnpx tsx examples/typescript/fly-machines-minimal/index.ts",
  },
  "config-from-environment": {
    intro_go:
      "Creates an E2B sandbox using configuration read from the environment: ``E2B_API_KEY``, optional ``E2B_API_BASE``, and optional ``E2B_DEFAULT_TIMEOUT_MS`` for the HTTP client default timeout. Matches the spirit of the Python sample in this repository.",
    intro_py:
      "Builds an E2B client from ``E2B_API_KEY``, optional ``E2B_API_BASE``, and optional ``E2B_DEFAULT_TIMEOUT_MS`` for ``default_timeout_ms``, then creates a sandbox and runs ``echo``. This does not read ``SANDBOXER_PROVIDER``; it always uses E2B.",
    intro_ts:
      "Builds a ``Sandboxer`` from ``SANDBOXER_PROVIDER`` (default ``local``) plus optional ``SANDBOXER_API_KEY`` and ``SANDBOXER_BASE_URL``. Key and base URL fallbacks per provider are in ``index.ts``. This sample only calls ``listSandboxes``; it does not create a sandbox.",
    prereq_go: [
      "Go toolchain; run from ``examples/go``.",
      "``E2B_API_KEY`` set.",
      "Optional ``E2B_API_BASE`` and ``E2B_DEFAULT_TIMEOUT_MS``.",
    ],
    prereq_py: [
      "Python 3.10 or newer; ``E2B_API_KEY``.",
      "Optional ``E2B_API_BASE`` and ``E2B_DEFAULT_TIMEOUT_MS``.",
    ],
    prereq_ts: [
      "Node.js 18 or newer (or Bun).",
      "For ``local``, no API key. For ``e2b``, set ``E2B_API_KEY`` or ``SANDBOXER_API_KEY`` and optional ``E2B_API_BASE``.",
      "Other providers (Daytona, Runloop, Fly, Blaxel) need their respective keys as implemented in the source file.",
    ],
    run_go:
      "export E2B_API_KEY=your_key_here\ncd examples/go\ngo run ./config-from-environment",
    run_py:
      "export E2B_API_KEY=your_key_here\nPYTHONPATH=sdks/python/src python examples/python/config-from-environment/main.py",
    run_ts:
      "export SANDBOXER_PROVIDER=local\nnpx tsx examples/typescript/config-from-environment/index.ts",
  },
  "handle-unsupported": {
    intro:
      "Calls ``CreatePTY`` / ``create_pty`` on a local sandbox. The local Docker driver returns ``ErrNotSupported`` / ``NotSupportedError`` for PTY, so the sample shows how to branch on that error instead of crashing.",
    prereq_go: ["Go toolchain and Docker; run from ``examples/go``."],
    prereq_py: [
      "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
    ],
    prereq_ts: ["Node.js 18 or newer (or Bun) and Docker."],
    run_go: "cd examples/go\ngo run ./handle-unsupported",
    run_py:
      "PYTHONPATH=sdks/python/src python examples/python/handle-unsupported/main.py",
    run_ts: "npx tsx examples/typescript/handle-unsupported/index.ts",
  },
  "context-timeout": {
    intro:
      "Runs a command that would take longer than the allowed timeout (Go uses a short context deadline; Python and TypeScript use ``timeout_seconds`` / ``timeoutSeconds`` on the command). Shows how timeouts surface as errors.",
    prereq_go: ["Go toolchain and Docker; run from ``examples/go``."],
    prereq_py: [
      "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
    ],
    prereq_ts: ["Node.js 18 or newer (or Bun) and Docker."],
    run_go: "cd examples/go\ngo run ./context-timeout",
    run_py:
      "PYTHONPATH=sdks/python/src python examples/python/context-timeout/main.py",
    run_ts: "npx tsx examples/typescript/context-timeout/index.ts",
  },
  "e2b-pty": {
    intro:
      "Attempts to open a PTY session on E2B. Depending on the driver version, this may still return ``ErrNotSupported`` / ``NotSupportedError``; the sample prints a clear message when PTY is not wired for that backend.",
    prereq_go: [
      "Go toolchain; run from ``examples/go``.",
      "``E2B_API_KEY`` or ``SANDBOXER_API_KEY``; optional ``E2B_API_BASE``.",
    ],
    prereq_py: ["Python 3.10 or newer; ``E2B_API_KEY``."],
    prereq_ts: ["Node.js 18 or newer (or Bun); ``E2B_API_KEY``."],
    run_go:
      "export E2B_API_KEY=your_key_here\ncd examples/go\ngo run ./e2b-pty",
    run_py:
      "export E2B_API_KEY=your_key_here\nPYTHONPATH=sdks/python/src python examples/python/e2b-pty/main.py",
    run_ts:
      "export E2B_API_KEY=your_key_here\nnpx tsx examples/typescript/e2b-pty/index.ts",
  },
  "async-workflow": {
    intro_go:
      "Chains two asynchronous command steps via ``StartCommand`` and ``WaitForHandle`` on a local sandbox.",
    intro_py:
      "Uses ``AsyncSandboxer`` with the ``local`` provider to run commands with ``await`` on a local sandbox.",
    intro_ts:
      "Uses ``Promise.all`` and sequential ``await`` to run multiple commands in one script; demonstrates async orchestration in JavaScript.",
    prereq_go: ["Go toolchain and Docker; run from ``examples/go``."],
    prereq_py: [
      "Python 3.10 or newer and Docker.",
      "Requires async support for ``local`` in the Python SDK (see ``providers/local.py``).",
    ],
    prereq_ts: ["Node.js 18 or newer (or Bun) and Docker."],
    run_go: "cd examples/go\ngo run ./async-workflow",
    run_py:
      "PYTHONPATH=sdks/python/src python examples/python/async-workflow/main.py",
    run_ts: "npx tsx examples/typescript/async-workflow/index.ts",
  },
  "list-sandboxes-filter": {
    intro:
      "Calls ``ListSandboxes`` / ``list_sandboxes`` with a ``limit`` and optional metadata filter so you can narrow results when many sandboxes exist.",
    prereq_go: ["Go toolchain and Docker; run from ``examples/go``."],
    prereq_py: [
      "Python 3.10 or newer and Docker; ``PYTHONPATH`` as in other examples.",
    ],
    prereq_ts: ["Node.js 18 or newer (or Bun) and Docker."],
    run_go: "cd examples/go\ngo run ./list-sandboxes-filter",
    run_py:
      "PYTHONPATH=sdks/python/src python examples/python/list-sandboxes-filter/main.py",
    run_ts: "npx tsx examples/typescript/list-sandboxes-filter/index.ts",
  },
  "swap-provider-cli": {
    intro:
      "Selects a provider name from the first command-line argument (or defaults to ``local``), constructs a client, and calls ``list_sandboxes``. Use this to smoke-test credentials and provider wiring without creating a sandbox.",
    prereq_go: [
      "Go toolchain; run from ``examples/go``.",
      "Docker for ``local``; hosted providers need their API keys in the environment as required by each driver.",
    ],
    prereq_py: [
      "Python 3.10 or newer.",
      "Same environment expectations as the Go sample for the provider you pass on the command line.",
    ],
    prereq_ts: [
      "Node.js 18 or newer (or Bun).",
      "Provider-specific env vars when you pass a non-local provider name.",
    ],
    run_go:
      "cd examples/go\ngo run ./swap-provider-cli\n# optional: go run ./swap-provider-cli e2b",
    run_py:
      "PYTHONPATH=sdks/python/src python examples/python/swap-provider-cli/main.py\n# optional: same script with provider name as argv",
    run_ts:
      "npx tsx examples/typescript/swap-provider-cli/index.ts\n# optional: pass provider name as argv",
  },
};

async function main(): Promise<void> {
  const langs: [
    string,
    keyof ExampleSpec,
    keyof ExampleSpec,
    keyof ExampleSpec,
  ][] = [
    ["go", "prereq_go", "run_go", "intro_go"],
    ["python", "prereq_py", "run_py", "intro_py"],
    ["typescript", "prereq_ts", "run_ts", "intro_ts"],
  ];

  for (const [name, spec] of Object.entries(data)) {
    for (const [_lang, prereqKey, runKey, introKey] of langs) {
      const prereq = spec[prereqKey] as string[];
      const run = spec[runKey] as string;
      let intro = spec[introKey] as string | undefined;
      if (intro === undefined) intro = spec.intro;
      if (intro === undefined) {
        throw new Error(
          `${name} missing intro (${String(introKey)} or intro) for ${_lang}`,
        );
      }
      const path = join(EXAMPLES, _lang, name, "README.md");
      await Bun.write(path, readme(name, intro, prereq, run));
      console.log(`wrote ${relative(projectRoot, path)}`);
    }
  }
}

await main();
