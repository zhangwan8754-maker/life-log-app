// 由 public/icon-v3-full.svg 生成所有图标：npm run icons（需要全局安装的 playwright）
//   icon-v3.svg            带圆角，浏览器标签页用
//   icon-v3-180.png        iOS 主屏幕：满版，系统自己切圆角
//   icon-v3-maskable-512   安卓自适应图标：满版，图形都在中间的安全区里
//   icon-v3-192/512.png    其他场合：自带圆角、透明边
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const { chromium } = createRequire(import.meta.url)('playwright')
const pub = (f) => new URL(`../public/${f}`, import.meta.url)
const full = readFileSync(pub('icon-v3-full.svg'), 'utf8').replace(/<!--[\s\S]*?-->\s*/g, '')
const RADIUS = 0.22 // 圆角占边长的比例

writeFileSync(pub('icon-v3.svg'), full.replace('<rect width="512" height="512"', `<rect width="512" height="512" rx="${512 * RADIUS}"`))

const targets = [
  ['icon-v3-180.png', 180, false],
  ['icon-v3-maskable-512.png', 512, false],
  ['icon-v3-192.png', 192, true],
  ['icon-v3-512.png', 512, true],
]
const browser = await chromium.launch()
for (const [file, size, rounded] of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  const clip = rounded ? `border-radius:${RADIUS * 100}%;overflow:hidden;` : ''
  await page.setContent(`<style>html,body{margin:0;background:transparent}div{width:${size}px;height:${size}px;${clip}}svg{display:block;width:100%;height:100%}</style><div>${full}</div>`)
  await page.screenshot({ path: pub(file).pathname, omitBackground: rounded })
  console.log('  ', file)
}
await browser.close()
