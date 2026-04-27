# Claude GUI

A third-party GUI wrapper for [Claude Code CLI](https://github.com/anthropics/claude-code) built with Electron + React.

## Features

- **Terminal Integration**: Full xterm.js terminal with PTY backend, supporting split panes and multi-session management
- **File Tree**: Browse project files with drag-and-drop support for creating `@` references
- **History**: Session history with labels, quick restore, and search
- **Slash Commands**: Manage custom commands from `~/.claude/commands/`
- **Token Usage**: Real-time token tracking with daily/weekly statistics, 300-level progression system
- **MCP Panel**: Monitor connected MCP servers
- **Skills Panel**: Manage Claude Code skills/slash commands
- **Plugins**: Install and manage Claude HUD plugins
- **Multi-language**: Chinese / English support
- **Workspace Persistence**: Save and restore terminal layouts across sessions
- **Pet System**: Interactive ASCII pet with diverse idle activities, petting interaction, and content library
- **Split Worktree**: Create git worktree in split pane for parallel development
- **Merge Reminder**: Visual reminder when multiple worktrees exist

## Pet System

The pet (named "Bit" by default) displays in the sidebar and features:

- **Idle Activities**: 13 different activities (look, blink, sleep, play, curious, yawn, stretch, hungry, sneeze, groom, wiggle, tilt, doze, walk)
- **Weighted Random Selection**: Natural activity transitions with cooldown rules
- **Petting Interaction**: Click the pet to trigger happy animation and random responses
- **Walking Animation**: Horizontal movement with boundary bounce-back
- **Content Library**: Preset jokes, tips, news, and chitchat; daily API updates; used items are removed
- **Auto-trigger**: 8% probability during idle cycles
- **Token Tracking**: Pet API calls are counted in global token usage

## Split Worktree

When working in a git repository, a worktree button appears in the pane header:

- Create a new git worktree with existing or new branch
- Opens the worktree in a split pane for parallel development
- Visual reminder when multiple worktrees exist (merge reminder)

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+C` | Copy terminal selection |
| `Ctrl+C` | Send SIGINT (interrupt) |
| `Ctrl+V` | Paste text |
| `Alt+←/→` | Navigate between terminal panes |
| `Ctrl+Tab` | Switch sessions |

## Installation

### Prerequisites

- Node.js 18+
- Claude Code CLI installed (`npm install -g @anthropics/claude-code`)

### Development

```bash
# Install dependencies
npm install

# Rebuild native modules (node-pty)
npm run rebuild

# Start development server
npm run dev
```

### Build

```bash
# Build for current platform
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux

# Build portable executable (Windows only)
npm run build:root-exe
```

## Project Structure

```
claude-gui/
├── src/
│   ├── main/           # Electron main process
│   │   ├── index.ts         # App entry point
│   │   ├── ptyManager.ts    # PTY process management
│   │   ├── ipcHandlers.ts   # IPC communication
│   │   ├── settingsStore.ts # Settings persistence
│   │   └── historyStore.ts  # Session history
│   ├── renderer/       # React frontend
│   │   ├── components/      # UI components
│   │   │   ├── sidebar/     # Sidebar panels (PetWidget, TokenUsage, etc.)
│   │   │   └── terminal/    # Terminal components (WorktreeDialog, etc.)
│   │   ├── store/           # Zustand state stores
│   │   │   ├── petStore.ts        # Pet configuration and history
│   │   │   ├── contentBankStore.ts # Content library for pet
│   │   │   └── globalTokenStore.ts # Token usage tracking
│   │   ├── hooks/           # React hooks
│   │   ├── lib/             # Utilities (contentPresets.ts)
│   │   └── i18n/            # Localization
│   └── preload/        # Preload scripts
├── resources/          # App resources
├── .githooks/          # Git hooks
│   └── post-commit     # Auto-build portable exe
└── scripts/            # Build scripts
```

## Configuration

Settings are stored in `%APPDATA%/claude-gui/claude-settings.json`:

```json
{
  "authToken": "your-anthropic-api-key",
  "theme": "dark",
  "language": "zh",
  "model": "claude-sonnet-4-6"
}
```

## Git Hooks

The project uses `.githooks/post-commit` to automatically build a portable executable after each commit:

```bash
# Enable hooks (if not already)
git config core.hooksPath .githooks
```

Output files:
- `claude-gui-latest.exe` - Latest portable build
- `claude-gui-0.1.0-portable-{commit}.exe` - Versioned builds

## License

MIT