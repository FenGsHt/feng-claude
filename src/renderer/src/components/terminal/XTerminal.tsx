import React, { useEffect, useRef, useCallback } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import 'xterm/css/xterm.css'
import { emitTerminalCommittedLine } from '../../lib/terminalLineBridge'
import { useSessionStore } from '../../store/sessionStore'
import { useUserPromptStore } from '../../store/userPromptStore'
import { useTranscriptStore } from '../../store/transcriptStore'
import { useEmbedAwaitingReplyStore } from '../../store/embedAwaitingReplyStore'
import { useEmbedInterruptSuppressStore } from '../../store/embedInterruptSuppressStore'
import { markEmbedUserMessageSent } from '../../store/embedTurnLatencyStore'
import { beginSlashPtyEchoRound, setEmbedSlashPtyEchoActive } from '../../lib/embedPtyTranscriptEcho'
import { isBracketedPasteModeActive } from '../../lib/bracketedPasteMode'
import { formatFileRefForClaudeCode } from '../../lib/claudeRef'
import { isPtyAlternateScreenActive } from '../../store/ptyAlternateScreenStore'
import { DARK_THEME, useResolvedTheme } from '../../hooks/useTheme'
import { getThemeDefinition } from '../../theme/themeRegistry'

interface Props {
  sessionId: string
  active: boolean
}

// Map sessionId → Terminal instance (shared across re-renders)
const terminals = new Map<string, { term: Terminal; fitAddon: FitAddon }>()

/** 当前行缓冲，遇 \r/\n 提交为「最后一问」候选（与 PTY send 并行） */
const terminalLineBuffers = new Map<string, string>()

/** [2026-04-27] 用户输入缓冲：多行文本合并为完整问题 */
const userInputBuffers = new Map<string, string[]>()

/** [2026-04-28] 通用的输入缓冲函数：将发送到 PTY 的数据同时缓冲到 userInputBuffers */
export function bufferUserInput(sessionId: string, data: string): void {
  // 按换行分割，每行单独缓冲
  const lines = data.split(/\r?\n/)
  let buf = userInputBuffers.get(sessionId) ?? []
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length > 0) {
      buf.push(trimmed)
      if (buf.length > 30) buf = buf.slice(-30)
    }
  }
  userInputBuffers.set(sessionId, buf)
}

/** 合并同一帧内多次 fit 请求，减轻 xterm 内部 requestIdleCallback 队列积压 */
const pendingFitRafBySession = new Map<string, number>()
/** [2026-05-11] 浮窗打开时 fit/ResizeObserver 会连续重算 viewport；滚到底需延后几帧稳定执行 */
const pendingBottomRafsBySession = new Map<string, number[]>()

function clearPendingBottomScroll(sessionId: string): void {
  const rafs = pendingBottomRafsBySession.get(sessionId)
  if (!rafs) return
  rafs.forEach((id) => cancelAnimationFrame(id))
  pendingBottomRafsBySession.delete(sessionId)
}

function scheduleScrollToBottom(sessionId: string, options?: { focus?: boolean; frames?: number }): void {
  clearPendingBottomScroll(sessionId)
  const frames = options?.frames ?? 3
  const rafs: number[] = []
  const run = (remaining: number): void => {
    const id = requestAnimationFrame(() => {
      const entry = terminals.get(sessionId)
      if (!entry) {
        pendingBottomRafsBySession.delete(sessionId)
        return
      }
      entry.term.scrollToBottom()
      /* [2026-05-11] xterm 内部 scroll index 到底不一定同步 DOM .xterm-viewport.scrollTop；
       * 浮窗重挂载后首次滚轮会用旧 DOM scrollTop，从顶部开始滚。同步真实 viewport。 */
      const viewport = entry.term.element?.querySelector<HTMLElement>('.xterm-viewport')
      if (viewport) viewport.scrollTop = viewport.scrollHeight
      if (options?.focus && remaining <= 1) entry.term.focus()
      if (remaining > 1) {
        run(remaining - 1)
      } else {
        pendingBottomRafsBySession.delete(sessionId)
      }
    })
    rafs.push(id)
    pendingBottomRafsBySession.set(sessionId, rafs)
  }
  run(frames)
}

