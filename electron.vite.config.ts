import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['node-pty']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    // [2026-05-12] 生产 minify 后个别环境 preload 里 IPC 回调报「m is not defined」；preload 体积很小，关闭压缩更稳
    build: {
      minify: false
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    css: {
      postcss: './postcss.config.js'
    },
    server: {
      host: '127.0.0.1'
    }
  }
})
