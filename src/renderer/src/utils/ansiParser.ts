// Strip ANSI escape codes from a string
const ANSI_REGEX = /\x1B\[[0-9;]*[mGKHFABCDJsuhl]|\x1B\][^\x07]*\x07|\x1B[()][0-9A-Za-z]/g

export function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, '')
}

// Check if string contains ANSI codes
export function hasAnsi(str: string): boolean {
  return ANSI_REGEX.test(str)
}

// Reset regex lastIndex
export function resetAnsiRegex(): void {
  ANSI_REGEX.lastIndex = 0
}