function getOrCreateTerminal(sessionId: string): { term: Terminal; fitAddon: FitAddon } {
  if (terminals.has(sessionId)) return terminals.get(sessionId)!

  const term = new Terminal({
    fontFamily: '"Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, monospace',
    fontSize: 13,
    lineHeight: 1.45,
    letterSpacing: 0.3,
    theme: DARK_THEME,
    // [2026-04-23] 原 5000；resize/fit 时 xterm 重算缓冲更重，打包后易触发 task queue deadline 警告，略降 scrollback
    scrollback: 2000,
    allowProposedApi: true,
    convertEol: true
  })

  const fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(new WebLinksAddon())

  terminals.set(sessionId, { term, fitAddon })
  return { term, fitAddon }
}

export function destroyTerminal(sessionId: string): void {
  const raf = pendingFitRafBySession.get(sessionId)
  if (raf !== undefined) {
    cancelAnimationFrame(raf)
    pendingFitRafBySession.delete(sessionId)
  }
  clearPendingBottomScroll(sessionId)
  terminalLineBuffers.delete(sessionId)
  userInputBuffers.delete(sessionId)
  useUserPromptStore.getState().clearSession(sessionId)
  const entry = terminals.get(sessionId)
  if (entry) {
    entry.term.dispose()
    terminals.delete(sessionId)
  }
}

export function writeToTerminal(sessionId: string, data: string): void {
  terminals.get(sessionId)?.term.write(data)
}

/** 将键盘焦点交给对应 xterm（例如从侧栏拖放路径后便于继续输入） */
export function focusTerminal(sessionId: string): void {
  terminals.get(sessionId)?.term.focus()
}

/** [2026-05-07] 浮窗挂载同一 xterm 时，布局稳定前 fit 可能吃到 0 尺寸；显式唤醒重绘 */
export function wakeTerminal(sessionId: string): void {
  const entry = terminals.get(sessionId)
  if (!entry) return
  try {
    entry.fitAddon.fit()
    window.electronAPI?.resizePty(sessionId, entry.term.cols, entry.term.rows)
  } catch {
    // ignore hidden/detached terminal fit errors
  }
  try {
    entry.term.refresh(0, Math.max(0, entry.term.rows - 1))
  } catch {
    // refresh is best-effort
  }
  scheduleScrollToBottom(sessionId, { focus: true, frames: 4 })
}

/** 恢复历史 scrollback：创建（或复用）terminal 实例并写入 base64 编码的原始终端数据 */
export function preFillTerminal(sessionId: string, rawBase64: string): void {
  const { term } = getOrCreateTerminal(sessionId)
  const bytes = Uint8Array.from(atob(rawBase64), (c) => c.charCodeAt(0))
  term.write(bytes)
  // After replaying raw PTY bytes (which may contain alternate-screen switches,
  // absolute cursor positions, etc.), restore the terminal to a clean state so
  // the new Claude session starts on a fresh line without visual corruption.
  //   \x1b[?1049l  — exit alternate screen (safe no-op if already in normal screen)
  //   \x1b[m       — reset all SGR attributes
  //   \x1b[?25h    — ensure cursor is visible
  //   \r\n         — move to a fresh line
  term.write('\x1b[?1049l\x1b[m\x1b[?25h\r\n')
}

/** [2026-04-27] 提交用户问题：将缓冲的多行合并为完整问题，存入 userPromptStore */
export function commitUserPrompt(sessionId: string): void {
  const lines = userInputBuffers.get(sessionId)
  if (!lines || lines.length === 0) return
  // 合并多行，过滤空行，限制长度
  const prompt = lines
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .join('\n')
    .slice(0, 2000)
  if (prompt) {
    useUserPromptStore.getState().setPrompt(sessionId, prompt)
  }
  // 清空缓冲
  userInputBuffers.set(sessionId, [])
}

/**
 * [2026-05-06] 外嵌 Beta：无 xterm 时通过前端输入框发往 PTY（与 onData 路径一致的缓冲与历史一行）
 */
