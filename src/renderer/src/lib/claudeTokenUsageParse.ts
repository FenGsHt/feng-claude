import { useTokenUsageStore } from '../store/tokenUsageStore'

const buffers = new Map<string, string>()
const scanTail = 24_000
const maxBuf = 256_000

interface Pattern {
  re: RegExp
  mode: 'set' | 'add'
}

/** 去掉 CSI / OSC（含部分 SGR），便于匹配 Claude Code 彩色状态行里的数字 */
function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[\d;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b[@-_]/g, '')
    .replace(/\r\n/g, '\n')
}

/** 解析 1234 / 12,345 / 1.2k / 3.4M / 带小数的原样 token（无单位） */
function parseTokenAmount(s: string): number {
  const t = s.trim().replace(/,/g, '')
  const m = t.match(/^([\d.]+)\s*([kKmM]?)$/)
  if (!m) {
    const n = parseFloat(t.replace(/[^\d.]/g, ''))
    return Number.isFinite(n) ? Math.round(n) : 0
  }
  const n = parseFloat(m[1])
  if (Number.isNaN(n)) return 0
  const u = (m[2] ?? '').toLowerCase()
  if (u === 'k') return Math.round(n * 1000)
  if (u === 'm') return Math.round(n * 1_000_000)
  return Math.round(n)
}

function parseNumPair(a: string, b: string): { input: number; output: number } {
  return { input: parseTokenAmount(a), output: parseTokenAmount(b) }
}

/** 状态栏 ↑↓：只取缓冲区尾部最后一次出现，避免滚动区内旧快照被 Math.max 抬高 */
const STATUS_ARROW_TAIL = 14_000

/** 排除 git ahead/behind（↑2 ↓1）；带 k/M 或任一侧 >10 的视为用量 */
function looksLikeTokenPair(
  input: number,
  output: number,
  rawA: string,
  rawB: string
): boolean {
  if (input <= 0 && output <= 0) return false
  if (/[kKmM]/.test(rawA) || /[kKmM]/.test(rawB)) return true
  const hi = Math.max(input, output)
  const lo = Math.min(input, output)
  if (hi <= 10 && lo <= 10) return false
  return true
}

/** 状态栏里 `45k/200k` 与版本号、菜单比例等区分：体量须像真实 context window */
function looksLikeContextWindowPair(used: number, total: number, rawA: string, rawB: string): boolean {
  if (total <= 0 || used < 0 || used > total) return false
  if (/[kKmM]/.test(rawA) || /[kKmM]/.test(rawB)) return true
  if (total >= 8192) return true
  if (total >= 4000 && used >= 200) return true
  return false
}

function ingestLatestStatusArrowSnapshot(
  sessionId: string,
  strippedSlice: string,
  ingest: (
    sid: string,
    input: number,
    output: number,
    mode: 'set' | 'add' | 'override'
  ) => void
): void {
  const tail = strippedSlice.slice(-STATUS_ARROW_TAIL)
  /*
   * [2026-04-23] 原先中间段用 [^\d\u2193]{0,72}，分支名里的数字或过长分隔符会导致永远匹配失败；
   * statusline 文档里 ↑/↓ 与数字之间也可能插入其它片段（费用、百分比等）。改为单行内非贪婪拉到下一箭头。
   */
  const variants = [
    /\u2191\s*([\d,.]+[kKmM]?)[^\n]*?\u2193\s*([\d,.]+[kKmM]?)/g,
    /↑\s*([\d,.]+[kKmM]?)[^\n]*?↓\s*([\d,.]+[kKmM]?)/g
  ]
  let bestEnd = -1
  let pick: { input: number; output: number } | null = null
  for (const rawRe of variants) {
    const r = new RegExp(rawRe.source, rawRe.flags.includes('g') ? rawRe.flags : `${rawRe.flags}g`)
    let m: RegExpExecArray | null
    while ((m = r.exec(tail)) !== null) {
      const pair = parseNumPair(m[1], m[2])
      const end = m.index + m[0].length
      if (!looksLikeTokenPair(pair.input, pair.output, m[1], m[2])) continue
      if ((pair.input > 0 || pair.output > 0) && end > bestEnd) {
        bestEnd = end
        pick = pair
      }
    }
  }
  /* [2026-05-12] 用 set 而非 override：JSONL watcher 数据更精确，override 会将其覆盖为状态栏四舍五入值 */
  if (pick) ingest(sessionId, pick.input, pick.output, 'set')
}

