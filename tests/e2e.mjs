// 端到端测试：真实浏览器 + 内存版假 GitHub API。
// 用法：npm run build && npm run e2e   （加 --shots 生成截图到 tests/shots/）
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// Playwright 不写进依赖：本地 / CI 用全局安装的即可
const { chromium, devices } = createRequire(import.meta.url)('playwright')

const ROOT = new URL('../../', import.meta.url).pathname
const SHOTS = process.argv.includes('--shots')
const pad = (n) => String(n).padStart(2, '0')
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const TODAY = ymd()
const DAY_PATH = `days/${TODAY.slice(0, 4)}/${TODAY}.md`

// ───── 假 GitHub ─────

class FakeGitHub {
  files = new Map()
  blobs = new Map()
  puts = []
  sha = (s) => createHash('sha1').update(s).digest('hex')
  write(path, content) {
    const sha = this.sha(content)
    this.files.set(path, sha)
    this.blobs.set(sha, content)
    return sha
  }
  read = (path) => (this.files.has(path) ? this.blobs.get(this.files.get(path)) : undefined)
  async handle(route) {
    const req = route.request()
    const url = new URL(req.url())
    const m = url.pathname.match(/^\/repos\/[^/]+\/[^/]+(\/.*)?$/)
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (req.headers().authorization !== 'Bearer test-token') return json(401, { message: 'Bad credentials' })
    if (!m) return json(404, { message: 'Not Found' })
    const rest = m[1] ?? ''
    const b64 = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/(.{60})/g, '$1\n')
    if (!rest) return json(200, { default_branch: 'main', private: true, full_name: 'me/life-log' })
    if (rest.startsWith('/contents/')) {
      const path = decodeURIComponent(rest.slice('/contents/'.length))
      if (req.method() === 'GET') {
        const c = this.read(path)
        return c === undefined ? json(404, { message: 'Not Found' }) : json(200, { content: b64(c), sha: this.files.get(path), encoding: 'base64' })
      }
      if (req.method() === 'PUT') {
        const body = JSON.parse(req.postData())
        const cur = this.files.get(path)
        if (cur && !body.sha) return json(422, { message: 'sha missing' })
        if (cur && body.sha !== cur) return json(409, { message: 'conflict' })
        const sha = this.write(path, Buffer.from(body.content, 'base64').toString('utf8'))
        this.puts.push({ path, message: body.message })
        return json(200, { content: { sha } })
      }
    }
    if (rest.startsWith('/git/trees/')) return json(200, { tree: [...this.files].map(([path, sha]) => ({ path, sha, type: 'blob' })) })
    if (rest.startsWith('/git/blobs/')) {
      const c = this.blobs.get(rest.slice('/git/blobs/'.length))
      return c === undefined ? json(404, {}) : json(200, { content: b64(c), encoding: 'base64' })
    }
    return json(404, { message: 'Not Found' })
  }
}

// app 单独放在公开仓库时没有数据文件，用这几份最小的样例代替
const FIXTURES = {
  'me.md': '---\nupdated: 2026-11-05\n---\n# 我是谁\n\n## 价值观\n<!-- 我真正在乎什么？按优先级排。冲突时选哪个？ -->\n-\n\n## 当前关注\n-\n',
  'todo.md': '# 待办\n\n## 现在\n\n- [ ] 填写 me.md #life-log\n\n## 之后\n\n## 完成\n',
  'thoughts/第一性原理.md': '---\ncreated: 2026-11-05\ntags: [方法]\nfrom: 2026-11-05\n---\n# 第一性原理\n\n把问题拆到不能再拆的基本事实，再从这些事实往上重建。\n',
}

function seedFromRepo(gh) {
  if (!existsSync(join(ROOT, 'todo.md'))) {
    for (const [p, c] of Object.entries(FIXTURES)) gh.write(p, c)
    return
  }
  const walk = (dir) =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n)
      return statSync(p).isDirectory() ? walk(p) : [p]
    })
  for (const p of ['me.md', 'todo.md', 'AGENTS.md', ...['days', 'thoughts', 'reviews'].flatMap((d) => walk(join(ROOT, d)).map((f) => relative(ROOT, f)))])
    if (p.endsWith('.md')) gh.write(p, readFileSync(join(ROOT, p), 'utf8'))
}

