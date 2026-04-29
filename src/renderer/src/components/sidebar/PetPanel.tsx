import React, { useState, useEffect, useRef, useCallback } from 'react'
import { usePetStore, type PetType } from '../../store/petStore'
import { useSessionStore } from '../../store/sessionStore'
import { useUserPromptStore } from '../../store/userPromptStore'
import type { PetLogRecord } from '../../types/ipc'
import { useI18n } from '../../i18n'
import { PetGrowthPanel } from './PetGrowthPanel'

// ── ASCII Art ────────────────────────────────────────────────────
// 每个 PetType 3 帧（idle 循环），thinking 状态用独立帧

const IDLE_FRAMES: Record<PetType, string[][]> = {
  cat: [
    [' /\\_/\\ ', '( >ω< )', ' > ^ < ', '       '],
    [' /\\_/\\ ', '( >ω< )', '  >^<  ', '   ~   '],
    [' /\\_/\\ ', '( ·ω· )', ' > ^ < ', '       '],
  ],
  robot: [
    ['┌──────┐', '│◉    ◉│', '│  ▽   │', '└──────┘', ' |    | '],
    ['┌──────┐', '│◉    ◉│', '│  △   │', '└──────┘', ' |    | '],
    ['┌──────┐', '│◈    ◈│', '│  ▽   │', '└──────┘', ' |    | '],
  ],
  dragon: [
    ['  ∩___∩ ', ' (◕ ▽ ◕)', '  ╲_╱  ', ' ~~^~~ '],
    ['  ∩___∩ ', ' (◕ ‿ ◕)', '  ╲_╱  ', '  ~^~  '],
    ['  ∩___∩ ', ' (◕ ▲ ◕)', '  ╲W╱  ', ' ~~^~~ '],
  ],
  ghost: [
    [' .----. ', '( O  O )', ' |  ‿ | ', '/|____|\\ ', ' ∿∿∿∿∿ '],
    [' .----. ', '( O  O )', ' |  ‿ | ', '/|____|\\ ', '  ∿∿∿  '],
    [' .----. ', '( ◉  ◉ )', ' |  ω | ', '/|____|\\ ', ' ∿∿∿∿∿ '],
  ],
}

const THINKING_FRAMES: Record<PetType, string[][]> = {
  cat: [
    [' /\\_/\\ ', '( >.< )', ' . . . ', '       '],
    [' /\\_/\\ ', '( >.< )', '  . .  ', '       '],
  ],
  robot: [
    ['┌──────┐', '│◉    ◉│', '│ ···  │', '└──────┘', ' |    | '],
    ['┌──────┐', '│◈    ◈│', '│  ··· │', '└──────┘', ' |    | '],
  ],
  dragon: [
    ['  ∩___∩ ', ' (- . - )', '  ╲.╱  ', '  . .  '],
    ['  ∩___∩ ', ' (- . -)', '  ╲..╱ ', '   .   '],
  ],
  ghost: [
    [' .----. ', '( · · )', ' | ... | ', '/|____|\\ ', '  ...  '],
    [' .----. ', '( · · )', ' | ··· | ', '/|____|\\ ', '   ..  '],
  ],
}

const EXCITED_FRAMES: Record<PetType, string[][]> = {
  cat: [
    [' /\\_/\\ ', '( ★ω★ )', ' !! ! !!', '       '],
    [' /\\_/\\ ', '( ★ω★ )', '!! ! !! ', '  ✨   '],
  ],
  robot: [
    ['┌──────┐', '│★    ★│', '│  !! │', '└──────┘', ' | !! | '],
    ['┌──────┐', '│◉    ◉│', '│ !!! │', '└──────┘', ' |  ! | '],
  ],
  dragon: [
    ['  ∩___∩ ', ' (★ ▽ ★)', '  ╲!╱  ', '✨ ^ ✨'],
    ['  ∩___∩ ', ' (★ ‿ ★)', '  ╲W╱  ', ' ✨^✨ '],
  ],
  ghost: [
    [' .----. ', '( ★  ★ )', ' |  !! | ', '/|____|\\ ', '✨∿∿∿✨'],
    [' .----. ', '( ◉  ◉ )', ' |  !  | ', '/|____|\\ ', ' ∿✨∿  '],
  ],
}

