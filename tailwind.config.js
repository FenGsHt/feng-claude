/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}', './src/renderer/index.html'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"Cascadia Code"', '"JetBrains Mono"', '"Fira Code"', 'Consolas', 'monospace']
      },
      colors: {
        claude: {
          bg: 'var(--claude-bg)',
          surface: 'var(--claude-surface)',
          surface2: 'var(--claude-surface2)',
          border: 'var(--claude-border)',
          text: 'var(--claude-text)',
          muted: 'var(--claude-muted)',
          accent: 'var(--claude-accent)'
        }
      },
      boxShadow: {
        'pane-focus': '0 0 0 1px rgba(245,158,11,0.4) inset'
      }
    }
  },
  plugins: []
}