export function submitEmbedSessionInput(sessionId: string, text: string): void {
  /* [2026-05-06] 备用缓冲区（全屏 TUI）下整行提交不会进入应用逻辑；由检测层阻断避免错乱 */
  if (isPtyAlternateScreenActive(sessionId)) return
  const raw = text.replace(/\r\n/g, '\n').trimEnd()
  if (!raw.length) return
  /* [2026-05-08] 新一轮用户提交时取消「中断后隐藏 loading」抑制，否则永远不显示处理中 */
  useEmbedInterruptSuppressStore.getState().clear(sessionId)
  const firstLine = raw.split('\n')[0]?.trimStart() ?? ''
  // [2026-05-12] 只有 /word（字母开头）才是 Claude Code slash 命令；/** / /* 路径等不能误判
  const isSlashCommand = /^\/[a-zA-Z]/.test(firstLine)
  // [2026-05-12] 优先读 xterm 内部 modes（会话建立时就同步），自有 Map 兜底
  const xtermBp = getOrCreateTerminal(sessionId).term.modes.bracketedPasteMode
  const bp = xtermBp || isBracketedPasteModeActive(sessionId)
  /* [2026-05-06] 仅斜杠命令需要把 PTY 原文写入转录（/mcp 等）；普通对话仍以 JSONL 为准避免重复 */
  /* [2026-05-06] 每条新斜杠命令先 flush 并重置缓冲，否则多次 /mcp 在同一会话里会把整屏输出重复堆叠 */
  if (isSlashCommand) {
    beginSlashPtyEchoRound(sessionId)
  } else {
    setEmbedSlashPtyEchoActive(sessionId, false)
  }
  const win = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent)
  const lines = raw.split('\n')
  const lineEnding = win ? '\r' : '\n'
  let payload: string
  /* [2026-05-12] 注释掉原“多行统一用 \n + 前置 \x15 清行”的策略：
   * 用户反馈多行块（如 /** 注释）可进入 sendInput，但在原终端不稳定提交。
   * 改为：多行走平台换行（Windows=\r\n）且不前置 \x15；单行保持原行为。 */
  // const textPart = lines.length === 1 ? lines[0]! : lines.join('\n')
  const isMultiline = lines.length > 1
  // [2026-05-12] 原: const textPart = isMultiline ? lines.join(win ? '\r\n' : '\n') : lines[0]!
  // [2026-05-12] 原改为 CRLF 后 Claude Code/Qwen 仍停在多行编辑态；按官方语义改为行内 LF(Ctrl+J)，末尾 CR(Enter) 提交。
  // 首行以 "/" 开头且并非真正 slash 命令时，Claude CLI 仍可能按命令语义处理；前置空格规避该分支。
  const escapedLeadingSlash = !isSlashCommand && firstLine.startsWith('/')
  const baseTextPart = isMultiline ? lines.join('\n') : lines[0]!
  const textPart = escapedLeadingSlash ? ` ${baseTextPart}` : baseTextPart
  const splitMultilineSubmit = !isSlashCommand && isMultiline
  // [2026-05-12] 原: const multilineSubmitSuffix = `${lineEnding}${lineEnding}`
  // [2026-05-12] 原: const multilineSubmitSuffix = `${lineEnding}\n`
  // [2026-05-12] 原: const multilineSubmitSuffix = '\r'
  // 同批次末尾 Enter 会被 TUI 当作多行编辑内容消费；多行改为“先写正文，延迟后单独发送 Enter”。
  const multilineSubmitSuffix = splitMultilineSubmit ? '' : lineEnding
  const submitMode = splitMultilineSubmit ? 'split-lf-body+delayed-cr' : 'default'
  const hasCaretAtLineEnd = win && textPart.split(/\r?\n/).some(line => line.trimEnd().endsWith('^'))
  // [2026-05-12] ! 开头的命令是 Claude Code shell 命令前缀，在 BP 模式下会被当作纯文本粘贴而不触发 shell 执行，需跳过 BP 包裹
  const isShellCommand = firstLine.startsWith('!')
  if (!isSlashCommand) {
    /* [2026-05-12] 若 Claude Code 已开启 Bracketed Paste 模式（\x1b[?2004h），用 BP 序列包裹文本。
     * 这样 Claude Code 不会把首字符 `/` 解读为 slash 命令触发符，也不会把中间的 `\n` 解读为 Enter 提交。
     * 此方案同时修复：/** 注释、/path 路径、多行粘贴等所有被 slash 弹窗拦截的场景。
     * 但 shell 命令（! 开头）需跳过 BP 包裹，否则 ! 无法触发 shell 执行。 */
    if (bp && !isShellCommand) {
      // BP 模式：\x15 清行 + BP 包裹 + \r 提交；@ 补全问题也随之消失（BP 内不触发自动补全）
      // [2026-05-12] 原: payload = `\x15\x1b[200~${textPart}\x1b[201~\r`
      payload = isMultiline
        ? `\x15\x1b[200~${textPart}\x1b[201~${multilineSubmitSuffix}`
        : `\x15\x1b[200~${textPart}\x1b[201~\r`
    } else if (textPart.includes('@')) {
      /* [2026-05-12] 原 BP 包裹方案在 daemon 模式下导致输入无法送达 PTY。
       * 改为：尾部空格阻止 @ 补全触发，不用 BP 序列。
       * 多行内容不包含尾部空格（Claude Code 不会在多行中间触发 @ 补全）。 */
      if (!isShellCommand) {
        payload = isMultiline
          ? `\x15${textPart}${lineEnding}`
          : `\x15${textPart} ${lineEnding}`
      } else {
        payload = isMultiline ? `${textPart} ${multilineSubmitSuffix}` : `\x15${textPart} ${lineEnding}`
      }
    } else if (hasCaretAtLineEnd) {
      // Windows ^ 行继续符会吞 \r；额外追加一个 \r 确保提交
      // [2026-05-12] 原：payload = `\x15${textPart}${lineEnding}${lineEnding}`；多行禁用 Ctrl+U，避免破坏块输入。
      // [2026-05-12] 原: payload = isMultiline ? `${textPart}${lineEnding}${lineEnding}` : `\x15${textPart}${lineEnding}${lineEnding}`
      payload = isMultiline ? `${textPart}${multilineSubmitSuffix}` : `\x15${textPart}${lineEnding}${lineEnding}`
    } else {
      // [2026-05-12] 原：payload = `\x15${textPart}${lineEnding}`；仅单行保留 Ctrl+U 清行。
      // [2026-05-12] 原: payload = isMultiline ? `${textPart}${lineEnding}` : `\x15${textPart}${lineEnding}`
      payload = isMultiline ? `${textPart}${multilineSubmitSuffix}` : `\x15${textPart}${lineEnding}`
    }
  } else {
    payload = `${textPart}${lineEnding}`
  }
  const traceId = `embed-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  window.electronAPI.sendInput(sessionId, payload, traceId)
  if (splitMultilineSubmit) {
    window.setTimeout(() => {
      window.electronAPI.sendInput(sessionId, '\r')
    }, 80)
  }
  if (isSlashCommand) {
    /* [2026-05-07] 原把 /mcp、/skills 当普通用户消息写入转录和历史，外嵌里会堆出一串生硬的右侧气泡；slash 只驱动终端交互块。 */
    // bufferUserInput(sessionId, `${raw}\n`)
    // useSessionStore.getState().recordEmbedLastUserPrompt(sessionId, raw)
    // useTranscriptStore.getState().append(sessionId, [{ kind: 'user', text: raw, clientEcho: true }])
    // useEmbedAwaitingReplyStore.getState().markPending(sessionId)
    // markEmbedUserMessageSent(sessionId)
    return
  }
  bufferUserInput(sessionId, `${raw}\n`)
  /* [2026-05-06] 原 emitTerminalCommittedLine → notifyTerminalCommittedLine 经 normalize 会丢弃
   * SKIP_TERMINAL_LINES（含整行「claude」）及易误判内容，侧栏历史主标题长期空白 */
  // emitTerminalCommittedLine(sessionId, raw)
  useSessionStore.getState().recordEmbedLastUserPrompt(sessionId, raw)
  /* [2026-05-06] 外嵌输入乐观展示用户消息；JSONL 稍后若重复同一 user 行由 transcriptStore.append 去重 */
  useTranscriptStore.getState().append(sessionId, [{ kind: 'user', text: raw, clientEcho: true }])
  useEmbedAwaitingReplyStore.getState().markPending(sessionId)
  markEmbedUserMessageSent(sessionId)
}

/**
 * [2026-05-06] 不经缓冲行提交，直接向 PTY 写入字节（退出 /help 等全屏 TUI：Ctrl+C、Esc、q↵）
 */
export function sendRawPtyInput(sessionId: string, data: string): void {
  window.electronAPI.sendInput(sessionId, data)
}

/**
 * [2026-05-08] 外嵌/输入栏「中断」专用：同一 IPC 内写入连续两个 Ctrl+C。
 * Claude Code 等在第一轮中断后子进程或中间层常吞掉单次 SIGINT；第二次再点中断时单次 \x03 往往无效。
 * 必须用一次 sendInput（不可拆成两次），否则每条各触发 PTY_INTR_SENT，恢复草稿/弹气泡会跑两遍。
 */
export function sendPtyInterruptSignal(sessionId: string): void {
  window.electronAPI.sendInput(sessionId, '\x03\x03')
}

export function XTerminal({ sessionId, active }: Props): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const lastPtyGeomRef = useRef<{ cols: number; rows: number } | null>(null)
  const resolvedTheme = useResolvedTheme()

  const fit = useCallback(() => {
    const entry = terminals.get(sessionId)
    const el = containerRef.current
    if (!entry || !el) return
    // [2026-04-23] 原未判断尺寸；布局未稳定时 fit 会白跑并加重 xterm 队列
    if (el.clientWidth < 4 || el.clientHeight < 4) return
    try {
      entry.fitAddon.fit()
      const { cols, rows } = entry.term
      const prev = lastPtyGeomRef.current
      if (prev?.cols === cols && prev?.rows === rows) return
      lastPtyGeomRef.current = { cols, rows }
      window.electronAPI?.resizePty(sessionId, cols, rows)
    } catch {
      lastPtyGeomRef.current = null
      // ignore fit errors on hidden tabs
    }
  }, [sessionId])

  const scheduleFit = useCallback(() => {
    const prev = pendingFitRafBySession.get(sessionId)
    if (prev !== undefined) cancelAnimationFrame(prev)
    const id = requestAnimationFrame(() => {
      pendingFitRafBySession.delete(sessionId)
      fit()
    })
    pendingFitRafBySession.set(sessionId, id)
  }, [sessionId, fit])

  /*
   * [2026-04-23] 原先用 mountedRef 包住 onData，仅在「首次」注册；Strict Mode / 父级重挂时新实例
   * mountedRef 归零，但 term 仍在全局 Map 里，会再次 register onData，cleanup 又不 dispose，
   * 叠多条回调 → 键入一次多次 sendInput（中文 IME 看起来像「一个字重复多遍」）。
   * 改为：每次 effect 注册一条 onData，cleanup 里 IDisposable.dispose()。
   */
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const { term } = getOrCreateTerminal(sessionId)

    if (!term.element) {
      term.open(container)
    } else {
      container.appendChild(term.element)
    }
    scheduleScrollToBottom(sessionId, { frames: 3 })

    const dataSub = term.onData((data) => {
      window.electronAPI?.sendInput(sessionId, data)
      // [2026-04-23] 缓冲物理行，遇换行写入 history.lastUserPrompt（terminalLineBridge → sessionStore）
      let buf = terminalLineBuffers.get(sessionId) ?? ''
      for (const ch of data) {
        if (ch === '\r' || ch === '\n') {
          if (buf.length > 0) {
            emitTerminalCommittedLine(sessionId, buf)
            buf = ''
          }
        } else if (ch === '\x7f' || ch === '\b') {
          buf = buf.slice(0, -1)
        } else if (ch.charCodeAt(0) >= 32 || ch === '\t') {
          buf += ch
          if (buf.length > 4000) buf = buf.slice(-2000)
        }
      }
      terminalLineBuffers.set(sessionId, buf)

      // [2026-04-28] 使用统一的缓冲函数
      bufferUserInput(sessionId, data)
    })

    /** 资源管理器「复制文件」后 Ctrl+V：Electron clipboard 的 File 带 path，转成 @ 引用注入 PTY
     * [2026-05-11] 同时处理剪贴板截图（无 .path 的图片 blob）：存临时文件后插入 @path */
    const onPasteFiles = (ev: ClipboardEvent): void => {
      const items = ev.clipboardData?.items
      const files = ev.clipboardData?.files

      // 检测剪贴板图片（截图 / 复制图片，无本地 path）
      const imgItem = items
        ? Array.from(items).find((it) => it.type?.startsWith('image/'))
        : undefined

      // 检测有本地路径的文件（资源管理器复制）
      const hasFileWithPath =
        files && files.length > 0 && !!(files[0] as File & { path?: string }).path

      if (!imgItem && !hasFileWithPath) return

      ev.preventDefault()
      ev.stopPropagation()

      const wd =
        useSessionStore.getState().sessions.find((s) => s.id === sessionId)?.workdir ?? ''

      // 本地文件（有 path）→ 直接格式化 @引用，发到 PTY（原有行为）
      if (hasFileWithPath && files) {
        for (let i = 0; i < files.length; i++) {
          const f = files[i] as File & { path?: string }
          if (!f.path) continue
          const ref = formatFileRefForClaudeCode(f.path, wd, false)
          bufferUserInput(sessionId, ref)
          window.electronAPI?.sendInput(sessionId, `${ref} `)
        }
      }

      // 剪贴板图片（截图 / 复制图片）→ 存临时文件 → term.paste(@path)
      if (imgItem) {
        const blob = imgItem.getAsFile()
        if (!blob) return
        const reader = new FileReader()
        reader.onloadend = async (): Promise<void> => {
          const base64 = (reader.result as string).split(',')[1]
          if (!base64) return
          try {
            const result = await window.electronAPI.saveClipboardImage(base64, wd)
            if (result.success) {
              const abs = result.path.replace(/\\/g, '/')
              const wdFwd = wd.replace(/\\/g, '/')
              const rel =
                wdFwd && abs.toLowerCase().startsWith(wdFwd.toLowerCase())
                  ? abs.slice(wdFwd.length).replace(/^\/+/, '')
                  : abs
              const ref = `@${rel}`
              bufferUserInput(sessionId, ref)
              term.paste(`${ref} `)
            }
          } catch {
            // 失败静默处理，不打断终端正常使用
          }
        }
        reader.readAsDataURL(blob)
      }
    }
    term.textarea.addEventListener('paste', onPasteFiles, true)

    /**
     * [2026-04-24] Ctrl/Cmd+V 在 Electron+xterm 下常无法走通默认 paste；主进程同步读文本后 term.paste。
     * 仅当剪贴板含文本时 preventDefault，以便纯「复制文件」仍落到 onPasteFiles。
     */
    const onKeyDownClipboardPaste = (ev: KeyboardEvent): void => {
      if (ev.type !== 'keydown') return
      if (!(ev.ctrlKey || ev.metaKey)) return
      if (ev.altKey) return
      if (ev.isComposing) return
      if (ev.code !== 'KeyV' && ev.key !== 'v' && ev.key !== 'V') return
      const text = window.electronAPI.readClipboardTextSync?.() ?? ''
      if (text.length === 0) return
      ev.preventDefault()
      ev.stopImmediatePropagation()
      term.paste(text)
    }
    term.textarea.addEventListener('keydown', onKeyDownClipboardPaste, true)

    /**
     * [2026-05-01] Ctrl+Shift+C 复制终端选中文本。
     */
    const doCopy = (): void => {
      const selection = term.getSelection()
      if (!selection) return
      try { window.electronAPI.writeClipboardText(selection) } catch {
        navigator.clipboard.writeText(selection).catch(() => {})
      }
    }

    // 渲染进程自身的键盘事件（备用）
    const onKeyDownClipboardCopy = (ev: KeyboardEvent): void => {
      if (!(ev.ctrlKey || ev.metaKey)) return
      if (!ev.shiftKey) return
      if (ev.altKey) return
      if (ev.code !== 'KeyC') return
      doCopy()
      ev.preventDefault()
      ev.stopPropagation()
      ev.stopImmediatePropagation()
    }
    term.textarea.addEventListener('keydown', onKeyDownClipboardCopy, true)

    const onWindowClipboardCopy = (ev: KeyboardEvent): void => {
      if (!(ev.ctrlKey || ev.metaKey)) return
      if (!ev.shiftKey) return
      if (ev.code !== 'KeyC') return
      doCopy()
      ev.preventDefault()
    }
    window.addEventListener('keydown', onWindowClipboardCopy)

    // 主进程拦截 Ctrl+Shift+C 后发来的复制指令
    const cleanupTerminalCopy = window.electronAPI.onTerminalCopy?.(doCopy)

    // [2026-04-23] 原先立即 fit() + 80ms debounce；打包后 ResizeObserver 连发易与 xterm 内部 idle 队列打架，改为 220ms + rAF 合并
    // fit()
    scheduleFit()
    let fitTimer: ReturnType<typeof setTimeout> | null = null
    const debouncedFit = (): void => {
      if (fitTimer) clearTimeout(fitTimer)
      fitTimer = setTimeout(() => {
        scheduleFit()
      }, 220)
    }
    const ro = new ResizeObserver(debouncedFit)
    ro.observe(container)

    return () => {
      const raf = pendingFitRafBySession.get(sessionId)
      if (raf !== undefined) {
        cancelAnimationFrame(raf)
        pendingFitRafBySession.delete(sessionId)
      }
      dataSub.dispose()
      term.textarea.removeEventListener('paste', onPasteFiles, true)
      term.textarea.removeEventListener('keydown', onKeyDownClipboardPaste, true)
      term.textarea.removeEventListener('keydown', onKeyDownClipboardCopy, true)
      window.removeEventListener('keydown', onWindowClipboardCopy)
      cleanupTerminalCopy?.()
      ro.disconnect()
      if (fitTimer) clearTimeout(fitTimer)
      clearPendingBottomScroll(sessionId)
    }
  }, [sessionId, scheduleFit])

  // Fit then scroll to bottom when becoming active (fit first, then scroll so resize doesn't undo it)
  useEffect(() => {
    if (!active) return
    const t = window.setTimeout(() => {
      const entry = terminals.get(sessionId)
      const el = containerRef.current
      if (!entry || !el || el.clientWidth < 4 || el.clientHeight < 4) return
      try {
        entry.fitAddon.fit()
        const { cols, rows } = entry.term
        const prev = lastPtyGeomRef.current
        if (!prev || prev.cols !== cols || prev.rows !== rows) {
          lastPtyGeomRef.current = { cols, rows }
          window.electronAPI?.resizePty(sessionId, cols, rows)
        }
      } catch {}
      scheduleScrollToBottom(sessionId, { frames: 4 })
    }, 200)
    return () => clearTimeout(t)
  }, [active, sessionId])

  // [2026-04-29] Update xterm theme + font options when resolved theme changes
  useEffect(() => {
    const entry = terminals.get(sessionId)
    if (!entry) return
    const def = getThemeDefinition(resolvedTheme)
    entry.term.options.theme = def.terminal
    // [2026-05-06] 按主题覆盖字体/行高等选项；回退到全局默认值（dark/light 无 terminalOptions）
    const opts = def.terminalOptions
    entry.term.options.fontFamily = opts?.fontFamily ?? '"Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, monospace'
    entry.term.options.fontSize = opts?.fontSize ?? 13
    entry.term.options.lineHeight = opts?.lineHeight ?? 1.45
    entry.term.options.letterSpacing = opts?.letterSpacing ?? 0.3
    entry.term.options.cursorBlink = opts?.cursorBlink ?? false
    if (opts?.cursorStyle) entry.term.options.cursorStyle = opts.cursorStyle
    /* [2026-05-08] Fallout 等主题的粗 bar 光标需显式 width；切回其他主题时恢复默认宽度 */
    entry.term.options.cursorWidth = opts?.cursorWidth ?? 1
  }, [sessionId, resolvedTheme])

  const onContextMenu = (e: React.MouseEvent): void => {
    const text = window.getSelection()?.toString() ?? terminals.get(sessionId)?.term.getSelection() ?? ''
    if (text) {
      try { window.electronAPI.writeClipboardText(text) } catch {
        navigator.clipboard.writeText(text).catch(() => {})
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className={`flex-1 overflow-hidden xterm-theme-${resolvedTheme}`}
      style={{
        /* [2026-05-07] 背景色跟随 registry 的 terminal palette，避免新增主题时漏改。 */
        background: getThemeDefinition(resolvedTheme).terminal.background
      }}
      onContextMenu={onContextMenu}
    />
  )
}