const PET_TYPE_LABELS: Record<PetType, string> = {
  cat: '🐱 猫咪',
  robot: '🤖 机器人',
  dragon: '🐉 龙',
  ghost: '👻 鬼魂',
}

function AsciiPet({ petType, mood }: { petType: PetType; mood: string }): React.ReactElement {
  const [frameIdx, setFrameIdx] = useState(0)

  const frames =
    mood === 'thinking'
      ? THINKING_FRAMES[petType]
      : mood === 'excited'
        ? EXCITED_FRAMES[petType]
        : IDLE_FRAMES[petType]

  useEffect(() => {
    const interval = setInterval(
      () => setFrameIdx((i) => (i + 1) % frames.length),
      mood === 'thinking' ? 400 : mood === 'excited' ? 300 : 800
    )
    return () => clearInterval(interval)
  }, [mood, frames.length])

  const lines = frames[frameIdx % frames.length]!

  return (
    <pre
      className="font-mono text-[11px] leading-[1.35] select-none text-center mx-auto transition-all duration-200"
      style={{
        color:
          mood === 'thinking'
            ? 'var(--claude-muted)'
            : mood === 'excited'
              ? 'var(--claude-accent)'
              : 'var(--claude-text)',
        textShadow: mood === 'excited' ? '0 0 6px color-mix(in srgb, var(--claude-accent) 67%, transparent)' : undefined,
        minHeight: `${frames[0]!.length * 1.35 * 11}px`,
      }}
    >
      {lines.join('\n')}
    </pre>
  )
}

