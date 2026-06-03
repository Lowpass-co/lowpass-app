# Claude / agent environment notes

Archived 2026-06-03 so the **Google-Drive checkout can be deleted**. Everything
an agent needs to know that used to live only in the Drive folder (or in the
Drive-keyed auto-memory) now lives here, in version control.

## Canonical clone

Do all work in **`/Users/lowpass/Documents/lowpass-app`** and launch Claude Code
from there:

```
cd /Users/lowpass/Documents/lowpass-app
claude
```

### Background: the old dual-clone setup (now retired)

There used to be two checkouts of `github.com/Lowpass-co/lowpass-app.git`:

| Clone | Path | Notes |
|-------|------|-------|
| **Documents** (canonical) | `/Users/lowpass/Documents/lowpass-app` | where all sprint work actually happened |
| **Drive** (to be deleted) | `…/My Drive/Tour Management/Lowpass \|\| Master Folder/lowpass-app` | the harness opened this as cwd; on `design/ux-audit-2026`; a source of confusion |

When launched from the Drive folder, the shell cwd reset to the Drive path after
every Bash call, so commands had to `cd /Users/lowpass/Documents/lowpass-app`
first. Launching from the Documents clone removes that entirely. Once the Drive
checkout is deleted there is a single clone and none of this applies.

## `.claude/launch.json` (preview/dev configs)

Each clone keeps its own (gitignored) `.claude/launch.json`. The Drive copy held
two configs; the equivalents for the Documents clone are:

```jsonc
{
  "version": "0.0.1",
  "configurations": [
    { "name": "dev", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 3001, "autoPort": true },
    // 'stage-plot-dev' existed only to run the Documents clone's dev server
    // from the Drive clone. Launching directly from Documents, the plain
    // 'dev' config is all you need.
    { "name": "stage-plot-dev", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 3000, "autoPort": true }
  ]
}
```

## MCP servers (`.mcp.json`) — contains API keys, NOT committed

The Drive clone had a `.mcp.json` with two servers. It holds live API keys, so it
is **gitignored** (see `.gitignore`) and must never be committed. The file has
been copied into the Documents clone root; recreate it from your own keys if
needed:

```jsonc
{
  "mcpServers": {
    "stitch":         { "type": "http", "url": "https://stitch.googleapis.com/mcp",
                        "headers": { "X-Goog-Api-Key": "<YOUR_STITCH_KEY>" } },
    "nanobanana-mcp": { "command": "npx", "args": ["-y", "@ycse/nanobanana-mcp"],
                        "env": { "GOOGLE_AI_API_KEY": "<YOUR_GOOGLE_AI_KEY>" } }
  }
}
```

> If those keys were ever committed or shared, rotate them — treat the values
> that lived in the Drive `.mcp.json` as potentially exposed.

## `.claude/settings.local.json`

Per-clone, gitignored Claude permission allowlist. The Documents clone already
has its own; nothing to migrate. Not reproduced here (it's just a local
convenience allowlist, no secrets worth archiving).

## Archived auto-memory

The agent's project auto-memory (which was keyed to the Drive launch path and
would otherwise be orphaned) is preserved under
[`agent-memory/`](./agent-memory/MEMORY.md).
