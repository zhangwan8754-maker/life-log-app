import { defineConfig } from 'vite'

// 相对路径，部署到任何子路径（如 GitHub Pages 的 /life-log-app/）都能用
export default defineConfig({
  base: './',
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
})