// ── 打字动画气泡 ─────────────────────────────────────────────────
function SpeechBubble({
  text,
  isTyping,
}: {
  text: string
  isTyping: boolean
}): React.ReactElement {
  const [displayed, setDisplayed] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isTyping) {
      setDisplayed('')
      return
    }
    // Typing animation
    let i = 0
    setDisplayed('')
    function tick(): void {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1))
        i++
        timerRef.current = setTimeout(tick, 18)
      }
    }
    timerRef.current = setTimeout(tick, 50)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [text, isTyping])

  return (
    <div className="relative mt-2 mx-1">
      {/* bubble tail */}
      <div
        className="absolute left-1/2 -translate-x-1/2 -top-[7px] w-0 h-0"
        style={{
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderBottom: '7px solid var(--claude-surface2)',
        }}
      />
      <div className="rounded-lg bg-claude-surface2 border border-claude-border/60 px-2.5 py-2 text-[10.5px] text-claude-text leading-snug min-h-[40px]">
        {isTyping ? (
          <span className="flex items-center gap-1 text-claude-muted">
            <span className="inline-flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="inline-block w-1 h-1 rounded-full bg-claude-muted animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </span>
            <span>思考中...</span>
          </span>
        ) : (
          <>
            {displayed}
            {displayed.length < text.length && (
              <span className="inline-block w-[2px] h-[10px] bg-claude-accent animate-pulse ml-0.5 align-middle" />
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Log sub-panel ────────────────────────────────────────────────
function PetLogSubPanel(): React.ReactElement {
  const [logs, setLogs] = useState<PetLogRecord[]>([])
  const [loading, setLoading] = useState(true)
  const { lang } = useI18n()

  const loadLogs = useCallback(async () => {
    setLoading(true)
    try { setLogs(await window.electronAPI.pet.getLogs(100)) } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { void loadLogs() }, [loadLogs])

  const handleClear = async (): Promise<void> => {
    await window.electronAPI.pet.clearLogs()
    setLogs([])
  }

  const fmt = (ts: number): string =>
    new Date(ts).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    })

  const triggerLabel: Record<string, string> = {
    auto: lang === 'zh' ? '自动' : 'Auto',
    manual: lang === 'zh' ? '手动' : 'Manual',
    pet: lang === 'zh' ? '抚摸' : 'Pet',
    'content-bank': lang === 'zh' ? '内容库' : 'Content',
  }

  if (loading) return <div className="flex items-center justify-center py-8 text-claude-muted text-xs">加载中...</div>

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 py-1 border-b border-claude-border shrink-0">
        <span className="text-[11px] text-claude-muted">{logs.length} 条记录</span>
        <div className="flex gap-1">
          <button onClick={loadLogs} className="text-[10px] px-1.5 py-0.5 rounded bg-claude-border text-claude-muted hover:bg-claude-border/80">刷新</button>
          <button onClick={handleClear} className="text-[10px] px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 hover:bg-red-600/30">清空</button>
        </div>
      </div>
      {logs.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-claude-muted text-xs">暂无日志</div>
      ) : (
        <div className="flex-1 overflow-y-auto py-1">
          {logs.map((log) => (
            <div key={log.id} className="px-2 py-2 hover:bg-claude-border/40 border-b border-claude-border/30 last:border-b-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] text-claude-muted font-mono">{fmt(log.timestamp)}</span>
                <span className="text-[10px] px-1 py-0.5 rounded bg-claude-border text-claude-text">{log.petName}</span>
                <span className="text-[10px] px-1 py-0.5 rounded bg-claude-accent/20 text-claude-accent">{triggerLabel[log.triggerType] ?? log.triggerType}</span>
              </div>
              <div className="text-[11px] text-claude-text mb-1 leading-snug">
                <span className="text-claude-muted">问: </span>
                {log.userMessage.length > 100 ? log.userMessage.slice(0, 100) + '...' : log.userMessage}
              </div>
              <div className="text-[11px] text-claude-text leading-snug">
                <span className="text-claude-muted">答: </span>
                {log.assistantMessage.length > 150 ? log.assistantMessage.slice(0, 150) + '...' : log.assistantMessage}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Panel ───────────────────────────────────────────────────
export function PetPanel(): React.ReactElement {
  const { config, mood, speech, history, setConfig, setMood, setSpeech, pushHistory, clearHistory } =
    usePetStore()
  const { sessions, activeSessionId } = useSessionStore()
  const userPrompt = useUserPromptStore((s) =>
    activeSessionId ? s.prompts.get(activeSessionId) : undefined
  )

  const [subTab, setSubTab] = useState<'chat' | 'growth' | 'logs'>('chat')
  const [input, setInput] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [draftName, setDraftName] = useState(config.name)
  const [draftPersonality, setDraftPersonality] = useState(config.personality)
  const [draftProbability, setDraftProbability] = useState(String(config.triggerProbability))
  const [isTyping, setIsTyping] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const activeSession = sessions.find((s) => s.id === activeSessionId)

  // Auto-generate greeting on mount if no history
  useEffect(() => {
    if (history.length === 0 && speech === '喵~ 有什么想问我的？') {
      // Use default greeting, no API call needed
    }
  }, [])

  const buildContext = useCallback((): string => {
    const workdir = activeSession?.workdir ?? '未知目录'
    // [2026-04-27] 使用实时 userPromptStore
    const lastPrompt = userPrompt ?? ''
    const lines: string[] = [`当前工作目录: ${workdir}`]
    if (lastPrompt) lines.push(`用户的问题: ${lastPrompt}`)
    return lines.join('\n')
  }, [activeSession, userPrompt])

  const askPet = useCallback(
    async (userMsg: string) => {
      if (!userMsg.trim()) return
      setMood('thinking')
      setIsTyping(true)
      setSpeech('')

      const contextStr = buildContext()
      const fullUserMsg = contextStr
        ? `[上下文]\n${contextStr}\n\n[问题]\n${userMsg}`
        : userMsg

      pushHistory('user', userMsg)

      try {
        const result = await window.electronAPI.pet.ask({
          message: fullUserMsg,
          history: history.slice(-10),
          petConfig: config,
        })
        console.log('[pet:ask result]', JSON.stringify(result))
        const reply = result.text?.trim() || result.error || '喵？好像出了点问题...'
        pushHistory('assistant', reply)
        setSpeech(reply)
        setMood('talking')
        setIsTyping(false)
        // Return to idle after a while
        setTimeout(() => setMood('idle'), 8000)
      } catch {
        setSpeech('喵！API 连接失败，检查一下 API Key？')
        setMood('idle')
        setIsTyping(false)
      }
    },
    [config, history, buildContext, setMood, setSpeech, setIsTyping, pushHistory]
  )

  function handleSend(): void {
    const msg = input.trim()
    if (!msg) return
    setInput('')
    void askPet(msg)
  }

  function handleAutoAsk(): void {
    const ctx = buildContext()
    const msg = ctx
      ? `根据我当前的上下文，给我一个最激进、最前沿的技术建议或优化方向。`
      : `给我一个随机的激进技术建议。`
    void askPet(msg)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function saveSettings(): void {
    const p = parseInt(draftProbability, 10)
    setConfig({
      name: draftName,
      personality: draftPersonality,
      triggerProbability: isNaN(p) ? 40 : Math.max(0, Math.min(100, p)),
    })
    setShowSettings(false)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-tab bar */}
      <div className="flex shrink-0 border-b border-claude-border/30">
        {(['chat', 'growth', 'logs'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            className={`flex-1 text-[10.5px] py-1 transition-colors ${
              subTab === tab
                ? 'text-amber-400 border-b-2 border-amber-500 -mb-px'
                : 'text-claude-muted hover:text-claude-text'
            }`}
          >
            {tab === 'chat' ? '💬 聊天' : tab === 'growth' ? '🌱 养成' : '📋 日志'}
          </button>
        ))}
      </div>

      {subTab === 'logs' ? <PetLogSubPanel /> : subTab === 'growth' ? (
        <PetGrowthPanel />
      ) : (
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">

        {/* Pet display */}
        <div className="flex flex-col items-center pt-2 pb-1">
          <AsciiPet petType={config.type} mood={mood} />
          <div className="mt-1 text-[10px] font-semibold text-claude-accent tracking-wide">
            {config.name}
          </div>
        </div>

        {/* Speech bubble */}
        <SpeechBubble text={speech || '喵~'} isTyping={isTyping} />

        {/* Action buttons */}
        <div className="flex gap-1.5 mt-1">
          <button
            onClick={handleAutoAsk}
            disabled={mood === 'thinking'}
            className="flex-1 text-[10px] py-1 rounded bg-claude-accent/20 hover:bg-claude-accent/40 border border-claude-accent/40 text-claude-accent disabled:opacity-40 transition-colors"
            title="读取当前上下文，给出建议"
          >
            📡 读心术
          </button>
          <button
            onClick={clearHistory}
            className="text-[10px] px-2 py-1 rounded bg-claude-surface2 hover:bg-claude-surface2/80 border border-claude-border text-claude-muted transition-colors"
            title="清除对话历史"
          >
            🗑
          </button>
        </div>

        {/* Input */}
        <div className="flex gap-1 mt-0.5">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`问问 ${config.name}...`}
            disabled={mood === 'thinking'}
            className="flex-1 text-[10px] px-2 py-1.5 rounded border border-claude-border bg-claude-surface2 text-claude-text placeholder-claude-muted outline-none focus:border-claude-accent/60 disabled:opacity-40 font-mono"
          />
          <button
            onClick={handleSend}
            disabled={mood === 'thinking' || !input.trim()}
            className="text-[10px] px-2.5 py-1.5 rounded bg-claude-accent/30 hover:bg-claude-accent/50 border border-claude-accent/50 text-claude-accent disabled:opacity-40 transition-colors"
          >
            ➤
          </button>
        </div>

        {/* Conversation history (last 3) */}
        {history.length > 0 && (
          <div className="mt-2 space-y-1">
            {history.slice(-6).map((h, i) => (
              <div
                key={i}
                className={`text-[9.5px] px-2 py-1 rounded leading-snug ${
                  h.role === 'user'
                    ? 'bg-claude-surface2 text-claude-muted text-right'
                    : 'bg-claude-surface2 text-claude-text'
                }`}
              >
                <span className="text-[9px] text-claude-muted/50 mr-1">
                  {h.role === 'user' ? '你' : config.name}:
                </span>
                {h.content.length > 80 ? h.content.slice(0, 80) + '…' : h.content}
              </div>
            ))}
          </div>
        )}

        {/* Settings toggle */}
        <button
          onClick={() => {
            setShowSettings((v) => !v)
            setDraftName(config.name)
            setDraftPersonality(config.personality)
            setDraftProbability(String(config.triggerProbability))
          }}
          className="mt-2 text-[9.5px] text-claude-muted/50 hover:text-claude-text flex items-center gap-1 transition-colors"
        >
          <span>{showSettings ? '▲' : '▼'}</span>
          <span>自定义宠物</span>
        </button>

        {/* Settings panel */}
        {showSettings && (
          <div className="space-y-2 bg-claude-surface2 rounded-lg p-2.5 border border-claude-border/50">
            {/* Name */}
            <div>
              <label className="text-[9px] text-claude-muted block mb-0.5">名字</label>
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="w-full text-[10px] px-2 py-1 rounded border border-claude-border bg-claude-bg text-claude-text outline-none focus:border-claude-accent/50"
              />
            </div>

            {/* Pet type */}
            <div>
              <label className="text-[9px] text-claude-muted block mb-1">形态</label>
              <div className="grid grid-cols-2 gap-1">
                {(Object.keys(PET_TYPE_LABELS) as PetType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setConfig({ type: t })}
                    className={`text-[9.5px] py-1 rounded border transition-colors ${
                      config.type === t
                        ? 'bg-claude-accent/30 border-claude-accent/60 text-claude-accent'
                        : 'border-claude-border/50 text-claude-muted hover:text-claude-text hover:border-claude-border'
                    }`}
                  >
                    {PET_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Trigger probability */}
            <div>
              <label className="text-[9px] text-claude-muted block mb-0.5">触发概率 (%)</label>
              <input
                value={draftProbability}
                onChange={(e) => setDraftProbability(e.target.value)}
                className="w-full text-[10px] px-2 py-1 rounded border border-claude-border bg-claude-bg text-claude-text outline-none focus:border-claude-accent/50 font-mono"
                placeholder="40"
              />
              <div className="text-[8px] text-claude-muted/50 mt-0.5">0-100，100 = 百分百触发</div>
            </div>

            {/* Personality */}
            <div>
              <label className="text-[9px] text-claude-muted block mb-0.5">人格 / System Prompt</label>
              <textarea
                value={draftPersonality}
                onChange={(e) => setDraftPersonality(e.target.value)}
                rows={4}
                className="w-full text-[9.5px] px-2 py-1 rounded border border-claude-border bg-claude-bg text-claude-text outline-none focus:border-claude-accent/50 resize-none font-mono leading-relaxed"
              />
            </div>

            <div className="flex gap-1.5 pt-1">
              <button
                onClick={saveSettings}
                className="flex-1 text-[9.5px] py-1 rounded bg-claude-accent/30 hover:bg-claude-accent/50 border border-claude-accent/50 text-claude-accent transition-colors"
              >
                保存
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="text-[9.5px] px-3 py-1 rounded border border-claude-border/50 text-claude-muted hover:text-claude-text transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  )
}