/** 截图用：近 100 天的示例数据 */
function seedSample(gh) {
  let r = 7
  const rnd = () => ((r = (r * 9301 + 49297) % 233280), r / 233280)
  const notes = ['散步时想清楚了下周的优先级', '读到一句话：慢即是快', '和朋友聊了很久', '午后有点困', '把复杂问题拆小，立刻轻松很多']
  for (let i = 100; i >= 1; i--) {
    if (rnd() < 0.18) continue
    const d = new Date()
    d.setDate(d.getDate() - i)
    const date = ymd(d)
    const mood = Math.max(1, Math.min(10, Math.round(6 + Math.sin(i / 9) * 2 + (rnd() - 0.5) * 3)))
    const energy = Math.max(1, Math.min(10, Math.round(mood + (rnd() - 0.5) * 4)))
    gh.write(
      `days/${date.slice(0, 4)}/${date}.md`,
      `---\ndate: ${date}\nmood: ${mood}\nenergy: ${energy}\ntags: []\n---\n## 日记\n\n天气不错，完成了计划里的大部分事情。\n\n## 速记\n\n- 09:${pad(i % 60)} ${notes[i % notes.length]}\n`,
    )
  }
  gh.write(
    'todo.md',
    `# 待办\n\n## 现在\n\n- [ ] 填写 me.md #life-log\n- [ ] 读完《置身事内》 @${ymd(new Date(Date.now() + 3 * 864e5))} #阅读\n- [ ] 给妈妈打电话\n- [ ] 整理上个月的照片 @${ymd(new Date(Date.now() - 864e5))}\n\n## 之后\n\n- [ ] 学一首钢琴曲 #音乐\n- [ ] 规划春节旅行\n\n## 完成\n\n- [x] 搭建 life-log ✓${TODAY}\n`,
  )
  gh.write(
    'thoughts/慢即是快.md',
    `---\ncreated: ${ymd(new Date(Date.now() - 5 * 864e5))}\ntags: [方法, 节奏]\nfrom: \n---\n# 慢即是快\n\n急着推进时最容易返工。先花十分钟把问题写清楚，往往比直接动手省下一小时。\n`,
  )
  gh.write(
    'reviews/2026-W44.md',
    `---\nperiod: 2026-W44\n---\n# 复盘 · 2026-W44\n\n## 事实\n\n- 运动 3 次，读书 4 天\n\n## 数据\n\n情绪均值 6.8，精力均值 6.1\n\n## 模式\n\n睡够 7 小时的第二天，情绪平均高 1.5 分。\n\n## 下一步\n\n- 23:30 前放下手机\n`,
  )
}

// ───── 运行 ─────

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4319', '--strictPort'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'pipe' })
await new Promise((res, rej) => {
  server.stdout.on('data', (d) => String(d).includes('4319') && res())
  server.on('exit', rej)
  setTimeout(() => rej(new Error('preview 启动超时')), 15000)
})
const BASE = 'http://localhost:4319/'
const browser = await chromium.launch()
const until = async (fn, what, ms = 8000) => {
  const t = Date.now()
  while (Date.now() - t < ms) {
    if (await fn()) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`超时：${what}`)
}

async function newPage(gh, opts = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', ...opts })
  await ctx.route('https://api.github.com/**', (r) => gh.handle(r))
  const page = await ctx.newPage()
  page.on('pageerror', (e) => {
    throw e
  })
  return { ctx, page }
}

