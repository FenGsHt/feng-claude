import { BrowserWindow } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { homedir } from 'os'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'
import { IPC, type AgentEventPayload, type AgentSendPayload, type AgentSendResult, type ClaudeTranscriptEntry } from '../renderer/src/types/ipc'
import { OFFICIAL_PROFILE_ID, OFFICIAL_PROFILE, type ApiProfile, type SettingsStore } from './settingsStore'
import { augmentPathWithBunInstallDirs } from './ptyManager'
import { getBrowserServerPort } from './browserViewManager'
import { getProxyPort } from './apiProxyServer'

interface QueuedMessage {
  runId: string
  request: AgentSendPayload
}

interface GatewaySession {
  claudeSessionId: string
  initialized: boolean
  queue: QueuedMessage[]
  child?: ChildProcessWithoutNullStreams
  stdoutRemainder: string
  activeRunId?: string
  cancelled: boolean
}

/**
 * [2026-07-31] 消息代理执行器。
 *
 * 该层故意不使用 node-pty：GUI、Telegram 等通道只发送结构化消息，Claude 的 stdout
 * 也只按 JSONL 处理。原生 TUI 仍由 PtyManager 单独负责，二者不再互相猜测状态。
 */
export class AgentGateway {
  private readonly sessions = new Map<string, GatewaySession>()

  constructor(
    private readonly win: BrowserWindow,
    private readonly settingsStore: SettingsStore
  ) {}

  enqueue(request: AgentSendPayload): AgentSendResult {
    const text = request.text.trim()
    if (!request.sessionId || !request.workdir || !text) {
      return { accepted: false, queued: 0, error: '消息、会话或工作目录不能为空' }
    }
    const session = this.getOrCreateSession(request.sessionId)
    const message: QueuedMessage = { runId: uuidv4(), request: { ...request, text } }
    session.queue.push(message)
    this.emit({ sessionId: request.sessionId, runId: message.runId, type: 'queued', queued: session.queue.length })
    void this.runNext(request.sessionId)
    return { accepted: true, queued: session.queue.length }
  }

  cancel(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false
    session.queue.splice(0)
    session.cancelled = true
    session.child?.kill('SIGINT')
    return Boolean(session.child)
  }

  close(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.queue.splice(0)
    session.cancelled = true
    session.child?.kill('SIGTERM')
    this.sessions.delete(sessionId)
  }

  closeAll(): void {
    for (const sessionId of this.sessions.keys()) this.close(sessionId)
  }

  private getOrCreateSession(sessionId: string): GatewaySession {
    const existing = this.sessions.get(sessionId)
    if (existing) return existing
    const created: GatewaySession = {
      claudeSessionId: uuidv4(),
      initialized: false,
      queue: [],
      stdoutRemainder: '',
      cancelled: false
    }
    this.sessions.set(sessionId, created)
    return created
  }

  private async runNext(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session || session.child || session.activeRunId) return
    const next = session.queue.shift()
    if (!next) return

    session.cancelled = false
    session.stdoutRemainder = ''
    session.activeRunId = next.runId
    this.emit({ sessionId, runId: next.runId, type: 'running', queued: session.queue.length })

    const profile = this.resolveProfile(next.request.profileId)
    const settings = this.settingsStore.get()
    const args = [
      '-p', next.request.text,
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '--verbose',
      '--permission-mode', settings.permissionPreset,
      ...(session.claudeSessionId ? ['--resume', session.claudeSessionId] : ['--session-id', uuidv4()])
    ]

