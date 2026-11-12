// 端到端测试：真实浏览器 + 内存版假 GitHub API。
// 用法：npm run build && npm run e2e   （加 --shots 生成截图到 tests/shots/）
import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// Playwright 不写进依赖：本地 / CI 用全局安装的即可
const { chromium, devices } = createRequire(import.meta.url)('playwright')

const BOARD = process.argv.includes('--board')
const ONLY_SHOTS = BOARD || process.argv.includes('--only-shots')
const SHOTS = ONLY_SHOTS || process.argv.includes('--shots')
const pad = (n) => String(n).padStart(2, '0')
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const plusDays = (n) => ymd(new Date(Date.now() + n * 864e5))
const TODAY = ymd()
const TOMORROW = plusDays(1)
const DAY_PATH = `days/${TODAY.slice(0, 4)}/${TODAY}.md`
const isoWeekId = (date) => {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  const w = Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7)
  return `${t.getUTCFullYear()}-W${pad(w)}`
}
const WEEK = isoWeekId(TODAY)
const PREV_WEEK = isoWeekId(plusDays(-7))
const PATTERNS = 'memory/patterns.md'
const CLAUDE = 'memory/proposals/claude.md'
const DEEPSEEK = 'memory/proposals/deepseek.md'

/** AI 维护的记忆层：模式账本、提议、大事记（内容都是虚构的示例） */
function seedMemory(gh) {
  const link = (n) => `[${plusDays(n).slice(5)}](../days/${plusDays(n).slice(0, 4)}/${plusDays(n)}.md)`
  gh.write(
    PATTERNS,
    `---\nupdated: ${plusDays(-3)}\n---\n# 模式账本\n\n> AI 维护，主人裁决。\n\n## P1 睡够七小时的日子，精力分更高\n\n状态：观察中 · 支持 3 天 / 反例 1 天\n\n证据\n- ${link(-4)} 精力 9：「一觉睡到七点，上午很清醒」\n- ${link(-5)} 精力 7：「午睡了二十分钟」\n\n反例\n- ${plusDays(-2).slice(5)} 精力 8，只睡了六小时。\n\n## P2 事情一多，先被推掉的是健身\n\n状态：观察中 · 支持 2 天\n\n证据\n- ${plusDays(-2).slice(5)}：只读了书\n`,
  )
  // 每个 AI 的建议各放一个文件
  gh.write(DEEPSEEK, `---\nagent: deepseek\nupdated: ${plusDays(-1)}\n---\n# DeepSeek 的建议\n\n## ${PREV_WEEK} 复盘\n\n1. 这周有三天是十二点后睡的，先把睡觉时间固定下来。\n2. 「读书计划」两周没有勾过任务，目标还成立吗？\n`)
  gh.write(
    CLAUDE,
    `---\nagent: claude\nupdated: ${plusDays(-3)}\n---\n# 提议\n\n> AI 写，主人决定。\n\n## 值得再看一眼的原话\n\n1. ${link(-1)}「把问题写清楚，就解决了一半。」（周末整理笔记时）\n\n## 可以放进 me.md 的\n\n4. 「做法 · 借来的」←「重要的事放在上午做」。这是你读到的，还没试过。\n\n## 待办和复盘\n\n7. 「健身」项目的任务是每周都要做的事，永远勾不掉。可以二选一：\n   - 改成有终点的任务；\n   - 或者每次记一条投入。\n`,
  )
  gh.write('memory/timeline.md', `---\nthrough: ${plusDays(-1)}\n---\n# 大事记\n\n- ${link(-4)} 爬了一天山，「腿很酸，但很痛快。」\n`)
}

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

/** 和 v1 用户手机上一样的数据：旧版待办格式 */
function seedV1(gh) {
  gh.write('me.md', '---\nupdated: 2026-11-05\n---\n# 我是谁\n\n## 价值观\n-\n\n## 今年\n- 读完 24 本书\n')
  gh.write('todo.md', '# 待办\n\n## 现在\n\n- [ ] 填写 me.md #life-log\n\n## 之后\n\n- [ ] 学钢琴\n\n## 完成\n\n- [x] 搭建 life-log ✓2026-11-01\n')
  gh.write('thoughts/第一性原理.md', '---\ncreated: 2026-11-05\ntags: [方法]\nfrom: 2026-11-05\n---\n# 第一性原理\n\n把问题拆到不能再拆的基本事实，再从这些事实往上重建。\n')
  gh.write('reviews/_template.md', '# 模板\n')
}

/** 截图用：近 100 天的示例数据 + 新版待办 */
function seedSample(gh) {
  seedV1(gh)
  gh.write(
    'me.md',
    `---\nupdated: ${TODAY}\n---\n# 我是谁\n\n## 现在\n\n在读学生，大三，计算机专业，在上海。\n正在学运维和英语。\n\n## 在乎\n\n### 让我有劲的\n\n把一件事从头搭起来；看到设计得很美的东西。\n\n### 耗我的\n\n### 好的一天\n\n睡够了，学了一点新东西，和在乎的人说了话。\n\n## 方向\n\n### 这学期\n\n- 过英语六级\n- 做完一个能上线的小项目\n\n### 每周投入\n\n- 英语 6h\n- 写代码 8h\n- 读书 2h\n\n### 毕业时\n\n### 更远\n\n## 做法\n\n### 验证过的\n\n### 借来的\n\n「慢即是快」——还没试过，先记在这。\n\n## 还没想清楚\n`,
  )
  let r = 7
  const rnd = () => ((r = (r * 9301 + 49297) % 233280), r / 233280)
  const notes = ['散步时想清楚了下周的优先级', '学到：先花十分钟把问题写清楚，再动手', '和朋友聊了很久', '把复杂问题拆小，立刻轻松很多', '问题：为什么一到下午就犯困？']
  const study = ['投入：英语 1h，读书 1h', '投入：写代码 1.5h，英语 30min', '投入：英语 1h', '投入：读书 1h，写代码 40min，跑步 30min']
  for (let i = 100; i >= 1; i--) {
    if (rnd() < 0.18) continue
    const date = plusDays(-i)
    const mood = Math.max(1, Math.min(10, Math.round(6 + Math.sin(i / 9) * 2 + (rnd() - 0.5) * 3)))
    const energy = Math.max(1, Math.min(10, Math.round(mood + (rnd() - 0.5) * 4)))
    gh.write(
      `days/${date.slice(0, 4)}/${date}.md`,
      `---\ndate: ${date}\nmood: ${mood}\nenergy: ${energy}\ntags: []\n---\n## 日记\n\n天气不错，完成了计划里的大部分事情。\n\n## 速记\n\n- 09:${pad(i % 60)} ${notes[i % notes.length]}\n${i % 5 ? `- 21:${pad(i % 60)} ${study[i % study.length]}\n` : ''}`,
    )
  }
  seedMemory(gh)
  gh.write(`reviews/${PREV_WEEK}.md`, `---\nperiod: ${PREV_WEEK}\n---\n# 复盘 · ${PREV_WEEK}\n\n## 事实\n\n读了四天书，周末爬了山。\n\n## 数据\n\n- 记录 6/7 天\n\n## 模式\n\n睡够的日子状态更好。\n\n## 下一步\n\n- 每天读 20 页\n- 十一点前睡\n`)
  gh.write(`reviews/${plusDays(-35).slice(0, 7)}.md`, `---\nperiod: ${plusDays(-35).slice(0, 7)}\n---\n# 复盘\n\n## 事实\n\n月复盘。\n`)
  gh.write(
    DAY_PATH,
    `---\ndate: ${TODAY}\nmood: 7\nenergy: 6\ntags: []\n---\n## 日记\n\n早上去河边跑了五公里，回来把这周的计划理了一遍。\n\n第一次觉得，记录不是负担，而是和自己对话的方式。\n\n## 速记\n\n- 08:12 把复杂的问题拆成最小的事实\n- 13:40 学到：午饭后散步 20 分钟，下午明显更清醒\n- 17:05 投入：英语 1h，读书 1h\n- 21:30 投入：写代码 40min\n`,
  )
  gh.write(
    'todo.md',
    `# 待办\n\n## 收件箱\n\n- [ ] 给妈妈打电话 @${TODAY}\n- [ ] 整理上个月的照片 @${plusDays(-2)}\n- [ ] 换手机壳\n- [ ] 查一下护照有效期\n- [x] 交房租 @${TODAY} ✓${TODAY}\n\n## 读书计划\n\n> 今年读完 24 本\n- [ ] 读完《置身事内》第 3 章 @${TODAY} #阅读\n- [ ] 写《置身事内》读书笔记 @${plusDays(3)}\n- [ ] 选下一本书\n- [x] 读完《人类简史》 ✓${plusDays(-6)}\n- [x] 读完《原则》 ✓${plusDays(-20)}\n\n## 健身\n\n> 每周 3 次，体脂降到 18%\n- [ ] 跑步 5 公里 @${TOMORROW}\n- [ ] 力量训练 @${plusDays(2)}\n- [x] 办健身卡 ✓${plusDays(-3)}\n\n## 春节旅行\n\n> 带爸妈去一趟云南\n- [ ] 定路线 @${plusDays(8)}\n- [ ] 比价机票\n\n## 将来\n\n- [ ] 学一首钢琴曲\n- [ ] 学做一道新菜\n`,
  )
}

