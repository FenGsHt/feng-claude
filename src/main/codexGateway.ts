import { BrowserWindow } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { v4 as uuidv4 } from 'uuid'
import { IPC, type AgentEventPayload, type AgentSendPayload, type AgentSendResult, type ClaudeTranscriptEntry, type TokenUsageUpdatePayload } from '../renderer/src/types/ipc'
import type { SettingsStore } from './settingsStore'
import { augmentPathWithCodexInstallDirs } from './ptyManager'

interface QueuedMessage {
  runId: string
  request: AgentSendPayload
}

interface UsageSnapshot {
  input: number
  output: number
  cacheRead: number
  cacheCreate: number
}

interface GatewaySession {
  threadId?: string
  model?: string
  queue: QueuedMessage[]
  activeRunId?: string
  activeTurnId?: string
  cancelled: boolean
  usage?: UsageSnapshot
}

interface PendingRequest {
  resolve: (result: Record<string, unknown>) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

/**
 * Codex 的结构化消息网关。
 *
 * app-server 是 Codex CLI 自带的本地 JSON-RPC 服务：它复用用户的 codex login，提供
 * thread/turn、逐字符消息、工具生命周期以及准确的 token 用量事件。这样 GUI 不需要
 * 从 TUI 的 ANSI 输出反推状态。
 */
export class CodexGateway {
  private readonly sessions = new Map<string, GatewaySession>()
  private server?: ChildProcessWithoutNullStreams
  private starting?: Promise<void>
  private stdoutRemainder = ''
  private nextRequestId = 1
  private readonly pending = new Map<number, PendingRequest>()

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
    if (!session.threadId || !session.activeTurnId) return false
    void this.request('turn/interrupt', { threadId: session.threadId, turnId: session.activeTurnId })
      .catch((error) => this.finishWithError(sessionId, session.activeRunId, this.errorText(error)))
    return true
  }

  close(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    this.cancel(sessionId)
    this.sessions.delete(sessionId)
  }

  closeAll(): void {
    for (const sessionId of [...this.sessions.keys()]) this.close(sessionId)
    this.stopServer()
  }

  private getOrCreateSession(sessionId: string): GatewaySession {
    const existing = this.sessions.get(sessionId)
    if (existing) return existing
    const created: GatewaySession = { queue: [], cancelled: false }
    this.sessions.set(sessionId, created)
    return created
  }

  private async runNext(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session || session.activeRunId) return
    const next = session.queue.shift()
    if (!next) return

    session.cancelled = false
    session.activeRunId = next.runId
    this.emit({ sessionId, runId: next.runId, type: 'running', queued: session.queue.length })