/*
 * [2026-05-12] 原 ingestContextWindowSnapshot 仅用「行尾 $」或 tokens/context 后缀匹配；
 * 官方 statusline 常为单行多段（↑↓、路径、git、`12% context`、`45k/200k` 同列），N/M 夹在中间时永远匹配不到。
 * 改为在尾部扫描 `a/b`（含 Unicode ∕），用 looksLikeContextWindowPair 过滤误匹配。
 */
function ingestContextWindowSnapshot(
  sessionId: string,
  strippedSlice: string,
  ingest: (
    sid: string,
    input: number,
    output: number,
    mode: 'set' | 'add' | 'override',
    extra?: {
      cacheCreate?: number
      cacheRead?: number
      contextTokensUsed?: number
      contextTokensTotal?: number
      contextWindowPercent?: number
    }
  ) => void
): void {
  const tail = strippedSlice.slice(-STATUS_ARROW_TAIL)
  const slashRe = /([\d,.]+[kKmM]?)\s*[\u2215/]\s*([\d,.]+[kKmM]?)/g
  let bestIdx = -1
  let bestUsed = 0
  let bestTotal = 0
  let m: RegExpExecArray | null
  while ((m = slashRe.exec(tail)) !== null) {
    const used = parseTokenAmount(m[1])
    const total = parseTokenAmount(m[2])
    if (!looksLikeContextWindowPair(used, total, m[1], m[2])) continue
    if (m.index >= bestIdx) {
      bestIdx = m.index
      bestUsed = used
      bestTotal = total
    }
  }
  if (bestIdx >= 0 && bestTotal > 0) {
    ingest(sessionId, 0, 0, 'set', { contextTokensUsed: bestUsed, contextTokensTotal: bestTotal })
  }
}

/** [2026-05-12] 官方文档常见 statusline：`jq … "\\(.context_window.used_percentage)% context"'` */
function ingestContextWindowPercent(
  sessionId: string,
  strippedSlice: string,
  ingest: (
    sid: string,
    input: number,
    output: number,
    mode: 'set' | 'add' | 'override',
    extra?: {
      cacheCreate?: number
      cacheRead?: number
      contextTokensUsed?: number
      contextTokensTotal?: number
      contextWindowPercent?: number
    }
  ) => void
): void {
  const tail = strippedSlice.slice(-STATUS_ARROW_TAIL)
  const re = /(\d{1,3}(?:\.\d+)?)\s*%\s*context\b/gi
  let bestEnd = -1
  let bestPct = -1
  let m: RegExpExecArray | null
  while ((m = re.exec(tail)) !== null) {
    const v = parseFloat(m[1])
    const end = m.index + m[0].length
    if (!Number.isFinite(v) || v < 0 || v > 100) continue
    if (end > bestEnd) {
      bestEnd = end
      bestPct = v
    }
  }
  if (bestPct >= 0) {
    ingest(sessionId, 0, 0, 'set', { contextWindowPercent: bestPct })
  }
}

/** [2026-05-12] 从 assistant bubble 的 "cache +N / M" 格式提取上下文窗口总量 */
function ingestContextWindowFromCacheLine(
  sessionId: string,
  strippedSlice: string,
  ingest: (
    sid: string,
    input: number,
    output: number,
    mode: 'set' | 'add' | 'override',
    extra?: {
      cacheCreate?: number
      cacheRead?: number
      contextTokensUsed?: number
      contextTokensTotal?: number
      contextWindowPercent?: number
    }
  ) => void
): void {
  const tail = strippedSlice.slice(-STATUS_ARROW_TAIL)
  // 匹配: cache +1.23k / 265.5k
  const re = /cache[^\d]{0,10}\+([\d,.]+[kKmM]?)\s*\/\s*([\d,.]+[kKmM]?)/gi
  let bestIdx = -1
  let bestTotal = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(tail)) !== null) {
    const total = parseTokenAmount(m[2])
    if (total > 0 && m.index > bestIdx) {
      bestIdx = m.index
      bestTotal = total
    }
  }
  if (bestIdx >= 0 && bestTotal > 0) {
    // context window 始终取最新值（set），不累加
    ingest(sessionId, 0, 0, 'set', { contextTokensTotal: bestTotal })
  }
}

/** 内置右侧「61200 tokens」类单行总计（无 in/out 分拆时仅填 input） */
function ingestBuiltinTotalTokensLine(
  sessionId: string,
  strippedSlice: string,
  ingest: (
    sid: string,
    input: number,
    output: number,
    mode: 'set' | 'add' | 'override'
  ) => void
): void {
  const tail = strippedSlice.slice(-STATUS_ARROW_TAIL)
  const re = /\b([\d,.]+[kKmM]?)\s+tokens?\b/gi
  let bestIdx = -1
  let bestVal = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(tail)) !== null) {
    const n = parseTokenAmount(m[1])
    if (n > bestVal) {
      bestVal = n
      bestIdx = m.index
    }
  }
  /* 用 set 合并：勿 override，否则冲掉 JSON/其它规则已识别的 output */
  if (bestIdx >= 0 && bestVal > 0) {
    ingest(sessionId, bestVal, 0, 'set')
  }
}