    // The first run must create the Claude conversation using a stable ID; later runs resume it.
    // A session always has an ID, so use --session-id only until the first process returns one.
    if (!session.initialized) {
      args.splice(args.indexOf('--resume'), 2, '--session-id', session.claudeSessionId)
      session.initialized = true
    }

    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn('claude', args, {
        cwd: next.request.workdir,
        env: this.buildEnv(profile, sessionId),
        stdio: 'pipe',
        windowsHide: true
      })
    } catch (error) {
      this.finishWithError(sessionId, next.runId, this.errorText(error))
      return
    }
    session.child = child

    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => this.consumeStdout(sessionId, next.runId, chunk))
    child.stderr.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-8000) })
    child.on('error', (error) => this.finishWithError(sessionId, next.runId, this.errorText(error)))
    child.on('close', (code) => {
      const current = this.sessions.get(sessionId)
      if (!current || current.activeRunId !== next.runId) return
      if (current.stdoutRemainder.trim()) this.consumeJsonLine(sessionId, next.runId, current.stdoutRemainder)
      current.stdoutRemainder = ''
      current.child = undefined
      if (current.cancelled) {
        current.activeRunId = undefined
        this.emit({ sessionId, runId: next.runId, type: 'cancelled' })
      } else if (code !== 0) {
        this.finishWithError(sessionId, next.runId, stderr.trim() || `Claude 进程退出（${code ?? '未知'}）`)
        return
      } else {
        current.activeRunId = undefined
        this.emit({ sessionId, runId: next.runId, type: 'completed', queued: current.queue.length })
      }
      void this.runNext(sessionId)
    })
  }

  private consumeStdout(sessionId: string, runId: string, chunk: string): void {
    const session = this.sessions.get(sessionId)
    if (!session || session.activeRunId !== runId) return
    const lines = (session.stdoutRemainder + chunk).split(/\r?\n/)
    session.stdoutRemainder = lines.pop() ?? ''
    for (const line of lines) this.consumeJsonLine(sessionId, runId, line)
  }

  private consumeJsonLine(sessionId: string, runId: string, line: string): void {
    if (!line.trim()) return
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(line) as Record<string, unknown>
    } catch {
      return
    }
    const type = typeof payload.type === 'string' ? payload.type : ''
    const event = this.asRecord(payload.event)
    const delta = this.asRecord(event?.delta)
    const message = this.asRecord(payload.message)

    const deltaText = typeof delta?.text === 'string' ? delta.text : ''
    if (deltaText) {
      this.emitTranscript(sessionId, [{ kind: 'assistant', text: deltaText, messageId: runId }])
      this.emit({ sessionId, runId, type: 'assistant_delta', text: deltaText })
      return
    }

    if (type === 'assistant' && message) {
      const content = Array.isArray(message.content) ? message.content : []
      const text = content
        .map(item => this.asRecord(item))
        .filter((item): item is Record<string, unknown> => Boolean(item))
        .filter(item => item.type === 'text' && typeof item.text === 'string')
        .map(item => item.text as string)
        .join('')
      if (text) this.emitTranscript(sessionId, [{ kind: 'assistant', text, messageId: runId }])
      for (const item of content.map(item => this.asRecord(item))) {
        if (!item || item.type !== 'tool_use') continue
        const toolName = typeof item.name === 'string' ? item.name : '工具'
        this.emitTranscript(sessionId, [{ kind: 'tool', text: toolName, messageId: `${runId}:${String(item.id ?? toolName)}`, toolName }])
        this.emit({ sessionId, runId, type: 'tool', toolName })
      }
    }
  }

  private finishWithError(sessionId: string, runId: string, error: string): void {
    const session = this.sessions.get(sessionId)
    if (!session || session.activeRunId !== runId) return
    session.child = undefined
    session.activeRunId = undefined
    this.emitTranscript(sessionId, [{ kind: 'event', text: `消息代理错误：${error}` }])
    this.emit({ sessionId, runId, type: 'error', text: error, queued: session.queue.length })
    void this.runNext(sessionId)
  }

  private resolveProfile(profileId?: string): ApiProfile {
    if (profileId === OFFICIAL_PROFILE_ID) return OFFICIAL_PROFILE as unknown as ApiProfile
    const settings = this.settingsStore.get()
    return settings.profiles.find(profile => profile.id === profileId) ?? this.settingsStore.getActiveProfile()
  }

  private buildEnv(profile: ApiProfile, sessionId: string): NodeJS.ProcessEnv {
    const settings = this.settingsStore.get()
    const active = settings.activeProfileId === profile.id || profile.isOfficial === true
    const proxyUrl = settings.enableApiProxy && active ? `http://127.0.0.1:${getProxyPort()}` : undefined
    const env: NodeJS.ProcessEnv = { ...process.env }
    for (const key of [
      'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_MODEL',
      'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL',
      'CLAUDE_CODE_SUBAGENT_MODEL', 'CLAUDE_CODE_MAX_CONTEXT_TOKENS', 'ANTHROPIC_MAX_TOKENS'
    ]) delete env[key]
    if (!profile.isOfficial) delete env.CLAUDE_CODE_OAUTH_TOKEN
    Object.assign(env, this.settingsStore.profileToEnvWithProxy(profile, proxyUrl))
    env.CLAUDE_CONFIG_DIR = join(homedir(), '.claude')
    env.FENG_CLAUDE_BROWSER_PORT = String(getBrowserServerPort() || 3100)
    env.FENG_CLAUDE_SESSION_ID = sessionId
    env.CLAUDE_NO_FULLSCREEN = '1'
    env.PATH = augmentPathWithBunInstallDirs(env.PATH ?? '')
    return env
  }

  private emitTranscript(sessionId: string, entries: ClaudeTranscriptEntry[]): void {
    this.win.webContents.send(IPC.CLAUDE_TRANSCRIPT_UPDATE, { sessionId, entries })
  }

  private emit(payload: AgentEventPayload): void {
    this.win.webContents.send(IPC.AGENT_EVENT, payload)
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined
  }

  private errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}
