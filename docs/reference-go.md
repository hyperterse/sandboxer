# Go API reference

Import **`github.com/hyperterse/sandboxer/sdks/go`**. The implementation lives
in [`sdks/go/core/`](../sdks/go/core/). Add a blank import of
**`github.com/hyperterse/sandboxer/sdks/go/providers`** so each backend
registers when the process starts.

You pick a **provider** (for example local Docker or a hosted sandbox API). The
client talks to that host directly. There is no separate Sandboxer server in the
request path.

```go
import (
    "github.com/hyperterse/sandboxer/sdks/go"
    _ "github.com/hyperterse/sandboxer/sdks/go/providers"
)
```

The sections below mirror the library: **provider** → **sandbox** (lifecycle,
commands, files, PTY) → **package-level helpers**. Each API below includes a
short summary, parameters, an example, and source links.

**Provider** — [ListSandboxes](#go-provider-listsandboxes) · [CreateSandbox](#go-provider-createsandbox) · [AttachSandbox](#go-provider-attachsandbox) · [KillSandbox](#go-provider-killsandbox) · [Close](#go-provider-close)

**Sandbox — lifecycle** — [ID](#go-sandbox-id) · [Info](#go-sandbox-info) · [IsRunning](#go-sandbox-isrunning) · [Pause](#go-sandbox-pause) · [Resume](#go-sandbox-resume) · [Kill](#go-sandbox-kill) · [PortURL](#go-sandbox-porturl)

**Sandbox — commands** — [RunCommand](#go-sandbox-runcommand) · [StartCommand](#go-sandbox-startcommand) · [WaitForHandle](#go-sandbox-waitforhandle) · [KillProcess](#go-sandbox-killprocess) · [ListProcesses](#go-sandbox-listprocesses)

**Sandbox — filesystem** — [ReadFile](#go-sandbox-readfile) · [WriteFile](#go-sandbox-writefile) · [ListDirectory](#go-sandbox-listdirectory) · [MakeDir](#go-sandbox-makedir) · [Remove](#go-sandbox-remove) · [Exists](#go-sandbox-exists)

**Sandbox — PTY** — [CreatePTY](#go-sandbox-createpty) · [ResizePTY](#go-sandbox-resizepty) · [KillPTY](#go-sandbox-killpty) · [ListPTY](#go-sandbox-listpty)

**Package helpers** — [ConnectSandbox](#go-pkg-connectsandbox) · [RunCommand](#go-pkg-runcommand) · [ReadFile](#go-pkg-readfile) · [WriteFile](#go-pkg-writefile) · [CreatePTY](#go-pkg-createpty)

**More** — [Configuration](#configuration) · [Providers](#providers) · [Errors](#errors)

---

## Provider

Types: [`Provider`](../sdks/go/core/provider.go), [`CreateSandboxRequest`](../sdks/go/core/sandbox.go), [`ListSandboxesFilter`](../sdks/go/core/catalog.go).

<h3 id="go-provider-listsandboxes"><code>ListSandboxes</code></h3>

**Description.** Returns sandbox metadata visible to this provider / credential.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |
| `filter` | [`ListSandboxesFilter`](../sdks/go/core/catalog.go) | yes | `Provider`, `MetadataFilter`, `Limit` (use zero values when unused). |

**Example.**

```go
list, err := p.ListSandboxes(ctx, sandboxer.ListSandboxesFilter{Limit: 50})
```

**References**

| Reference |
|-----------|
| [`core/provider.go`](../sdks/go/core/provider.go) |
| [`core/catalog.go`](../sdks/go/core/catalog.go) (filter struct) |

---

<h3 id="go-provider-createsandbox"><code>CreateSandbox</code></h3>

**Description.** Provisions and starts a sandbox; returns a live [`Sandbox`](../sdks/go/core/sandbox.go) handle plus [`SandboxInfo`](../sdks/go/core/sandbox.go).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |
| `req` | [`CreateSandboxRequest`](../sdks/go/core/sandbox.go) | yes | `Provider` (required), optional `Template`, `TimeoutSeconds`, `Metadata`, `Envs`, `CPUs`, `MemoryMb`, `AutoDestroy`. |

**Example.**

```go
sb, info, err := p.CreateSandbox(ctx, sandboxer.CreateSandboxRequest{
    Provider: sandboxer.ProviderLocal,
    TimeoutSeconds: sandboxer.Ptr(600),
})
defer sb.Kill(ctx)
```

**References**

| Reference |
|-----------|
| [`core/provider.go`](../sdks/go/core/provider.go) |
| [`core/sandbox.go`](../sdks/go/core/sandbox.go) |

---

<h3 id="go-provider-attachsandbox"><code>AttachSandbox</code></h3>

**Description.** Reconnects to an existing sandbox by provider id.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |
| `sandboxID` | `string` | yes | Id from the provider or prior `SandboxInfo`. |

**Example.**

```go
sb, err := p.AttachSandbox(ctx, info.ID)
```

**References**

| Reference |
|-----------|
| [`core/provider.go`](../sdks/go/core/provider.go) |

---

<h3 id="go-provider-killsandbox"><code>KillSandbox</code></h3>

**Description.** Destroys a sandbox by id without holding a `Sandbox` handle.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |
| `sandboxID` | `string` | yes | Target sandbox id. |

**Example.**

```go
if err := p.KillSandbox(ctx, sid); err != nil { ... }
```

**References**

| Reference |
|-----------|
| [`core/provider.go`](../sdks/go/core/provider.go) |

---

<h3 id="go-provider-close"><code>Close</code></h3>

**Description.** Releases provider-held HTTP clients, watchers, or other resources.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| *(none)* | | | |

**Example.**

```go
defer p.Close()
```

**References**

| Reference |
|-----------|
| [`core/provider.go`](../sdks/go/core/provider.go) |

---

## Sandbox

See [`Sandbox`](../sdks/go/core/sandbox.go). Request types: [`RunCommandRequest`](../sdks/go/core/command.go), [`StartCommandRequest`](../sdks/go/core/command.go), [`CreatePTYRequest`](../sdks/go/core/pty.go).

<h3 id="go-sandbox-id"><code>ID</code></h3>

**Description.** Stable identifier for this sandbox session.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| *(none)* | | | |

**Example.**

```go
id := sb.ID()
```

**References**

| Reference |
|-----------|
| [`core/sandbox.go`](../sdks/go/core/sandbox.go) |

---

<h3 id="go-sandbox-info"><code>Info</code></h3>

**Description.** Fetches current metadata and status from the provider.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |

**Example.**

```go
info, err := sb.Info(ctx)
```

**References**

| Reference |
|-----------|
| [`core/sandbox.go`](../sdks/go/core/sandbox.go) |

---

<h3 id="go-sandbox-isrunning"><code>IsRunning</code></h3>

**Description.** Whether the sandbox is in a running state.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |

**Example.**

```go
ok, err := sb.IsRunning(ctx)
```

**References**

| Reference |
|-----------|
| [`core/sandbox.go`](../sdks/go/core/sandbox.go) |

---

<h3 id="go-sandbox-pause"><code>Pause</code></h3>

**Description.** Pauses execution when the backend supports it (`ErrNotSupported` otherwise).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |

**Example.**

```go
err := sb.Pause(ctx)
```

**References**

| Reference |
|-----------|
| [`core/sandbox.go`](../sdks/go/core/sandbox.go) |

---

<h3 id="go-sandbox-resume"><code>Resume</code></h3>

**Description.** Resumes a paused sandbox when supported.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |

**Example.**

```go
err := sb.Resume(ctx)
```

**References**

| Reference |
|-----------|
| [`core/sandbox.go`](../sdks/go/core/sandbox.go) |

---

<h3 id="go-sandbox-kill"><code>Kill</code></h3>

**Description.** Terminates this sandbox from the handle you hold.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |

**Example.**

```go
defer sb.Kill(ctx)
```

**References**

| Reference |
|-----------|
| [`core/sandbox.go`](../sdks/go/core/sandbox.go) |

---

<h3 id="go-sandbox-porturl"><code>PortURL</code></h3>

**Description.** Returns a URL that reaches `port` inside the sandbox when tunneling / preview URLs exist.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |
| `port` | `int` | yes | Exposed port number. |

**Example.**

```go
u, err := sb.PortURL(ctx, 8080)
```

**References**

| Reference |
|-----------|
| [`core/sandbox.go`](../sdks/go/core/sandbox.go) |

---

<h3 id="go-sandbox-runcommand"><code>RunCommand</code></h3>

**Description.** Runs a shell command synchronously; blocks until exit.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |
| `req` | [`RunCommandRequest`](../sdks/go/core/command.go) | yes | `Cmd` required; optional `Cwd`, `Env`, `TimeoutSeconds`, `User`. |

**Example.**

```go
res, err := sb.RunCommand(ctx, sandboxer.RunCommandRequest{
    Cmd: "npm test",
    TimeoutSeconds: sandboxer.Ptr(120),
})
fmt.Println(res.ExitCode, res.Stdout)
```

**References**

| Reference |
|-----------|
| [`core/sandbox.go`](../sdks/go/core/sandbox.go) |
| [`core/command.go`](../sdks/go/core/command.go) |

---

<h3 id="go-sandbox-startcommand"><code>StartCommand</code></h3>

**Description.** Starts a command asynchronously; returns OS pid and provider handle id for `WaitForHandle`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |
| `req` | [`StartCommandRequest`](../sdks/go/core/command.go) | yes | `Cmd` required; optional `Cwd`, `Env`, `User`. |

**Example.**

```go
pid, handle, err := sb.StartCommand(ctx, sandboxer.StartCommandRequest{Cmd: "sleep 30"})
res, err := sb.WaitForHandle(ctx, handle)
```

**References**

| Reference |
|-----------|
| [`core/sandbox.go`](../sdks/go/core/sandbox.go) |

---

<h3 id="go-sandbox-waitforhandle"><code>WaitForHandle</code></h3>

**Description.** Blocks until an async command identified by `handleID` completes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |
| `handleID` | `string` | yes | Handle from `StartCommand`. |

**Example.**

```go
res, err := sb.WaitForHandle(ctx, handle)
```

**References**

| Reference |
|-----------|
| [`core/sandbox.go`](../sdks/go/core/sandbox.go) |

---

<h3 id="go-sandbox-killprocess"><code>KillProcess</code></h3>

**Description.** Sends SIGKILL (or equivalent) to a process inside the sandbox.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |
| `pid` | `int` | yes | Process id in the guest. |

**Example.**

```go
err := sb.KillProcess(ctx, pid)
```

**References**

| Reference |
|-----------|
| [`core/sandbox.go`](../sdks/go/core/sandbox.go) |

---

<h3 id="go-sandbox-listprocesses"><code>ListProcesses</code></h3>

**Description.** Lists processes the provider exposes for this sandbox.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |

**Example.**

```go
procs, err := sb.ListProcesses(ctx)
```

**References**

| Reference |
|-----------|
| [`core/sandbox.go`](../sdks/go/core/sandbox.go) |

---

<h3 id="go-sandbox-readfile"><code>ReadFile</code></h3>

**Description.** Reads a file as raw bytes (no base64 layer unlike HTTP SDKs).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |
| `path` | `string` | yes | Absolute guest path. |

**Example.**

```go
b, err := sb.ReadFile(ctx, "/etc/hostname")
```

**References**

| Reference |
|-----------|
| [`core/sandbox.go`](../sdks/go/core/sandbox.go) |

---

<h3 id="go-sandbox-writefile"><code>WriteFile</code></h3>

**Description.** Writes bytes to a path, optionally with unix `mode` and `user`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |
| `path` | `string` | yes | Destination path. |
| `content` | `[]byte` | yes | File bytes. |
| `mode` | `*int` | no | Unix mode bits when supported. |
| `user` | `*string` | no | File owner hint when supported. |

**Example.**

```go
err := sb.WriteFile(ctx, "note.txt", []byte("hello"), nil, nil)
```

**References**

| Reference |
|-----------|
| [`core/sandbox.go`](../sdks/go/core/sandbox.go) |

---

<h3 id="go-sandbox-listdirectory"><code>ListDirectory</code></h3>

**Description.** Lists directory entries with metadata.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |
| `path` | `string` | yes | Directory path. |

**Example.**

```go
entries, err := sb.ListDirectory(ctx, "/app")
```

**References**

| Reference |
|-----------|
| [`core/sandbox.go`](../sdks/go/core/sandbox.go) |

---

<h3 id="go-sandbox-makedir"><code>MakeDir</code></h3>

**Description.** Creates a directory (and parents if the provider allows).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |
| `path` | `string` | yes | Directory path. |

**Example.**

```go
err := sb.MakeDir(ctx, "/tmp/work")
```

**References**

| Reference |
|-----------|
| [`core/sandbox.go`](../sdks/go/core/sandbox.go) |

---

<h3 id="go-sandbox-remove"><code>Remove</code></h3>

**Description.** Deletes a file or empty/non-empty tree per provider rules.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |
| `path` | `string` | yes | Path to remove. |

**Example.**

```go
err := sb.Remove(ctx, "/tmp/old")
```

**References**

| Reference |
|-----------|
| [`core/sandbox.go`](../sdks/go/core/sandbox.go) |

---

<h3 id="go-sandbox-exists"><code>Exists</code></h3>

**Description.** Returns whether the path exists in the guest filesystem.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |
| `path` | `string` | yes | Path to test. |

**Example.**

```go
ok, err := sb.Exists(ctx, "/app/package.json")
```

**References**

| Reference |
|-----------|
| [`core/sandbox.go`](../sdks/go/core/sandbox.go) |

---

<h3 id="go-sandbox-createpty"><code>CreatePTY</code></h3>

**Description.** Allocates an interactive PTY session; optional initial `Command` and geometry.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |
| `req` | [`CreatePTYRequest`](../sdks/go/core/pty.go) | yes | Optional `Rows`, `Cols`, `Cwd`, `Env`, `User`, `Command`. |

**Example.**

```go
pty, err := sb.CreatePTY(ctx, sandboxer.CreatePTYRequest{
    Rows: sandboxer.Ptr(24), Cols: sandboxer.Ptr(80),
})
```

**References**

| Reference |
|-----------|
| [`core/sandbox.go`](../sdks/go/core/sandbox.go) |
| [`core/pty.go`](../sdks/go/core/pty.go) |

---

<h3 id="go-sandbox-resizepty"><code>ResizePTY</code></h3>

**Description.** Updates terminal rows/columns for an existing PTY.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |
| `pid` | `int` | yes | PTY pid from `CreatePTY` / `ListPTY`. |
| `rows`, `cols` | `int` | yes | New geometry. |

**Example.**

```go
err := sb.ResizePTY(ctx, pty.Pid, 30, 100)
```

**References**

| Reference |
|-----------|
| [`core/sandbox.go`](../sdks/go/core/sandbox.go) |

---

<h3 id="go-sandbox-killpty"><code>KillPTY</code></h3>

**Description.** Closes the PTY session identified by `pid`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |
| `pid` | `int` | yes | PTY process id. |

**Example.**

```go
err := sb.KillPTY(ctx, pty.Pid)
```

**References**

| Reference |
|-----------|
| [`core/sandbox.go`](../sdks/go/core/sandbox.go) |

---

<h3 id="go-sandbox-listpty"><code>ListPTY</code></h3>

**Description.** Enumerates active PTY sessions for this sandbox.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |

**Example.**

```go
list, err := sb.ListPTY(ctx)
```

**References**

| Reference |
|-----------|
| [`core/sandbox.go`](../sdks/go/core/sandbox.go) |

---

## Package-level helpers

[`sandboxer.go`](../sdks/go/sandboxer.go) — thin wrappers over a [`Sandbox`](../sdks/go/core/sandbox.go).

<h3 id="go-pkg-connectsandbox"><code>ConnectSandbox</code></h3>

**Description.** Attaches to an existing sandbox by id; same as
`Provider.AttachSandbox`, exposed as a package-level helper for shorter call
sites.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |
| `p` | [`Provider`](../sdks/go/core/provider.go) | yes | Backend instance. |
| `sandboxID` | `string` | yes | Existing sandbox id. |

**Example.**

```go
sb, err := sandboxer.ConnectSandbox(ctx, p, id)
```

**References**

| Reference |
|-----------|
| [`sandboxer.go`](../sdks/go/sandboxer.go) |
| [`core/sandbox.go`](../sdks/go/core/sandbox.go) |

---

<h3 id="go-pkg-runcommand"><code>RunCommand</code> (package)</h3>

**Description.** Delegates to `s.RunCommand(ctx, req)`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |
| `s` | [`Sandbox`](../sdks/go/core/sandbox.go) | yes | Target sandbox. |
| `req` | [`RunCommandRequest`](../sdks/go/core/command.go) | yes | Command spec. |

**Example.**

```go
res, err := sandboxer.RunCommand(ctx, sb, sandboxer.RunCommandRequest{Cmd: "whoami"})
```

**References**

| Reference |
|-----------|
| [`sandboxer.go`](../sdks/go/sandboxer.go) |
| [`core/command.go`](../sdks/go/core/command.go) |

---

<h3 id="go-pkg-readfile"><code>ReadFile</code> (package)</h3>

**Description.** Delegates to `s.ReadFile(ctx, path)`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |
| `s` | [`Sandbox`](../sdks/go/core/sandbox.go) | yes | Target sandbox. |
| `path` | `string` | yes | Guest path. |

**Example.**

```go
b, err := sandboxer.ReadFile(ctx, sb, "/tmp/log.txt")
```

**References**

| Reference |
|-----------|
| [`sandboxer.go`](../sdks/go/sandboxer.go) |

---

<h3 id="go-pkg-writefile"><code>WriteFile</code> (package)</h3>

**Description.** Delegates to `s.WriteFile`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |
| `s` | [`Sandbox`](../sdks/go/core/sandbox.go) | yes | Target sandbox. |
| `path` | `string` | yes | Guest path. |
| `content` | `[]byte` | yes | Bytes to write. |
| `mode` | `*int` | no | Unix mode. |
| `user` | `*string` | no | Owner hint. |

**Example.**

```go
err := sandboxer.WriteFile(ctx, sb, "f.txt", []byte("x"), nil, nil)
```

**References**

| Reference |
|-----------|
| [`sandboxer.go`](../sdks/go/sandboxer.go) |

---

<h3 id="go-pkg-createpty"><code>CreatePTY</code> (package)</h3>

**Description.** Delegates to `s.CreatePTY(ctx, req)`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ctx` | `context.Context` | yes | Cancel and timeout handling. |
| `s` | [`Sandbox`](../sdks/go/core/sandbox.go) | yes | Target sandbox. |
| `req` | [`CreatePTYRequest`](../sdks/go/core/pty.go) | yes | PTY options. |

**Example.**

```go
info, err := sandboxer.CreatePTY(ctx, sb, sandboxer.CreatePTYRequest{})
```

**References**

| Reference |
|-----------|
| [`sandboxer.go`](../sdks/go/sandboxer.go) |
| [`core/pty.go`](../sdks/go/core/pty.go) |

---

## Configuration

[`sandboxer.Config`](../sdks/go/core/config.go) and environment variables such
as **`SANDBOXER_PROVIDER`**, **`SANDBOXER_API_KEY`**, **`SANDBOXER_BASE_URL`**,
**`SANDBOXER_DEFAULT_TIMEOUT`**, plus optional TLS and OAuth settings. These
apply to this **Go** module only. Your application’s README or deployment guide
should document the values you set in production.

## Providers

Built-in names include **`ProviderLocal`**, **`ProviderE2B`**, **`ProviderDaytona`**, **`ProviderRunloop`**, **`ProviderFlyMachines`**, **`ProviderBlaxel`**. Map strings with [`ParseProviderName`](../sdks/go/sandboxer.go). **Local** expects **`docker`** on your **`PATH`**.

## Errors

Sentinel errors in [`core/errors.go`](../sdks/go/core/errors.go), including **`ErrNotFound`**, **`ErrUnauthorized`**, **`ErrNotSupported`**, and related values—use **`errors.Is` / `errors.As`** as usual.
