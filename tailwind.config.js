/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}', './src/renderer/index.html'],
  theme: {
    extend: {
      colors: {
        claude: {
          bg: '#1a1a1a',
          surface: '#242424',
          border: '#333333',
          text: '#ececec',
          muted: '#8b8b8b',
          accent: '#d97706'
        }
      }
    }
  },
  plugins: []
}