    try {
      await this.ensureThread(sessionId, next.request.workdir)
      const current = this.sessions.get(sessionId)
      if (!current || current.activeRunId !== next.runId || !current.threadId) return
      const turn = await this.request('turn/start', {
        threadId: current.threadId,
        input: [{ type: 'text', text: next.request.text, text_elements: [] }],
        ...this.turnOptions()
      })
      const turnRecord = this.asRecord(turn.turn)
      const turnId = typeof turnRecord?.id === 'string' ? turnRecord.id : undefined
      if (!turnId) throw new Error('Codex 未返回 turn id')
      current.activeTurnId = turnId
    } catch (error) {
      this.finishWithError(sessionId, next.runId, this.errorText(error))
    }
  }

  private async ensureThread(sessionId: string, workdir: string): Promise<void> {
    const session = this.getOrCreateSession(sessionId)
    if (session.threadId) return
    const started = await this.request('thread/start', { cwd: workdir, ...this.threadOptions() })
    const thread = this.asRecord(started.thread)
    const threadId = typeof thread?.id === 'string' ? thread.id : undefined
    if (!threadId) throw new Error('Codex 未返回 thread id')
    session.threadId = threadId
    // app-server v2 把实际模型放在 thread 对象内；读取顶层字段会让 token
    // 统计丢失模型标签，进而被错误归入当前 Claude 配置。
    session.model = typeof thread?.model === 'string' ? thread.model : undefined
  }

  private threadOptions(): Record<string, unknown> {
    const settings = this.settingsStore.get()
    const bypass = settings.permissionPreset === 'bypassPermissions'
    return {
      // 嵌入消息模式尚没有与 Codex Desktop 相同的逐项确认面板。让 Codex 在
      // workspace sandbox 内自动执行、越界操作直接失败，比发起没人接收的
      // app-server approval request 后无限等待更符合「大部分自动批准」的语义。
      approvalPolicy: 'never',
      sandbox: bypass ? 'danger-full-access' : 'workspace-write',
      // Follow the local Codex login/config; application profiles never override it.
    }
  }

  private turnOptions(): Record<string, unknown> {
    const settings = this.settingsStore.get()
    const bypass = settings.permissionPreset === 'bypassPermissions'
    return {
      approvalPolicy: 'never',
      sandboxPolicy: bypass
        ? { type: 'dangerFullAccess' }
        : {
            type: 'workspaceWrite',
            writableRoots: [],
            networkAccess: false,
            excludeTmpdirEnvVar: false,
            excludeSlashTmp: false
          },
      // Follow the local Codex login/config; application profiles never override it.
    }
  }

  private async ensureServer(): Promise<void> {
    if (this.server && !this.server.killed) return
    if (this.starting) return this.starting
    this.starting = new Promise<void>((resolve, reject) => {
      let child: ChildProcessWithoutNullStreams
      try {
        const env: NodeJS.ProcessEnv = { ...process.env }
        env.PATH = augmentPathWithCodexInstallDirs(env.PATH ?? '')
        child = spawn('codex', ['app-server', '--stdio'], { stdio: 'pipe', env, windowsHide: true })
      } catch (error) {
        this.starting = undefined
        reject(error)
        return
      }
      this.server = child
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => this.consumeStdout(chunk))
      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8').trim()
        if (text) console.warn('[codex-gateway]', text.slice(-2000))
      })
      child.on('error', (error) => this.handleServerEnded(error))
      child.on('close', (code) => this.handleServerEnded(new Error(`Codex app-server exited (${code ?? 'unknown'})`)))

      this.rawRequest('initialize', {
        clientInfo: { name: 'feng-claude', title: 'Feng Claude', version: '0.7.95' },
        capabilities: { experimentalApi: false, requestAttestation: false }
      }).then(() => {
        this.starting = undefined
        resolve()
      }).catch((error) => {
        this.starting = undefined
        reject(error)
      })
    })
    return this.starting
  }

  private async request(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    await this.ensureServer()
    return this.rawRequest(method, params)
  }

  private rawRequest(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const child = this.server
    if (!child || child.killed || !child.stdin.writable) return Promise.reject(new Error('Codex app-server 未启动'))
    const id = this.nextRequestId++
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Codex ${method} 请求超时`))
      }, 30_000)
      this.pending.set(id, { resolve, reject, timer })
      try {
        child.stdin.write(`${JSON.stringify({ id, method, params })}\n`)
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private consumeStdout(chunk: string): void {
    const lines = (this.stdoutRemainder + chunk).split(/\r?\n/)
    this.stdoutRemainder = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      let message: Record<string, unknown>
      try {
        message = JSON.parse(line) as Record<string, unknown>
      } catch {
        continue
      }
      if (typeof message.id === 'number') {
        const pending = this.pending.get(message.id)
        if (pending) {
          clearTimeout(pending.timer)
          this.pending.delete(message.id)
          if (message.error) {
            pending.reject(new Error(this.errorText(message.error)))
          } else {
            pending.resolve(this.asRecord(message.result) ?? {})
          }
          continue
        }
        // JSON-RPC 双向通道中，Codex 也会用 id 向客户端发起 approval 等
        // server request。此前把这些请求误当作未知 response 丢弃，会让回合
        // 永远停在等待批准。即使出现意外请求，也必须明确回复。
        if (typeof message.method === 'string') this.handleServerRequest(message.id, message.method, this.asRecord(message.params) ?? {})
        continue
      }
      if (typeof message.method === 'string') this.consumeNotification(message.method, this.asRecord(message.params) ?? {})
    }
  }

  private handleServerRequest(id: number, method: string, params: Record<string, unknown>): void {
    const threadId = typeof params.threadId === 'string' ? params.threadId : undefined
    const sessionId = threadId ? this.sessionIdForThread(threadId) : undefined
    const bypass = this.settingsStore.get().permissionPreset === 'bypassPermissions'
    let result: Record<string, unknown> | undefined

    if (method === 'item/commandExecution/requestApproval') {
      result = { decision: bypass ? 'acceptForSession' : 'decline' }
    } else if (method === 'item/fileChange/requestApproval') {
      result = { decision: bypass ? 'acceptForSession' : 'decline' }
    } else if (method === 'execCommandApproval' || method === 'applyPatchApproval') {
      result = bypass
        ? { decision: 'approved' }
        : { decision: { denied: { rejection: 'Feng Claude 的 Codex 消息代理未开启绕过权限模式' } } }
    }

    if (result) {
      this.writeServerReply({ id, result })
      if (!bypass && sessionId) {
        this.emitTranscript(sessionId, [{
          kind: 'event',
          text: 'Codex 请求了额外权限；当前消息代理保持工作区沙箱，已拒绝该越界操作。需要执行时请切换到经典终端，或在设置中启用“允许几乎所有操作”。'
        }])
      }
      return
    }

    // 未实现的交互（例如 MCP 询问用户输入）必须回 error，而不能静默忽略。
    // 这样 Codex 能结束/调整本轮，而不会表现成“消息一直转圈”。
    this.writeServerReply({
      id,
      error: {
        code: -32001,
        message: `Feng Claude 消息代理暂不支持 Codex 请求：${method}`
      }
    })
    if (sessionId) {
      this.emitTranscript(sessionId, [{
        kind: 'event',
        text: `Codex 需要交互确认（${method}）；请切换到经典终端完成该操作。`
      }])
    }
  }

  private writeServerReply(message: Record<string, unknown>): void {
    const child = this.server
    if (!child || child.killed || !child.stdin.writable) return
    try {
      child.stdin.write(`${JSON.stringify(message)}\n`)
    } catch {
      // child 的 close handler 会负责中止正在运行的回合。
    }
  }

  private consumeNotification(method: string, params: Record<string, unknown>): void {
    const threadId = typeof params.threadId === 'string' ? params.threadId : undefined
    const sessionId = threadId ? this.sessionIdForThread(threadId) : undefined
    if (!sessionId) return
    const session = this.sessions.get(sessionId)
    if (!session) return

    if (method === 'item/agentMessage/delta' && typeof params.delta === 'string') {
      const runId = session.activeRunId ?? params.turnId as string
      this.emitTranscript(sessionId, [{ kind: 'assistant', text: params.delta, messageId: String(params.itemId ?? runId) }])
      this.emit({ sessionId, runId: String(runId), type: 'assistant_delta', text: params.delta })
      return
    }
    if (method === 'item/reasoning/textDelta' && typeof params.delta === 'string') {
      this.emitTranscript(sessionId, [{ kind: 'thinking', text: params.delta, messageId: String(params.itemId ?? params.turnId) }])
      return
    }
    if (method === 'item/started') {
      const item = this.asRecord(params.item)
      const tool = this.toolFromItem(item)
      if (!tool) return
      const runId = session.activeRunId ?? String(params.turnId ?? '')
      this.emitTranscript(sessionId, [{
        kind: 'tool', text: tool.name, messageId: String(item?.id ?? `${runId}:${tool.name}`), toolName: tool.name, toolInput: tool.input
      }])
      this.emit({ sessionId, runId: String(runId), type: 'tool', toolName: tool.name })
      return
    }
    if (method === 'thread/tokenUsage/updated') {
      const tokenUsage = this.asRecord(params.tokenUsage)
      const total = this.asRecord(tokenUsage?.total)
      if (total) this.emitUsage(sessionId, session, total)
      return
    }
    if (method === 'turn/completed') {
      const runId = session.activeRunId
      if (!runId) return
      const turn = this.asRecord(params.turn)
      const status = this.asRecord(turn?.status)
      session.activeTurnId = undefined
      if (session.cancelled) {
        session.activeRunId = undefined
        this.emit({ sessionId, runId, type: 'cancelled' })
      } else if (status?.type === 'failed') {
        this.finishWithError(sessionId, runId, this.errorText(turn?.error ?? 'Codex 回合失败'))
        return
      } else {
        session.activeRunId = undefined
        this.emit({ sessionId, runId, type: 'completed', queued: session.queue.length })
      }
      void this.runNext(sessionId)
    }
  }

  private emitUsage(sessionId: string, session: GatewaySession, total: Record<string, unknown>): void {
    const next: UsageSnapshot = {
      input: this.nonNegativeNumber(total.inputTokens),
      output: this.nonNegativeNumber(total.outputTokens),
      cacheRead: this.nonNegativeNumber(total.cachedInputTokens),
      cacheCreate: this.nonNegativeNumber(total.cacheWriteInputTokens)
    }
    const previous = session.usage ?? { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 }
    session.usage = next
    const payload: TokenUsageUpdatePayload = {
      sessionId,
      input: Math.max(0, next.input - previous.input),
      output: Math.max(0, next.output - previous.output),
      cacheRead: Math.max(0, next.cacheRead - previous.cacheRead),
      cacheCreate: Math.max(0, next.cacheCreate - previous.cacheCreate),
      model: session.model,
      reset: false,
      isPrimary: true
    }
    if (payload.input || payload.output || payload.cacheRead || payload.cacheCreate) {
      this.win.webContents.send(IPC.TOKEN_USAGE_UPDATE, payload)
    }
  }

  private toolFromItem(item?: Record<string, unknown>): { name: string; input?: Record<string, unknown> } | undefined {
    if (!item) return undefined
    if (item.type === 'commandExecution' && typeof item.command === 'string') return { name: 'Bash', input: { command: item.command } }
    if (item.type === 'mcpToolCall') {
      const server = typeof item.server === 'string' ? item.server : 'MCP'
      const tool = typeof item.tool === 'string' ? item.tool : 'tool'
      return { name: `${server}.${tool}`, input: this.asRecord(item.arguments) }
    }
    if (item.type === 'fileChange') return { name: '文件修改' }
    return undefined
  }

  private finishWithError(sessionId: string, runId: string | undefined, error: string): void {
    const session = this.sessions.get(sessionId)
    if (!session || !runId || session.activeRunId !== runId) return
    session.activeRunId = undefined
    session.activeTurnId = undefined
    this.emitTranscript(sessionId, [{ kind: 'event', text: `Codex 消息代理错误：${error}` }])
    this.emit({ sessionId, runId, type: 'error', text: error, queued: session.queue.length })
    void this.runNext(sessionId)
  }

  private sessionIdForThread(threadId: string): string | undefined {
    for (const [sessionId, session] of this.sessions) if (session.threadId === threadId) return sessionId
    return undefined
  }

  private emitTranscript(sessionId: string, entries: ClaudeTranscriptEntry[]): void {
    if (!this.win.isDestroyed()) this.win.webContents.send(IPC.CLAUDE_TRANSCRIPT_UPDATE, { sessionId, entries })
  }

  private emit(payload: AgentEventPayload): void {
    if (!this.win.isDestroyed()) this.win.webContents.send(IPC.AGENT_EVENT, payload)
  }

  private handleServerEnded(error: Error): void {
    if (!this.server && !this.starting) return
    this.server = undefined
    this.starting = undefined
    this.stdoutRemainder = ''
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(error)
      this.pending.delete(id)
    }
    for (const [sessionId, session] of this.sessions) {
      const runId = session.activeRunId
      session.threadId = undefined
      session.activeTurnId = undefined
      if (runId) this.finishWithError(sessionId, runId, error.message)
    }
  }

  private stopServer(): void {
    const child = this.server
    this.server = undefined
    this.starting = undefined
    if (child && !child.killed) child.kill('SIGTERM')
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
  }

  private nonNegativeNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
  }

  private errorText(error: unknown): string {
    if (error instanceof Error) return error.message
    if (typeof error === 'string') return error
    try { return JSON.stringify(error) } catch { return String(error) }
  }
}
