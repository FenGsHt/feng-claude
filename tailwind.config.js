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
          bg: '#141414',       // main background
          surface: '#1c1c1c',  // sidebar / titlebar / tabbar
          surface2: '#202020', // elevated panels
          border: '#2a2a2a',   // dividers
          text: '#e8e8e8',     // primary text
          muted: '#717171',    // secondary / placeholder
          accent: '#f59e0b'    // amber-500
        }
      },
      boxShadow: {
        'pane-focus': '0 0 0 1px rgba(245,158,11,0.4) inset'
      }
    }
  },
  plugins: []
}