async function connect(page) {
  await page.goto(BASE)
  await page.waitForURL(/#\/settings/)
  await page.fill('input[placeholder="GitHub 用户名"]', 'me')
  await page.fill('input[type=password]', 'test-token')
  await page.click('button[type=submit]')
  await page.waitForURL((u) => u.hash === '#/')
}

let passed = 0
const step = async (name, fn) => {
  await fn()
  passed++
  console.log(`  ✓ ${name}`)
}

try {
  console.log('功能测试')
  const gh = new FakeGitHub()
  seedFromRepo(gh)
  const { ctx, page } = await newPage(gh)
  const capture = page.locator('.capture-input')

  await step('错误令牌给出提示', async () => {
    await page.goto(BASE)
    await page.fill('input[placeholder="GitHub 用户名"]', 'me')
    await page.fill('input[type=password]', 'wrong')
    await page.click('button[type=submit]')
    await until(async () => (await page.textContent('.settings')).includes('Bad credentials'), '错误提示')
  })

  await step('连接仓库后进入今天', () => connect(page))

  await step('速记写入当天文件', async () => {
    await capture.fill('第一条速记')
    await capture.press('Enter')
    await page.locator('.notes li', { hasText: '第一条速记' }).waitFor()
    await until(() => gh.read(DAY_PATH)?.includes('第一条速记'), '远端出现速记')
    assert.match(gh.read(DAY_PATH), /^---\ndate: \d{4}-\d{2}-\d{2}\nmood:/)
  })

  await step('以 [] 开头的速记进入待办', async () => {
    await capture.fill('[] 买牛奶 #生活')
    await capture.press('Enter')
    await until(() => gh.read('todo.md')?.includes('- [ ] 买牛奶 #生活'), 'todo.md 出现新待办')
  })

  await step('情绪 / 精力打分写入 frontmatter', async () => {
    await page.locator('.score').nth(0).locator('.dot').nth(6).click()
    await page.locator('.score').nth(1).locator('.dot').nth(4).click()
    await until(() => /mood: 7\nenergy: 5/.test(gh.read(DAY_PATH) ?? ''), 'mood/energy')
  })

  await step('日记自动保存', async () => {
    await page.fill('textarea.journal', '今天写了一个记录自己的系统。\n\n很开心。')
    await until(() => gh.read(DAY_PATH)?.includes('## 日记\n\n今天写了一个记录自己的系统。\n\n很开心。\n'), '日记内容')
  })

  await step('另一台设备同时修改：两边内容都保留', async () => {
    const other = gh.read(DAY_PATH).replace('## 速记\n', '## 速记\n\n- 07:00 手机上记的\n').replace(/\n\n\n/g, '\n\n')
    gh.write(DAY_PATH, other)
    await capture.fill('电脑上记的')
    await capture.press('Enter')
    await until(() => gh.read(DAY_PATH)?.includes('电脑上记的'), '合并后的速记')
    const md = gh.read(DAY_PATH)
    assert.ok(md.includes('手机上记的') && md.includes('第一条速记') && md.includes('很开心'))
  })

  await step('离线记录，联网后自动同步', async () => {
    await ctx.setOffline(true)
    await capture.fill('地铁里没信号')
    await capture.press('Enter')
    await page.locator('.notes li', { hasText: '地铁里没信号' }).waitFor()
    await until(async () => /离线|待同步/.test(await page.textContent('.sync')), '离线状态')
    assert.ok(!gh.read(DAY_PATH).includes('地铁里没信号'))
    await ctx.setOffline(false)
    await until(() => gh.read(DAY_PATH)?.includes('地铁里没信号'), '联网后同步')
    await until(async () => (await page.textContent('.sync')) === '已同步', '状态回到已同步')
  })

  await step('刷新后内容来自本地缓存并保持一致', async () => {
    await page.reload()
    await page.locator('.notes li', { hasText: '地铁里没信号' }).waitFor()
    assert.equal(await page.inputValue('textarea.journal'), '今天写了一个记录自己的系统。\n\n很开心。')
  })

  await step('待办：完成、撤销、移动', async () => {
    await page.click('a.tab[data-tab=todo]')
    const item = page.locator('.todo', { hasText: '买牛奶' })
    await item.locator('.check').click()
    await until(() => gh.read('todo.md')?.includes(`- [x] 买牛奶 #生活 ✓${TODAY}`), '标记完成')
    await page.locator('.done-box summary').click()
    await page.locator('.done .todo', { hasText: '买牛奶' }).locator('.check').click()
    await until(() => /## 现在[\s\S]*- \[ \] 买牛奶 #生活[\s\S]*## 之后/.test(gh.read('todo.md')), '撤销完成')
    await page.locator('.todo', { hasText: '买牛奶' }).locator('button[title=移到之后]').click()
    await until(() => /## 之后\n\n- \[ \] 买牛奶/.test(gh.read('todo.md')), '移到之后')
  })

  await step('从速记提炼为思想', async () => {
    await page.click('a.tab[data-tab=today]')
    await page.locator('.notes li', { hasText: '第一条速记' }).locator('button').click()
    await page.waitForURL(/#\/thought\/new/)
    assert.equal(await page.inputValue('.editor textarea'), '第一条速记')
    await page.fill('.title-input', '记录本身就是思考')
    await page.fill('.editor input.small', '方法 记录')
    await until(() => gh.read('thoughts/记录本身就是思考.md'), '思想文件')
    const md = gh.read('thoughts/记录本身就是思考.md')
    assert.match(md, new RegExp(`created: ${TODAY}\\ntags: \\[方法, 记录\\]\\nfrom: ${TODAY}`))
    assert.ok(md.includes('# 记录本身就是思考\n\n第一条速记'))
    await page.click('text=完成')
    await page.locator('.reader h1', { hasText: '记录本身就是思考' }).waitFor()
  })

  await step('思想列表与回看搜索', async () => {
    await page.click('a.tab[data-tab=thoughts]')
    await page.locator('.card', { hasText: '记录本身就是思考' }).waitFor()
    await page.locator('.card', { hasText: '第一性原理' }).waitFor()
    await page.click('a.tab[data-tab=review]')
    await page.locator('.cell.val.mood').first().waitFor()
    await page.fill('input[placeholder^="搜索日记"]', '地铁')
    await page.locator('.results a', { hasText: '地铁里没信号' }).waitFor()
  })

  await step('编辑 me.md', async () => {
    await page.click('text=我是谁')
    await page.locator('.prose h1', { hasText: '我是谁' }).waitFor()
    await page.click('button:has-text("编辑")')
    const v = await page.inputValue('textarea')
    await page.fill('textarea', v.replace('## 价值观\n<!-- 我真正在乎什么？按优先级排。冲突时选哪个？ -->\n-', '## 价值观\n- 自由'))
    await page.click('button:has-text("完成")')
    await until(() => gh.read('me.md')?.includes('## 价值观\n- 自由'), 'me.md 保存')
  })

  assert.ok(gh.puts.every((p) => p.message), '每次提交都有说明')
  console.log(`  提交记录：${gh.puts.map((p) => p.message).join(' / ')}`)
  await ctx.close()

  if (SHOTS) {
    console.log('截图')
    mkdirSync(new URL('./shots', import.meta.url), { recursive: true })
    const sample = new FakeGitHub()
    seedFromRepo(sample)
    seedSample(sample)
    sample.write(DAY_PATH, `---\ndate: ${TODAY}\nmood: 7\nenergy: 6\ntags: []\n---\n## 日记\n\n早上去河边跑了五公里，回来把 life-log 搭了起来。\n\n第一次觉得，记录不是负担，而是和自己对话的方式。\n\n## 速记\n\n- 08:12 把复杂的问题拆成最小的事实\n- 13:40 午饭后散步 20 分钟，下午明显更清醒\n- 21:05 想读一本关于城市的书\n`)
    const targets = [
      ['desktop', { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 }],
      ['phone', { ...devices['iPhone 15'] }],
    ]
    for (const [name, opts] of targets)
      for (const scheme of ['light', 'dark']) {
        const { ctx: c, page: p } = await newPage(sample, { ...opts, colorScheme: scheme })
        await connect(p)
        for (const [tab, hash] of [['today', '#/'], ['todo', '#/todo'], ['thoughts', '#/thoughts'], ['review', '#/review']]) {
          await p.goto(BASE + hash)
          await p.waitForTimeout(tab === 'review' ? 1200 : 500)
          const [sw, iw] = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth])
          assert.ok(sw <= iw, `${name} ${tab} 横向溢出：${sw} > ${iw}`)
          await p.screenshot({ path: new URL(`./shots/${name}-${scheme}-${tab}.png`, import.meta.url).pathname, fullPage: name === 'desktop' })
        }
        await c.close()
      }
    console.log('  → tests/shots/')
  }
  console.log(`\n${passed} 项通过`)
} catch (e) {
  console.error('\n✗', e)
  process.exitCode = 1
} finally {
  await browser.close()
  server.kill()
  process.exit()
}
