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