// ───── 运行 ─────

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4319', '--strictPort'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'pipe',
})
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
  const errors = []
  page.on('pageerror', (e) => errors.push(e))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(new Error(m.text())))
  return { ctx, page, errors }
}

async function connect(page) {
  await page.goto(BASE)
  await page.waitForURL(/#\/settings/)
  await page.fill('input[placeholder="GitHub 用户名"]', 'me')
  await page.fill('input[type=password]', 'test-token')
  await page.click('button[type=submit]')
  await page.waitForURL((u) => u.hash === '#/')
}

/** 用鼠标模拟滑动一行 */
async function swipe(page, locator, dx) {
  const box = await locator.boundingBox()
  const y = box.y + box.height / 2
  const x = box.x + box.width / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y + 1)
  await page.mouse.up()
}

let passed = 0
const step = async (name, fn) => {
  await fn()
  passed++
  console.log(`  ✓ ${name}`)
}

try {
  if (!ONLY_SHOTS) {
  console.log('功能测试')
  const gh = new FakeGitHub()
  seedV1(gh)
  const { ctx, page, errors } = await newPage(gh, { viewport: { width: 420, height: 860 } })
  const todo = () => gh.read('todo.md') ?? ''
  const day = () => gh.read(DAY_PATH) ?? ''
  const fab = page.locator('button.fab')
  // 弹层可以叠放：总是操作最上面那一个
  const sheet = page.locator('.sheet-root.shown').last()

  await step('错误令牌给出提示', async () => {
    await page.goto(BASE)
    await page.fill('input[placeholder="GitHub 用户名"]', 'me')
    await page.fill('input[type=password]', 'wrong')
    await page.click('button[type=submit]')
    await page.getByText('Bad credentials').waitFor()
  })

  const tab = (name) => page.locator('.tabbar a', { hasText: name }).click()
  const meter = (name) => page.locator('.score-pill', { hasText: name })
  // 速记直接摆在「今天」页上
  const dayNotes = page.locator('.day-notes')
  const noteInput = dayNotes.locator('input[aria-label=速记]')

  await step('连接后进入「今天」，旧版待办自动升级', async () => {
    await connect(page)
    await page.locator('.head h1', { hasText: '今天' }).waitFor()
    await until(() => todo().includes('## 收件箱') && !todo().includes('## 现在'), '迁移')
    assert.equal(todo(), '# 待办\n\n## 收件箱\n\n- [ ] 填写 me.md #life-log\n- [x] 搭建 life-log ✓2026-11-01\n\n## 将来\n\n- [ ] 学钢琴\n')
    assert.ok(gh.puts.some((p) => p.message === '待办：升级格式'))
  })

  await step('＋ 新建：今天的待办出现在「今天」，明天的不出现', async () => {
    await fab.click()
    await sheet.locator('.quick-input').fill('写周报')
    await sheet.locator('.quick-input').press('Enter')
    await sheet.locator('.added li', { hasText: '写周报' }).waitFor()
    await sheet.locator('.attr').first().click()
    await sheet.locator('.when-row', { hasText: '明天' }).click()
    await sheet.locator('.quick-input').fill('跑步')
    await sheet.locator('.quick-input').press('Enter')
    await page.keyboard.press('Escape')
    await until(() => todo().includes(`- [ ] 写周报 @${TODAY}`) && todo().includes(`- [ ] 跑步 @${TOMORROW}`), '写入待办')
    await page.locator('.group .task', { hasText: '写周报' }).waitFor()
    assert.equal(await page.locator('.group .task', { hasText: '跑步' }).count(), 0)
  })

  await step('勾选完成；停留期间再点一次就是反悔', async () => {
    const row = page.locator('.task', { hasText: '写周报' })
    await row.locator('.check').click()
    await until(() => todo().includes(`- [x] 写周报 @${TODAY} ✓${TODAY}`), '完成')
    await row.locator('.check').click()
    await until(() => todo().includes(`- [ ] 写周报 @${TODAY}\n`), '反悔')
    await page.waitForTimeout(2300)
    await page.locator('.task:not(.done)', { hasText: '写周报' }).waitFor()
  })

  await step('左滑改期到明天；右滑完成后淡出，收进「已完成」', async () => {
    await swipe(page, page.locator('.swipe', { hasText: '写周报' }), -160)
    await sheet.locator('.when-row', { hasText: '明天' }).click()
    await until(() => todo().includes(`- [ ] 写周报 @${TOMORROW}`), '改期')
    await fab.click()
    await sheet.locator('.quick-input').fill('倒垃圾')
    await sheet.locator('.quick-input').press('Enter')
    await page.keyboard.press('Escape')
    await page.locator('.swipe', { hasText: '倒垃圾' }).waitFor()
    await page.waitForTimeout(350)
    await swipe(page, page.locator('.swipe', { hasText: '倒垃圾' }), 160)
    await until(() => todo().includes(`- [x] 倒垃圾 @${TODAY} ✓${TODAY}`), '右滑完成')
    await until(async () => (await page.locator('.task', { hasText: '倒垃圾' }).count()) === 0, '淡出')
    await page.locator('.below button', { hasText: '已完成 1 件' }).click()
    await page.locator('.done-group .task', { hasText: '倒垃圾' }).waitFor()
  })

  await step('情绪 / 精力打分', async () => {
    await meter('情绪').click()
    await sheet.locator('.score-grid button', { hasText: /^7$/ }).click()
    await meter('精力').click()
    await sheet.locator('.score-grid button', { hasText: /^5$/ }).click()
    await until(() => /mood: 7\nenergy: 5/.test(day()), 'frontmatter')
    await meter('情绪').locator('b', { hasText: '7' }).waitFor()
    await meter('精力').locator('b', { hasText: '5' }).waitFor()
  })

  await step('日记全屏编辑并自动保存', async () => {
    await page.locator('.journal-card').click()
    await page.waitForURL(/#\/journal\//)
    await page.fill('textarea.journal-area', '今天重新设计了 Life Log。\n\n很开心。')
    await until(() => day().includes('## 日记\n\n今天重新设计了 Life Log。\n\n很开心。\n'), '日记')
    await page.locator('.back').click()
    await page.locator('.journal-card.has .journal-excerpt', { hasText: '今天重新设计了 Life Log。' }).waitFor()
  })

  await step('速记：直接在「今天」页上添加', async () => {
    await noteInput.fill('第一条速记')
    await noteInput.press('Enter')
    await dayNotes.locator('.notes li', { hasText: '第一条速记' }).waitFor()
    await until(() => day().includes('第一条速记'), '速记')
    assert.equal(await noteInput.inputValue(), '', '记完清空，可以接着记')
  })

  await step('另一台设备同时修改：两边内容都保留', async () => {
    gh.write(DAY_PATH, day().replace('## 速记\n', '## 速记\n\n- 00:00 手机上记的\n').replace(/\n\n\n/g, '\n\n'))
    await noteInput.fill('电脑上记的')
    await noteInput.press('Enter')
    await until(() => day().includes('电脑上记的'), '合并')
    assert.ok(day().includes('手机上记的') && day().includes('第一条速记') && day().includes('很开心'))
    await dayNotes.locator('.note-row', { hasText: '手机上记的' }).waitFor()
  })

  await step('速记：点开可以编辑、删除，删除可以撤销', async () => {
    await dayNotes.locator('.note-row', { hasText: '电脑上记的' }).click()
    await sheet.locator('.sheet-head h2', { hasText: /^速记 · \d{2}:\d{2}$/ }).waitFor()
    await sheet.locator('textarea[aria-label=速记内容]').fill('电脑上记的（改过）')
    await sheet.locator('.text-btn', { hasText: '完成' }).click()
    await until(() => /- \d{2}:\d{2} 电脑上记的（改过）\n/.test(day()), '编辑速记')
    await dayNotes.locator('.note-row', { hasText: '电脑上记的（改过）' }).waitFor()

    await dayNotes.locator('.note-row', { hasText: '手机上记的' }).click()
    await sheet.locator('.text-btn.danger', { hasText: '删除' }).click()
    await until(() => !day().includes('手机上记的'), '删除速记')
    assert.ok(day().includes('第一条速记') && day().includes('电脑上记的（改过）'), '其他速记不受影响')
    assert.equal(await dayNotes.locator('.note-row', { hasText: '手机上记的' }).count(), 0)
    await page.locator('.toast button', { hasText: '撤销' }).click()
    await until(() => day().includes('- 00:00 手机上记的'), '撤销删除')
    assert.ok(day().indexOf('手机上记的') < day().indexOf('第一条速记'), '按时间插回原位')
    assert.ok(gh.puts.some((p) => p.message.startsWith('删除速记')), '删除有单独的提交说明')
  })

  await step('离线记录，联网后自动同步', async () => {
    await ctx.setOffline(true)
    await page.waitForTimeout(300)
    await fab.click()
    await sheet.locator('.tabs button', { hasText: '速记' }).click()
    await sheet.locator('.quick-input').fill('地铁里没信号')
    await sheet.locator('.quick-input').press('Enter')
    await until(async () => /离线|待同步/.test((await page.locator('.sync').first().textContent().catch(() => '')) ?? ''), '离线状态')
    assert.ok(!day().includes('地铁里没信号'))
    await dayNotes.locator('.notes li', { hasText: '地铁里没信号' }).waitFor()
    await ctx.setOffline(false)
    await until(() => day().includes('地铁里没信号'), '联网后同步')
  })

  await step('＋ 速记可以选种类：学到 / 问题 / 投入', async () => {
    await fab.click()
    await sheet.locator('.tabs button', { hasText: '速记' }).click()
    await sheet.locator('.kinds .attr', { hasText: '学到' }).click()
    await sheet.locator('.quick-input').fill('先写清楚再动手')
    await sheet.locator('.quick-input').press('Enter')
    await until(() => /- \d{2}:\d{2} 学到：先写清楚再动手\n/.test(day()), '带开头的速记')
    await dayNotes.locator('.note-row', { hasText: '先写清楚再动手' }).locator('.kind.learned', { hasText: '学到' }).waitFor()
    // 投入必须带时长，否则统计不到：不保存，给出提示
    await fab.click()
    await sheet.locator('.tabs button', { hasText: '速记' }).click()
    await sheet.locator('.kinds .attr', { hasText: '投入' }).click()
    await sheet.locator('.quick-input').fill('看了会儿书')
    await sheet.locator('.quick-input').press('Enter')
    await page.locator('.toast.show', { hasText: '才能统计' }).waitFor()
    assert.ok(!day().includes('看了会儿书'))
    await page.keyboard.press('Escape')
  })

  await step('记一笔投入：选名称、点时长，按名称汇总', async () => {
    await dayNotes.locator('.spent-btn').click()
    await sheet.locator('.sheet-head h2', { hasText: '记一笔投入' }).waitFor()
    assert.ok(await sheet.locator('.chip.dur').first().isDisabled(), '没写名称时不能点时长')
    await sheet.locator('input[aria-label=投入的名称]').fill('英语')
    await sheet.locator('.chip.dur', { hasText: '1 小时' }).click()
    await until(() => /- \d{2}:\d{2} 投入：英语 1h\n/.test(day()), '第一笔')
    // 记过的名称变成可以直接点的选项
    await page.keyboard.press('Escape')
    await dayNotes.locator('.spent-btn').click()
    await sheet.locator('.spent-names .chip', { hasText: '英语' }).click()
    await sheet.locator('.chip.dur', { hasText: '30 分' }).click()
    await sheet.locator('input[aria-label=投入的名称]').fill('写代码')
    await sheet.locator('.chip.dur', { hasText: '45 分' }).click()
    await until(() => day().includes('投入：英语 30min') && day().includes('投入：写代码 45min'), '后两笔')
    await sheet.locator('.spent-raw .note-row').nth(2).waitFor()
    await sheet.locator('.text-btn', { hasText: '完成' }).click()
    // 「今天」页上只留一行小结，点开才是明细
    const line = dayNotes.locator('.spent-line')
    await line.locator('.spent-line-total', { hasText: '投入 2.3h' }).waitFor()
    assert.equal(await line.locator('.spent-line-items').innerText(), '英语 1.5h · 写代码 0.8h')
    await line.click()
    await sheet.locator('.spent-raw .note-row').nth(2).waitFor()
    await page.keyboard.press('Escape')
    assert.equal(await dayNotes.locator('.note-row', { hasText: '投入' }).count(), 0, '投入不混在速记里')
  })

  await step('计划：新建项目、加任务、进度饼图更新', async () => {
    await tab('计划')
    await page.locator('.head h1', { hasText: '计划' }).waitFor()
    await page.locator('.main .row', { hasText: '新项目' }).click()
    await sheet.locator('.field-input').first().fill('读书计划')
    await sheet.locator('.field-input').nth(1).fill('今年读完 24 本')
    await sheet.locator('button[type=submit]').click()
    await page.waitForURL(/#\/project\//)
    await page.locator('.add-row.ghost').click()
    const add = page.locator('.add-row input')
    await add.fill('读完《置身事内》')
    await add.press('Enter')
    await add.fill('写读书笔记')
    await add.press('Enter')
    await until(() => todo().includes('## 读书计划\n\n> 今年读完 24 本\n- [ ] 读完《置身事内》\n- [ ] 写读书笔记'), '项目写入')
    await page.locator('.task', { hasText: '读完《置身事内》' }).locator('.check').click()
    await page.locator('.head .pie[aria-label="进度 1/2"]').waitFor()
    await page.locator('.back').click()
    await page.locator('.main .row', { hasText: '读书计划' }).locator('.row-detail', { hasText: '1' }).waitFor()
  })

  await step('点开任务：改文字、排日期、移到项目', async () => {
    await page.locator('.main .row', { hasText: '收件箱' }).click()
    await page.locator('.task', { hasText: '填写 me.md' }).click()
    await sheet.locator('textarea.task-edit').fill('填写 me.md 的今年目标 #life-log')
    await sheet.locator('.attr').first().click()
    await sheet.locator('.when-row', { hasText: '今天' }).click()
    await sheet.locator('.attr').nth(1).click()
    await sheet.locator('.pick-row', { hasText: '读书计划' }).click()
    await page.keyboard.press('Escape')
    await until(() => /## 读书计划[\s\S]*- \[ \] 填写 me\.md 的今年目标 #life-log @\d{4}-\d{2}-\d{2}/.test(todo()), '编辑后的任务')
    assert.ok(!/## 收件箱\n\n- \[ \] 填写/.test(todo()))
  })

  await step('日程：按天分组', async () => {
    await page.locator('.back').click()
    await page.locator('.main .row', { hasText: '日程' }).click()
    await page.locator('.group-label', { hasText: '明天' }).waitFor()
    await page.locator('.task', { hasText: '跑步' }).waitFor()
  })

  await step('速记弹层只有删除和完成，没有「提炼为思想」', async () => {
    await tab('今天')
    await dayNotes.locator('.note-row', { hasText: '第一条速记' }).click()
    await sheet.locator('.text-btn', { hasText: '完成' }).waitFor()
    assert.equal(await sheet.locator('.text-btn', { hasText: '思想' }).count(), 0)
    await sheet.locator('.text-btn', { hasText: '完成' }).click()
  })

  await step('记忆：时间线、按种类看速记、搜索；没有「思想」一栏', async () => {
    await tab('记忆')
    await page.locator('.head h1', { hasText: '记忆' }).waitFor()
    const card = page.locator('.day-card', { hasText: '今天重新设计了 Life Log。' })
    await card.locator('.day-meta', { hasText: '5 条速记 · 投入 2.3h' }).waitFor()
    assert.deepEqual(await card.locator('.day-scores i').allInnerTexts(), ['7', '5'])
    assert.equal(await page.locator('.chips').count(), 0, '时间线上没有筛选条')
    await page.locator('.notes-tabs button', { hasText: '速记' }).click()
    await page.waitForURL(/#\/memory\/notes/)
    await page.locator('.notes li', { hasText: '地铁里没信号' }).waitFor()
    await page.locator('.chips .chip', { hasText: '学到' }).click()
    await page.locator('.notes li', { hasText: '先写清楚再动手' }).waitFor()
    assert.equal(await page.locator('.notes li').count(), 1, '只剩标了「学到」的')
    await page.locator('.notes-tabs button', { hasText: '时间线' }).click()
    await card.click()
    await page.waitForURL((u) => u.hash === `#/day/${TODAY}`)
    await tab('记忆')
    await page.locator('.notes-tabs button', { hasText: '模式' }).waitFor()
    assert.deepEqual(await page.locator('.notes-tabs button').allInnerTexts(), ['时间线', '速记', '模式'])
    // 旧地址不报错，落回时间线；仓库里旧的 thoughts/ 文件不会被搜出来
    await page.goto(BASE + '#/memory/thoughts')
    await card.waitFor()
    await page.fill('.search input', '第一性原理')
    await page.locator('.search-results', { hasText: '没有找到' }).waitFor()
    await page.fill('.search input', '地铁')
    await page.locator('.result', { hasText: '地铁里没信号' }).waitFor()
    await page.fill('.search input', '重新设计')
    await page.locator('.result', { hasText: '日记' }).waitFor()
  })

  await step('每周复盘：先看上周说的下一步，四步走完，生成复盘文件', async () => {
    gh.write(`reviews/${PREV_WEEK}.md`, `---\nperiod: ${PREV_WEEK}\n---\n# 复盘 · ${PREV_WEEK}\n\n## 事实\n\n## 数据\n\n## 模式\n\n## 下一步\n\n- 每天读 20 页\n- [ ] 早睡\n`)
    await tab('复盘')
    await page.locator('.week-card .btn', { hasText: '开始复盘' }).click()
    await page.waitForURL(new RegExp(`#/week/${WEEK}`))
    await page.locator('.main .row', { hasText: '读完《置身事内》' }).waitFor()
    assert.deepEqual(await page.locator('.promised li').allInnerTexts(), ['每天读 20 页', '早睡'])
    await page.locator('.week-page .spent-bars li', { hasText: '英语' }).waitFor()
    await page.locator('.week-page .notes li', { hasText: '先写清楚再动手' }).waitFor()
    await page.locator('.step-actions .btn.primary').click() // → 清理
    await page.locator('.group-label', { hasText: '收件箱' }).waitFor()
    await page.locator('.step-actions .btn.primary').click() // → 反思
    await page.locator('.below .text-btn', { hasText: '带入上周的 2 条下一步' }).click()
    assert.equal(await page.locator('.reflect textarea').nth(0).inputValue(), '- 上周说「每天读 20 页」：\n- 上周说「早睡」：')
    assert.equal(await page.locator('.below .text-btn', { hasText: '带入' }).count(), 0, '带入之后按钮消失')
    await page.locator('.reflect textarea').nth(0).fill('重新设计了 App')
    await page.locator('.reflect textarea').nth(1).fill('专注上午效率高')
    await page.locator('.reflect textarea').nth(2).fill('- 早睡')
    await page.locator('.step-actions .btn.primary').click() // → 计划
    await page.getByText('读完 24 本书').waitFor()
    await page.locator('.pick-item', { hasText: '写读书笔记' }).locator('.chip').first().click()
    await until(() => /- \[ \] 写读书笔记 @\d{4}-\d{2}-\d{2}/.test(todo()), '排进下周')
    await page.locator('.step-actions .btn.primary', { hasText: '完成复盘' }).click()
    await page.waitForURL(/#\/file\/reviews/)
    await until(() => gh.read(`reviews/${WEEK}.md`), '复盘文件')
    const md = gh.read(`reviews/${WEEK}.md`)
    assert.match(md, new RegExp(`^---\\nperiod: ${WEEK}\\n`))
    assert.ok(md.includes('## 事实\n\n重新设计了 App') && md.includes('## 模式\n\n专注上午效率高') && md.includes('## 下一步\n\n- 早睡'))
    assert.ok(/## 数据\n\n- 记录 \d\/7 天/.test(md))
    assert.ok(md.includes('- 投入 2.3h：英语 1.5h、写代码 0.8h'), '数据里有投入')
    await page.locator('.prose', { hasText: '专注上午效率高' }).waitFor()
  })

  await step('复制给 AI', async () => {
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
    await tab('复盘')
    await page.locator('.main .row', { hasText: '复制给 AI' }).click()
    await page.getByText('已复制').waitFor()
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    assert.ok(clip.includes(`帮我复盘 ${WEEK}`) && clip.includes('读完 24 本书') && clip.includes('重新设计了 Life Log'))
    assert.ok(clip.includes('## 上周说的下一步\n- 每天读 20 页\n- 早睡'), '带上了上周的下一步')
  })

  await step('我是谁：分栏填写，只改一栏，旧的空栏目被清掉', async () => {
    await page.locator('.main .row', { hasText: '我是谁' }).click()
    await page.waitForURL(/#\/me$/)
    await page.locator('.head h1', { hasText: '我是谁' }).waitFor()
    await page.locator('.head-sub', { hasText: '已填 0 / 10' }).waitFor()
    // 旧模板里写过字的「今年」保留在「其他」里；空着的「价值观」不显示
    await page.locator('.me-row.plain', { hasText: '读完 24 本书' }).waitFor()
    assert.equal(await page.locator('.me-row', { hasText: '价值观' }).count(), 0)

    await page.locator('.me-row.tap', { hasText: '这学期' }).click()
    await sheet.locator('.sheet-sub', { hasText: '这学期结束时' }).waitFor()
    await sheet.locator('textarea.me-edit').fill('过四级\n做完一个 ops 小项目')
    await sheet.locator('.text-btn', { hasText: '完成' }).click()
    await until(() => gh.read('me.md')?.includes('### 这学期\n\n过四级\n做完一个 ops 小项目\n\n### 每周投入\n\n### 毕业时'), '写入这学期')
    const md = gh.read('me.md')
    assert.match(md, new RegExp(`^---\\nupdated: ${TODAY}\\n---\\n# 我是谁\\n\\n## 现在\\n\\n## 在乎\\n\\n### 让我有劲的\\n`))
    assert.ok(md.includes('## 今年\n\n- 读完 24 本书'), '写过字的旧栏目保留')
    assert.ok(!md.includes('## 价值观'), '空的旧栏目清掉')
    await page.locator('.head-sub', { hasText: '已填 1 / 10' }).waitFor()
    await page.locator('.me-row.tap .me-text', { hasText: '做完一个 ops 小项目' }).waitFor()
  })

  await step('我是谁：仍然可以编辑整页原文', async () => {
    await page.locator('.topbar .text-btn', { hasText: '编辑原文' }).click()
    await page.waitForURL(/#\/file\/me\.md/)
    await page.locator('.topbar .text-btn', { hasText: /^编辑$/ }).click()
    const v = await page.inputValue('textarea.source-input')
    await page.fill('textarea.source-input', v.replace('## 现在\n', '## 现在\n\n在读学生\n'))
    await page.locator('.topbar .text-btn', { hasText: '完成' }).click()
    await until(() => gh.read('me.md')?.includes('## 现在\n\n在读学生\n'), '原文保存')
    await page.locator('.back').click()
    await page.locator('.me-row.tap .me-text', { hasText: '在读学生' }).waitFor()
    await page.locator('.head-sub', { hasText: '已填 2 / 10' }).waitFor()
  })

  await step('每周复盘和「复制给 AI」用新的「这学期」来对照', async () => {
    await page.goto(BASE + `#/week/${WEEK}`)
    await page.locator('.steps-dots button[aria-label=计划]').click()
    await page.locator('.group-label', { hasText: '这学期的方向' }).waitFor()
    await page.getByText('做完一个 ops 小项目').waitFor()
    await page.goto(BASE + '#/review')
    await page.locator('.main .row', { hasText: '我是谁' }).locator('.row-detail', { hasText: '2/10' }).waitFor()
    await page.locator('.main .row', { hasText: '复制给 AI' }).click()
    await page.getByText('已复制').waitFor()
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    assert.ok(clip.includes('和上一周的我比，不和别人比') && clip.includes('还没验证') && clip.includes('### 这学期\n\n过四级'))
  })

  await step('记忆 · 模式：AI 记下的假设，由我裁决', async () => {
    seedMemory(gh)
    await tab('记忆')
    await page.locator('.notes-tabs button', { hasText: '模式' }).click()
    await page.waitForURL(/#\/memory\/patterns/)
    const row = page.locator('.pattern-row', { hasText: '睡够七小时的日子' })
    await row.locator('.status-chip.watching', { hasText: '观察中' }).waitFor()
    await row.click()
    await sheet.locator('.pattern-body', { hasText: '一觉睡到七点' }).waitFor()
    assert.equal(await sheet.locator('.pattern-body a').first().getAttribute('href'), `#/day/${plusDays(-4)}`, '证据链接到那一天')
    await sheet.locator('.verdict-btn', { hasText: '成立' }).click()
    await until(() => gh.read(PATTERNS).includes(`状态：成立 · 支持 3 天 / 反例 1 天 · 主人裁决 ${TODAY}`), '裁决写入')
    assert.ok(gh.read(PATTERNS).includes('## P2 事情一多，先被推掉的是健身\n\n状态：观察中 · 支持 2 天'), '其他模式不动')
    assert.ok(gh.puts.some((p) => p.message === '记忆：模式改为「成立」'))
    await page.keyboard.press('Escape')
    await row.locator('.status-chip.holds', { hasText: '成立' }).waitFor()
    await page.locator('.notes-tabs button', { hasText: '时间线' }).click()
    await page.locator('.main .row', { hasText: '大事记' }).click()
    await page.locator('.head h1', { hasText: '大事记' }).waitFor()
    await page.locator('.prose a[href^="#/day/"]').waitFor()
  })

  await step('AI 的建议：每个 AI 一栏，各划各的，可以撤销', async () => {
    await tab('复盘')
    const advisor = (name) => page.locator('.advisors .row', { hasText: name })
    await advisor('Claude').locator('.row-detail', { hasText: '3 条' }).waitFor()
    await advisor('DeepSeek').locator('.row-detail', { hasText: '2 条' }).waitFor()
    await advisor('Claude').click()
    await page.waitForURL(/#\/advice\/claude/)
    await page.locator('.proposal').nth(2).waitFor()
    assert.equal(await page.locator('.proposal').count(), 3)
    assert.deepEqual(await page.locator('.notes-tabs button').allInnerTexts(), ['Claude 3', 'DeepSeek 2'])
    assert.equal(await page.locator('.proposal .text-btn', { hasText: '写成思想' }).count(), 0)
    await page.locator('.proposal', { hasText: '就解决了一半' }).locator('button[aria-label="划掉第 1 条"]').click()
    await until(() => !gh.read(CLAUDE).includes('就解决了一半'), '划掉')
    assert.ok(gh.read(CLAUDE).includes('4. 「做法 · 借来的」') && gh.read(CLAUDE).includes('   - 或者每次记一条投入。'), '其余建议逐字保留、不重新编号')
    await until(async () => (await page.locator('.proposal').count()) === 2, '列表里少一条')
    await page.locator('.toast button', { hasText: '撤销' }).click()
    await until(() => gh.read(CLAUDE).includes('就解决了一半'), '撤销')
    await page.locator('.proposal').nth(2).waitFor()

    // 换到 DeepSeek 那一栏：划它的，不碰 Claude 的
    const claudeBefore = gh.read(CLAUDE)
    await page.locator('.notes-tabs button', { hasText: 'DeepSeek' }).click()
    await page.waitForURL(/#\/advice\/deepseek/)
    await page.locator('.proposal', { hasText: '睡觉时间固定下来' }).waitFor()
    assert.equal(await page.locator('.proposal').count(), 2)
    await page.locator('button[aria-label="划掉第 1 条"]').click()
    await until(() => !gh.read(DEEPSEEK).includes('睡觉时间固定下来'), '划掉 DeepSeek 的一条')
    assert.ok(gh.read(DEEPSEEK).includes('2. 「读书计划」两周没有勾过任务'))
    assert.equal(gh.read(CLAUDE), claudeBefore, 'Claude 的文件没有被动过')
    await page.locator('.back').click()
    await advisor('DeepSeek').locator('.row-detail', { hasText: '1 条' }).waitFor()
    await advisor('Claude').locator('.row-detail', { hasText: '3 条' }).waitFor()
  })

  await step('复盘主页只留入口：数据和历史复盘各占一页', async () => {
    assert.equal(await page.locator('.main .trend, .main .heat, .main .stats').count(), 0, '图表不在主页上')
    await page.locator('.main .row', { hasText: '数据' }).locator('.row-detail', { hasText: /记录 \d\/7 天 · 投入 2\.3h/ }).waitFor()
    await page.locator('.main .row', { hasText: '数据' }).click()
    await page.waitForURL(/#\/stats/)
    await page.locator('.stats-page .spent-bars li', { hasText: '英语' }).waitFor()
    await page.locator('.stats-page .trend').waitFor()
    await page.locator('.stats-page .heat').waitFor()
    await page.locator('.back').click()
    await page.locator('.main .row', { hasText: '历史复盘' }).locator('.row-detail', { hasText: '2 篇' }).waitFor()
    await page.locator('.main .row', { hasText: '历史复盘' }).click()
    await page.waitForURL(/#\/history/)
    await page.locator('.head h1', { hasText: '历史复盘' }).waitFor()
    assert.equal(await page.locator('.page .body .row').count(), 2)
    await page.locator('.back').click()
    await page.locator('.main .row', { hasText: '复制给 AI' }).click()
    await page.getByText('已复制').waitFor()
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    assert.ok(clip.includes('## 请这样回答') && clip.includes('### 每天\n\n| 日期 | 周 |') && clip.includes('### 和上周比') && clip.includes('## 大事记'), '复盘上下文有每天的数据、和上周比、大事记、回答格式')
    assert.ok(clip.includes('## 已经提过、还在等我决定的建议（不要重复）') && /\n- Claude 第 \d+ 条：/.test(clip) && /\n- DeepSeek 第 \d+ 条：/.test(clip), '带上各个 AI 还挂着的建议')
    assert.ok(clip.includes('### P1 睡够七小时的日子，精力分更高（成立）') && clip.includes('### P2 事情一多，先被推掉的是健身（观察中）'), '复盘上下文带上模式账本')
  })

  await step('每周目标：在「数据」里设，按名称对上这一周实际的投入', async () => {
    await page.goto(BASE + '#/stats')
    await page.locator('.stats-page .group-empty', { hasText: '给每科定一个每周目标' }).waitFor()
    await page.locator('.label-btn', { hasText: '设目标' }).click()
    await sheet.locator('.sheet-head h2', { hasText: '每周目标' }).waitFor()
    // 记过投入的名称可以直接点；也可以自己写一项
    await sheet.locator('.target-add .chip', { hasText: '英语' }).click()
    await sheet.locator('input[aria-label="英语每周几小时"]').fill('3')
    await sheet.locator('.target-add .chip', { hasText: '加一项' }).click()
    await sheet.locator('.target-row').nth(1).locator('input').first().fill('数学')
    await sheet.locator('input[aria-label="数学每周几小时"]').fill('10')
    await sheet.locator('.quick-bottom .hint', { hasText: '一周合计 13h' }).waitFor()
    await sheet.locator('.text-btn', { hasText: '完成' }).click()
    await until(() => gh.read('me.md')?.includes('### 每周投入\n\n- 英语 3h\n- 数学 10h\n\n### 毕业时'), '目标写进 me.md')
    const hours = (name) => page.locator('.stats-page .target-bars li', { hasText: name }).locator('.spent-hours').innerText()
    await page.locator('.stats-page .target-bars li').nth(1).waitFor()
    assert.equal((await hours('英语')).replace(/\s+/g, ' '), '1.5h / 3h')
    assert.equal((await hours('数学')).replace(/\s+/g, ' '), '0h / 10h')
    assert.equal(await page.locator('.label-btn').innerText(), '改目标')
    // 学习时间：本周每天一根竖条（今天那根标出来）、每科学了几天、最近 8 周；热力图默认看投入
    const todayBar = page.locator('.stats-page .colbars[aria-label="本周每天的投入"] .colbar.on')
    assert.equal(await todayBar.locator('.colbar-num').innerText(), '2.3h')
    assert.equal(await page.locator('.stats-page .colbars[aria-label="本周每天的投入"] .colbar').count(), 7)
    await page.locator('.stats-page .study-line', { hasText: /日均 [\d.]+h · 1\/\d 天有投入/ }).waitFor()
    assert.match((await page.locator('.stats-page .spent-bars:not(.target-bars) li', { hasText: '英语' }).locator('.spent-hours').innerText()).replace(/\s+/g, ' '), /^1\.5h · 1 天$/)
    assert.equal(await page.locator('.stats-page .colbars[aria-label="最近 8 周每周的投入"] .colbar').count(), 8)
    assert.equal(await page.locator('.stats-page .colbars[aria-label="最近 8 周每周的投入"] .colbar.on .colbar-num').innerText(), '2.3h')
    await page.locator('.stats-page .heat .cell.today.val.spent').waitFor()
    assert.equal(await page.locator('.stats-page .heat .cell.today').getAttribute('aria-label'), `${TODAY} 投入 2.3h`)
    await page.locator('.stats-page .row-label-bar .tabs button', { hasText: '情绪' }).click()
    await page.locator('.stats-page .heat .cell.today.val.mood').waitFor()
    // 「今天」页只多一行；「我是谁」里点开的是同一个弹层；每周复盘的回顾里也有
    await page.goto(BASE + '#/')
    await until(async () => (await dayNotes.locator('.target-line .spent-line-items').innerText().catch(() => '')) === '英语 1.5h/3h · 数学 0h/10h', '今天页的本周目标')
    await page.goto(BASE + '#/me')
    await page.locator('.head-sub', { hasText: '已填 2 / 10' }).waitFor()
    await page.locator('.me-row.tap', { hasText: '每周投入' }).click()
    await sheet.locator('.target-row').nth(1).waitFor()
    assert.equal(await sheet.locator('.target-row').count(), 2)
    await sheet.locator('button[aria-label="去掉数学"]').click()
    await sheet.locator('.text-btn', { hasText: '完成' }).click()
    await until(() => gh.read('me.md')?.includes('### 每周投入\n\n- 英语 3h\n\n### 毕业时'), '去掉一项')
    await page.goto(BASE + `#/week/${WEEK}`)
    await page.locator('.target-bars li', { hasText: '英语' }).waitFor()
    assert.equal(await page.locator('.target-bars li').count(), 1)
  })

  await step('计时：开始、结束，记成一笔投入；撤销、放弃、忘了结束', async () => {
    await page.goto(BASE + '#/')
    const card = page.locator('.timer-card')
    await dayNotes.locator('.spent-btn').click()
    assert.ok(await sheet.locator('.timer-start').isDisabled(), '没选名称不能开始')
    await sheet.locator('.spent-names .chip', { hasText: '英语' }).click()
    await sheet.locator('.timer-start').click()
    await card.locator('.timer-name', { hasText: '英语' }).waitFor()
    // 相当于一小时前开始、中间暂停过 13 分钟：算 47 分钟。关掉页面再回来，计时还在走
    await page.evaluate(() => {
      const t = JSON.parse(localStorage.getItem('ll.timer'))
      localStorage.setItem('ll.timer', JSON.stringify({ ...t, start: t.start - 60 * 60000, gap: 13 * 60000 }))
    })
    await page.reload()
    await card.locator('.timer-clock', { hasText: /^47:\d\d$/ }).waitFor()
    // 暂停时钟不走；别的页面上「今天」那一格有个小点
    await card.locator('.text-btn', { hasText: '暂停' }).click()
    await card.locator('.timer-since', { hasText: '已暂停' }).waitFor()
    const frozen = await card.locator('.timer-clock').innerText()
    await page.waitForTimeout(1300)
    assert.equal(await card.locator('.timer-clock').innerText(), frozen, '暂停后时钟还在走')
    await tab('计划')
    await page.locator('.tabbar .tab-dot.paused').waitFor()
    await tab('今天')
    await card.locator('.text-btn', { hasText: '继续' }).click()
    await card.locator('.timer-since', { hasText: '开始' }).waitFor()
    await card.locator('.timer-clock', { hasText: /^47:\d\d$/ }).waitFor()
    await dayNotes.locator('.spent-btn').click()
    await sheet.locator('.timer-note', { hasText: '正在给「英语」计时' }).waitFor()
    await page.keyboard.press('Escape')
    await card.locator('.btn', { hasText: '结束并记下' }).click()
    await until(() => day().includes('投入：英语 47min'), '记成一笔投入')
    await page.getByText('已记下 英语 47 分钟').waitFor()
    assert.equal(await card.count(), 0)
    // 撤销：删掉那一笔，接着计时
    await page.locator('.toast button', { hasText: '撤销' }).click()
    await until(() => !day().includes('47min'), '撤销后那一笔没了')
    await card.locator('.timer-clock', { hasText: /^47:\d\d$/ }).waitFor()
    await card.locator('.text-btn', { hasText: '放弃' }).click()
    await until(async () => (await card.count()) === 0, '放弃后卡片消失')
    assert.equal(await page.evaluate(() => localStorage.getItem('ll.timer')), null)
    // 忘了结束（过了 13 小时）：不直接记，先问实际学了多久
    await page.evaluate(() => localStorage.setItem('ll.timer', JSON.stringify({ name: '数学', start: Date.now() - 13 * 3600e3 })))
    await page.reload()
    await card.locator('.btn', { hasText: '结束并记下' }).click()
    await sheet.locator('.sheet-head h2', { hasText: '这次学了多久' }).waitFor()
    await sheet.locator('.sheet-sub', { hasText: '已经过了 13 小时' }).waitFor()
    await sheet.locator('input[aria-label=实际学了多少分钟]').fill('90')
    await sheet.locator('.text-btn', { hasText: '记下' }).click()
    await until(() => day().includes('投入：数学 1.5h'), '按填的时长记')
    assert.ok(!day().includes('780min'))
    assert.equal(await card.count(), 0)
  })

  await step('手机上切换「待办 / 速记」：焦点留在输入框，弹层高度不变', async () => {
    const gh2 = new FakeGitHub()
    seedV1(gh2)
    const { ctx: c2, page: p2, errors: e2 } = await newPage(gh2, { ...devices['Pixel 7'] })
    await connect(p2)
    await p2.locator('button.fab').tap()
    const s2 = p2.locator('.sheet-root.shown').last()
    const input = s2.locator('.quick-input')
    await until(() => input.evaluate((el) => el === document.activeElement), '自动聚焦')
    await input.fill('先打几个字')
    const before = (await s2.locator('.sheet').boundingBox()).height
    const focused = () => input.evaluate((el) => el === document.activeElement)
    // 键盘「跳」= 输入框先失焦（键盘收起）再聚焦（键盘弹出）。只看最后的状态不够，要数失焦次数
    await input.evaluate((el) => {
      ;window.__blurs = 0
      el.addEventListener('blur', () => window.__blurs++)
    })
    await s2.locator('.tabs button', { hasText: '速记' }).tap()
    assert.equal(await p2.evaluate(() => window.__blurs), 0, '切到速记时输入框失焦了（键盘会收起再弹出）')
    await s2.locator('.kinds .attr', { hasText: '学到' }).tap()
    assert.equal(await p2.evaluate(() => window.__blurs), 0, '选种类时输入框失焦了')
    assert.equal(await s2.locator('.kinds .attr', { hasText: '学到' }).getAttribute('aria-pressed'), 'true')
    assert.ok(await focused(), '切到速记后焦点还在输入框')
    assert.equal(await input.inputValue(), '先打几个字', '已输入的字还在')
    const after = (await s2.locator('.sheet').boundingBox()).height
    assert.ok(Math.abs(after - before) <= 2, `弹层高度变化 ${before} → ${after}`)
    await s2.locator('.tabs button', { hasText: '待办' }).tap()
    assert.equal(await p2.evaluate(() => window.__blurs), 0, '切回待办时输入框失焦了')
    assert.ok(await focused(), '切回待办后焦点还在输入框')
    assert.equal(await input.getAttribute('enterkeyhint'), 'done')
    assert.deepEqual(e2, [])
    await c2.close()
  })

  await step('刷新后数据来自缓存且一致', async () => {
    await page.goto(BASE + '#/')
    await page.locator('.journal-card.has').waitFor()
    await dayNotes.locator('.note-row').nth(4).waitFor()
    assert.equal(await dayNotes.locator('.note-row').count(), 5)
    await dayNotes.locator('.spent-line:not(.target-line)', { hasText: '英语 1.5h' }).waitFor()
  })

  assert.deepEqual(errors, [], '页面没有报错')
  assert.ok(gh.puts.every((p) => p.message), '每次提交都有说明')
  console.log(`  提交记录（${gh.puts.length}）：${[...new Set(gh.puts.map((p) => p.message))].join(' / ')}`)
  await ctx.close()
  }

  if (BOARD) {
    // 背景深浅对比：同一个「今天」页，只换底色
    console.log('对比图')
    mkdirSync(new URL('./shots', import.meta.url), { recursive: true })
    const sample = new FakeGitHub()
    seedSample(sample)
    const shot = (n) => new URL(`./shots/board-${n}.png`, import.meta.url).pathname
    const variants = [
      ['a', 'light', ':root{--bg:#F1F3F6;--side:#E9ECF0}'],
      ['b', 'light', ''],
      ['c', 'light', ':root{--bg:#DDE3EB;--side:#D3DAE4}'],
      ['dark', 'dark', ''],
    ]
    for (const [n, scheme, css] of variants) {
      const { ctx: c, page: p, errors: errs } = await newPage(sample, { ...devices['Pixel 7'], colorScheme: scheme })
      await connect(p)
      if (css) await p.addStyleTag({ content: css })
      await p.waitForTimeout(2600) // 等「已连接」提示消失
      await p.screenshot({ path: shot(`today-${n}`) })
      if (n === 'b' || n === 'dark') {
        await p.goto(BASE + '#/plan')
        await p.waitForTimeout(700)
        await p.screenshot({ path: shot(`plan-${n}`) })
        await p.goto(BASE + `#/project/${encodeURIComponent('读书计划')}`)
        await p.waitForTimeout(700)
        await p.screenshot({ path: shot(`project-${n}`) })
        await p.goto(BASE + '#/')
        await p.waitForTimeout(500)
        await p.locator('button.fab').click()
        await p.waitForTimeout(450)
        await p.screenshot({ path: shot(`capture-${n}`) })
      }
      assert.deepEqual(errs, [], `${n} 页面没有报错`)
      await c.close()
    }
    console.log('  → tests/shots/board-*.png')
  } else if (SHOTS) {
    console.log('截图')
    mkdirSync(new URL('./shots', import.meta.url), { recursive: true })
    const sample = new FakeGitHub()
    seedSample(sample)
    const targets = [
      ['phone', { ...devices['Pixel 7'] }],
      ['desktop', { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 }],
    ]
    const pages = [
      ['today', '#/'],
      ['plan', '#/plan'],
      ['project', `#/project/${encodeURIComponent('读书计划')}`],
      ['inbox', `#/project/${encodeURIComponent('收件箱')}`],
      ['journal', `#/journal/${TODAY}`],
      ['upcoming', '#/upcoming'],
      ['memory', '#/memory'],
      ['memory-notes', '#/memory/notes'],
      ['memory-patterns', '#/memory/patterns'],
      ['review', '#/review'],
      ['stats', '#/stats'],
      ['advice', '#/advice/claude'],
      ['advice-deepseek', '#/advice/deepseek'],
      ['me', '#/me'],
      ['week', `#/week/${WEEK}`],
    ]
    for (const [name, opts] of targets)
      for (const scheme of ['light', 'dark']) {
        const { ctx: c, page: p, errors: errs } = await newPage(sample, { ...opts, colorScheme: scheme })
        await connect(p)
        // 「今天」页上有一段正在走的计时
        await p.evaluate(() => localStorage.setItem('ll.timer', JSON.stringify({ name: '英语', start: Date.now() - 47 * 60000 - 12000 })))
        await p.reload()
        for (const [tab, hash] of pages) {
          await p.goto(BASE + hash)
          await p.waitForTimeout(tab === 'review' || tab === 'stats' || tab.startsWith('memory') || tab.startsWith('advice') ? 1200 : 600)
          const [sw, iw] = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth])
          assert.ok(sw <= iw, `${name} ${tab} 横向溢出：${sw} > ${iw}`)
          await p.screenshot({ path: new URL(`./shots/${name}-${scheme}-${tab}.png`, import.meta.url).pathname, fullPage: name === 'desktop' })
        }
        await p.goto(BASE + '#/')
        await p.waitForTimeout(500)
        await p.locator('button.fab').click()
        await p.waitForTimeout(450)
        await p.screenshot({ path: new URL(`./shots/${name}-${scheme}-capture.png`, import.meta.url).pathname })
        await p.locator('.attr').first().click()
        await p.waitForTimeout(250)
        await p.screenshot({ path: new URL(`./shots/${name}-${scheme}-when.png`, import.meta.url).pathname })
        await p.keyboard.press('Escape')
        await p.waitForTimeout(300)
        await p.locator('button.fab').click()
        await p.locator('.sheet-root.shown').last().locator('.tabs button', { hasText: '速记' }).click()
        await p.waitForTimeout(450)
        await p.screenshot({ path: new URL(`./shots/${name}-${scheme}-capture-note.png`, import.meta.url).pathname })
        await p.keyboard.press('Escape')
        await p.waitForTimeout(300)
        await p.locator('.day-notes .spent-btn').click()
        await p.waitForTimeout(450)
        await p.locator('.sheet-root.shown').last().locator('.spent-names .chip').first().click()
        await p.waitForTimeout(200)
        await p.screenshot({ path: new URL(`./shots/${name}-${scheme}-spent.png`, import.meta.url).pathname })
        await p.keyboard.press('Escape')
        await p.waitForTimeout(300)
        await p.locator('.day-notes .note-row').first().click()
        await p.waitForTimeout(450)
        await p.screenshot({ path: new URL(`./shots/${name}-${scheme}-note.png`, import.meta.url).pathname })
        await p.keyboard.press('Escape')
        await p.waitForTimeout(300)
        await p.goto(BASE + '#/memory/patterns')
        await p.waitForTimeout(900)
        await p.locator('.pattern-row').first().click()
        await p.waitForTimeout(450)
        await p.screenshot({ path: new URL(`./shots/${name}-${scheme}-pattern.png`, import.meta.url).pathname })
        await p.keyboard.press('Escape')
        await p.waitForTimeout(300)
        await p.goto(BASE + '#/')
        await p.waitForTimeout(500)
        await p.goto(BASE + '#/me')
        await p.waitForTimeout(600)
        await p.evaluate(() => scrollTo(0, document.body.scrollHeight))
        await p.waitForTimeout(400)
        await p.screenshot({ path: new URL(`./shots/${name}-${scheme}-me-2.png`, import.meta.url).pathname })
        await p.evaluate(() => scrollTo(0, 0))
        await p.waitForTimeout(300)
        await p.locator('.me-row.tap', { hasText: '耗我的' }).click()
        await p.waitForTimeout(450)
        await p.screenshot({ path: new URL(`./shots/${name}-${scheme}-me-edit.png`, import.meta.url).pathname })
        await p.keyboard.press('Escape')
        await p.waitForTimeout(300)
        // 「今天」页的本周目标一行；计时中的投入弹层；每周目标弹层
        await p.goto(BASE + '#/')
        await p.waitForTimeout(500)
        await p.locator('.day-notes').scrollIntoViewIfNeeded()
        await p.screenshot({ path: new URL(`./shots/${name}-${scheme}-today-notes.png`, import.meta.url).pathname })
        await p.locator('.day-notes .spent-btn').click()
        await p.waitForTimeout(450)
        await p.screenshot({ path: new URL(`./shots/${name}-${scheme}-spent-timing.png`, import.meta.url).pathname })
        await p.keyboard.press('Escape')
        await p.waitForTimeout(300)
        await p.goto(BASE + '#/stats')
        await p.locator('.label-btn').click()
        await p.waitForTimeout(450)
        await p.screenshot({ path: new URL(`./shots/${name}-${scheme}-targets.png`, import.meta.url).pathname })
        await p.keyboard.press('Escape')
        await p.waitForTimeout(300)
        assert.deepEqual(errs, [], `${name} ${scheme} 页面没有报错`)
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