/**
 * Claude Code 交互界面里 token 往往出现在：
 * - 底部状态行（↑↓ / unicode 箭头）—— 末尾快照单独提取，避免滚动区旧数字干扰
 * - `/cost`、`/stats`、debug JSON、stream 里的 usage / context_window
 *
 * 精确计费以 Anthropic Console / API 账单为准；此处为「界面可见数字」的最佳努力解析。
 */
const PATTERNS: Pattern[] = [
  { re: /Token usage:\s*input[=:\s]*(\d+)[^\d]{0,60}output[=:\s]*(\d+)/gi, mode: 'set' },
  { re: /\[Tokens:\s*([\d,.]+[kKmM]?)\s*in\s*[/|]\s*([\d,.]+[kKmM]?)\s*out/gi, mode: 'set' },
  { re: /"total_input_tokens"\s*:\s*(\d+)[^}]{0,120}"total_output_tokens"\s*:\s*(\d+)/gi, mode: 'set' },
  { re: /"input_tokens"\s*:\s*(\d+)[^}]{0,120}"output_tokens"\s*:\s*(\d+)/gi, mode: 'set' },
  {
    re: /context_window[^[{]{0,200}"total_input_tokens"\s*:\s*(\d+)[^}]{0,200}"total_output_tokens"\s*:\s*(\d+)/gi,
    mode: 'set'
  },
  {
    re: /"usage"\s*:\s*\{[^}]*"input_tokens"\s*:\s*(\d+)[^}]*"output_tokens"\s*:\s*(\d+)/gi,
    mode: 'set'
  },
  {
    re: /(\d[\d,]*)\s*(?:prompt|input)\s*tokens?[:\s]+(\d[\d,]*)\s*(?:completion|output)\s*tokens?/gi,
    mode: 'set'
  },
  /* /cost、用量面板常见英文 */
  {
    re: /(?:^|\n)\s*(?:prompt|total\s+input)\s+tokens?[：:\s]+([\d,.]+[kKmM]?)[^\d]{0,120}(?:completion|total\s+output)\s+tokens?[：:\s]+([\d,.]+[kKmM]?)/gi,
    mode: 'set'
  },
  {
    re: /\+\s*([\d.kmKM]+)\s*(?:tokens?)?[^\d]{0,30}(?:input|in)[^\d]{0,20}(\d[\d.kmKM]*)\s*(?:output|out)/gi,
    mode: 'add'
  }
]

export function feedPtyChunkForTokenUsage(sessionId: string, chunk: string): void {
  const prev = buffers.get(sessionId) ?? ''
  const prevLen = prev.length
  let buf = prev + chunk

  if (buf.length > maxBuf) {
    buf = buf.slice(-maxBuf)
  }
  buffers.set(sessionId, buf)

  const effectivePrevLen = Math.min(prevLen, buf.length)
  const scanFrom = Math.max(0, effectivePrevLen - scanTail)
  const sliceRaw = buf.slice(scanFrom)
  const slice = stripAnsi(sliceRaw)

  const ingest = useTokenUsageStore.getState().ingest

  for (const { re, mode } of PATTERNS) {
    const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`
    const r = new RegExp(re.source, flags)
    let m: RegExpExecArray | null
    while ((m = r.exec(slice)) !== null) {
      const { input, output } = parseNumPair(m[1], m[2])
      if (input > 0 || output > 0) {
        ingest(sessionId, input, output, mode)
      }
    }
  }

  /* 先拾取内置「N tokens」，再由 ↑↓ 覆盖（避免仅有总计时标题空白） */
  ingestBuiltinTotalTokensLine(sessionId, slice, ingest)
  ingestLatestStatusArrowSnapshot(sessionId, slice, ingest)
  /* 先百分比再 N/M：同一缓冲区内 N/M 覆盖百分比（store 内会清掉 percent） */
  ingestContextWindowPercent(sessionId, slice, ingest)
  ingestContextWindowSnapshot(sessionId, slice, ingest)
  /* [2026-05-12] 从 "cache +N / M" 格式提取上下文窗口总量（assistant bubble） */
  ingestContextWindowFromCacheLine(sessionId, slice, ingest)
}

export function clearTokenUsageBuffer(sessionId: string): void {
  buffers.delete(sessionId)
}

export function resetAllTokenUsageParsing(): void {
  buffers.clear()
}
