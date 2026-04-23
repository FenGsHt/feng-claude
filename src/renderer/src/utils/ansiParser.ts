// Strip ANSI / VT escape sequences from a string.
// Covers: CSI (ESC [ ...), OSC (ESC ] ... BEL), single-char ESC, stray control chars.
const STRIP_REGEX = new RegExp(
  '\x1B\\[[\\x30-\\x3F]*[\\x20-\\x2F]*[\\x40-\\x7E]' + // CSI sequences (includes ?25l, ?25h, etc.)
    '|\x1B\\][^\x07\x1B]*(?:\x07|\x1B\\\\)' +            // OSC sequences
    '|\x1B[^\\[\\]\x1B]' +                               // single-char ESC sequences
    '|[\x00-\x08\x0E-\x1A\x1C-\x1F]',                   // stray non-printable control chars
  'g'
)

export function stripAnsi(str: string): string {
  return str.replace(STRIP_REGEX, '')
}

export function hasAnsi(str: string): boolean {
  STRIP_REGEX.lastIndex = 0
  return STRIP_REGEX.test(str)
}
