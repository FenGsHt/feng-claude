import { useTokenUsageStore } from '../store/tokenUsageStore'

const buffers = new Map<string, string>()
const scanTail = 24_000
const maxBuf = 256_000

interface Pattern {
  re: RegExp
  mode: 'set' | 'add'
}

/** 去掉 CSI / OSC，便于匹配 Claude Code 彩色状态行里的数字 */
function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[\d;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b[@-_]/g, '')
    .replace(/\r\n/g, '\n')
}

/** 解析 1234 / 12,345 / 1.2k / 3.4M */
function parseTokenAmount(s: string): number {
  const t = s.trim().replace(/,/g, '')
  const m = t.match(/^([\d.]+)\s*([kKmM]?)$/)
  if (!m) return parseInt(t, 10) || 0
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

/**
 * Claude Code 交互界面里 token 往往出现在：
 * - 底部状态行（含 ANSI）
 * - 偶发的 JSON 片段（stream 事件、context_window）
 * 官方未必打印「Token usage:」明文（见 GitHub feature request），因此模式要尽量宽。
 */
const PATTERNS: Pattern[] = [
  { re: /Token usage:\s*input[=:\s]*(\d+)[^\d]{0,60}output[=:\s]*(\d+)/gi, mode: 'set' },
  { re: /\[Tokens:\s*([\d,.]+[kKmM]?)\s*in\s*[/|]\s*([\d,.]+[kKmM]?)\s*out/gi, mode: 'set' },
  {
    re: /↑\s*([\d,.]+[kKmM]?)\s+↓\s*([\d,.]+[kKmM]?)/gi,
    mode: 'set'
  },
  {
    re: /↑\s*([\d,.]+[kKmM]?)[^\d]{0,16}↓\s*([\d,.]+[kKmM]?)/gi,
    mode: 'set'
  },
  /* Unicode ↑↓（部分终端 / Claude Code 状态行） */
  {
    re: /\u2191\s*([\d,.]+[kKmM]?)[^\d]{0,24}\u2193\s*([\d,.]+[kKmM]?)/gi,
    mode: 'set'
  },
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
    re: /(\d[\d,]*)\s*(?:↑|tokens?\s*in|input\s*tokens?)[^\d]{0,40}(\d[\d,]*)\s*(?:↓|tokens?\s*out|output\s*tokens?)/gi,
    mode: 'set'
  },
  {
    re: /(\d[\d,]*)\s*(?:prompt|input)\s*tokens?[:\s]+(\d[\d,]*)\s*(?:completion|output)\s*tokens?/gi,
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
}

export function clearTokenUsageBuffer(sessionId: string): void {
  buffers.delete(sessionId)
}

export function resetAllTokenUsageParsing(): void {
  buffers.clear()
}
