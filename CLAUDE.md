# Claude GUI - Project Guide for Claude Code

This is an Electron + React application that wraps Claude Code CLI with a GUI interface.

## Architecture

### Main Process (`src/main/`)

- **index.ts**: App entry, creates BrowserWindow, registers IPC handlers
- **ptyManager.ts**: Manages PTY processes via node-pty, handles input/output
- **claudeSessionWatcher.ts**: Watches `.claude/session/*.jsonl` files for token usage data
- **ipcHandlers.ts**: Bridges renderer ↔ main process communication
- **settingsStore.ts**: Persists settings via electron-store
- **historyStore.ts**: Manages session history
- **mcpManager.ts**: MCP server configuration
- **pluginManager.ts**: Claude HUD plugin management

### Renderer Process (`src/renderer/`)

- **App.tsx**: Root component, bootstrap logic
- **store/sessionStore.ts**: Main session state (Zustand)
- **store/tokenUsageStore.ts**: Token tracking per session
- **components/terminal/XTerminal.tsx**: xterm.js terminal wrapper
- **components/sidebar/**: Sidebar panels (Files, History, Commands, Settings, Stats, etc.)
- **i18n/**: Multi-language support (zh/en)

### Key Patterns

- State management: Zustand stores (`useSessionStore`, `useTokenUsageStore`)
- IPC: `window.electronAPI.*` exposed via preload
- Terminal: xterm.js + node-pty, selection copy with `Ctrl+Shift+C`
- File refs: Drag file → `@path/to/file` format via `claudeRef.ts`

## Development Commands

```bash
npm run dev        # Start dev server with HMR
npm run build      # Build for production
npm run rebuild    # Rebuild node-pty native module
npm run build:root-exe  # Build portable exe (Windows)
```

## Important Files

- `.githooks/post-commit`: Auto-builds portable exe on commit
- `electron-builder.yml`: Build configuration
- `.claude/settings.json`: Claude Code permissions for this project

## Code Style Notes

- No JSDoc comments unless WHY is non-obvious
- Use `// [YYYY-MM-DD]` date stamps for significant changes
- Zustand stores: single file per domain
- React components: functional with hooks
- Avoid `as any` - prefer proper type assertions

## Common Tasks

### Adding a new sidebar panel

1. Create component in `src/renderer/src/components/sidebar/`
2. Add icon component following existing patterns
3. Register in `Sidebar.tsx` tab config
4. Add i18n keys in `src/renderer/src/i18n/zh.ts` and `en.ts`

### Adding IPC handler

1. Define type in `src/renderer/src/types/ipc.ts`
2. Add handler in `src/main/ipcHandlers.ts`
3. Expose in `src/preload/index.ts`
4. Add mock in `src/renderer/src/electronMock.ts` (for browser preview)

### Terminal keyboard shortcuts

Add listener in `XTerminal.tsx` useEffect, intercept in capture phase:
```typescript
term.textarea.addEventListener('keydown', handler, true)
```
Remember to cleanup in return function.

## File Placement Rules

Any new file written by the main process must go into one of these four zones. Never create ad-hoc paths outside them.

### Zone 1 — `getConfigDir()` · App persistent data

```
Packaged Windows : %LOCALAPPDATA%\feng-claude\
Dev / others     : app.getPath('userData')   (AppData\Roaming\Feng Claude in dev)
```

Put here: anything the app owns and persists across sessions.

| File / dir | Owner |
|---|---|
| `claude-settings.json` | electron-store (settings + profiles) |
| `history.json` | electron-store (session history) |
| `token-data.json` | tokenDataStore |
| `scrollback/<sessionId>.bin` | PTY scrollback buffer |
| `kv/<key>.json` | kvStore |

### Zone 2 — `app.getPath('userData')` · Runtime-copied binaries & browser state

```
AppData\Roaming\Feng Claude\   (same as getConfigDir in dev; different in packaged Windows)
```

Put here: files copied/downloaded at runtime that do NOT need to survive a clean reinstall on Windows (since `%LOCALAPPDATA%\feng-claude` is the durable store there).

| File | Source / note |
|---|---|
| `browser-mcp-server.js` | Copied from `scripts/` by mcpManager on startup |
| `visual-agent-mcp-server.js` | Copied from `scripts/` by mcpManager on startup |
| `browser-state.json` | BrowserView navigation state |
| `browser-history.json` | BrowserView URL history |
| `officecli-<arch>[.exe]` | Downloaded by officeCliManager |
| `officecli-version.txt` | Installed version tag |

### Zone 3 — `~/.claude/` · Claude Code CLI territory

```
homedir() + '/.claude/'
```

Put here: anything the Claude CLI reads, or that follows the official `~/.claude` convention (so users find it where docs say).

| Path | What |
|---|---|
| `.claude.json` | MCP server registrations (user scope) — **only mcpManager writes this** |
| `settings.json` | Claude CLI permissions / hooks — written by claudeSessionConfigDir |
| `channels/<stateDirId>/` | Telegram bot state dir (bot.pid, access.json, etc.) |
| `channels/_feng_nonchannel_<sessionId>/` | Isolated non-Telegram sessions (prevent plugin fallback collision) |
| `session/*.jsonl` | Session transcripts written by Claude CLI (read-only for us) |

`stateDirId` comes from the bot preset's `stateDirId` field (defaults to `"telegram"`). Always go through `telegramStateDir(id)` in `ptyManager.ts` — never construct this path manually.

### Zone 4 — `<workdir>/.claude/` · Project-scoped data

Put here: data that belongs to a specific project repo and should live alongside it.

| Path | What |
|---|---|
| `browser-routines/*.json` | Recorded browser routines — always under the active session's workdir |

Always go through `routinesDir(workdir)` in `browserRoutineManager.ts`.

### Source-only (not runtime paths)

| Path | What |
|---|---|
| `scripts/browser-mcp-server.js` | MCP server source — copied to Zone 2 at runtime |
| `scripts/visual-agent-mcp-server.js` | MCP server source — copied to Zone 2 at runtime |
| `scripts/pty-daemon.js` | Daemon process source |
| `local/claude.local.json` | Dev-only local overrides (gitignored) |

### Rule of thumb

- New **feature data** → Zone 1 via `getConfigDir()`
- New **runtime binary / downloaded asset** → Zone 2 via `app.getPath('userData')`
- New **Claude CLI integration file** → Zone 3 under `~/.claude/`
- New **per-project file** → Zone 4 under `<workdir>/.claude/`
- Never use a raw `__dirname`, `process.cwd()`, or hardcoded `AppData` path — always go through the zone helpers.

## Version Release Process

When `package.json` version changes:

1. Update `CHANGELOG.md` — add new section with `[version] - date` and list all changes since last version
2. Update `RELEASES.md` — add release notes block for the new version (this file is the source for GitHub releases)
3. Update `README.md` — update the version number in the "vX.Y.Z 主要更新" / "vX.Y.Z Highlights" sections (both 中文 and English) to reflect the new version and summarize the key changes in this release
4. Copy the new version block from `RELEASES.md` into the GitHub Release body