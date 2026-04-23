import { stripAnsi } from './ansiParser'

export type ParsedChunk =
  | { type: 'text'; content: string }
  | { type: 'prompt_ready' }
  | { type: 'tool_use'; toolName: string; content: string }
  | { type: 'clear' }

// Claude CLI prompt patterns (detected after stripping ANSI codes)
// These patterns are refined based on observed claude CLI output
const PROMPT_PATTERNS = [
  /^\s*>\s*$/, // bare ">" prompt
  /╭─+╮/, // Claude's box-drawing UI border
]

const TOOL_USE_PATTERN = /⏺\s+(\w+)\s*\(/

/**
 * Parse a raw PTY data chunk from Claude CLI into semantic chunks.
 * NOTE: This parser is intentionally conservative. The raw output is logged
 * in development mode to allow refinement of patterns over time.
 */
export function parseClaudeOutput(raw: string): ParsedChunk[] {
  const stripped = stripAnsi(raw)
  const chunks: ParsedChunk[] = []

  if (!stripped.trim()) return chunks

  // Detect tool use lines (e.g. "⏺ Read(file.ts)")
  const toolMatch = stripped.match(TOOL_USE_PATTERN)
  if (toolMatch) {
    chunks.push({ type: 'tool_use', toolName: toolMatch[1], content: stripped.trim() })
    return chunks
  }

  // Detect prompt ready (Claude is waiting for input)
  for (const pattern of PROMPT_PATTERNS) {
    if (pattern.test(stripped)) {
      chunks.push({ type: 'prompt_ready' })
      return chunks
    }
  }

  // Detect clear screen sequences
  if (raw.includes('\x1B[2J') || raw.includes('\x1Bc')) {
    chunks.push({ type: 'clear' })
    return chunks
  }

  // Default: plain text content
  const text = stripped.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (text) {
    chunks.push({ type: 'text', content: text })
  }

  return chunks
}

/**
 * Extract a short title from the first user message
 */
export function extractTitle(text: string): string {
  const clean = text.trim().replace(/\n.*/s, '') // first line only
  return clean.length > 50 ? clean.slice(0, 50) + '…' : clean || 'New Session'
}
