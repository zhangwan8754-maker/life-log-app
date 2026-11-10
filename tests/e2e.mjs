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
    `---\nupdated: ${TODAY}\n---\n# 我是谁\n\n## 现在\n\n在读学生，大三，计算机专业，在上海。\n正在学运维和英语。\n\n## 在乎\n\n### 让我有劲的\n\n把一件事从头搭起来；看到设计得很美的东西。\n\n### 耗我的\n\n### 好的一天\n\n睡够了，学了一点新东西，和在乎的人说了话。\n\n## 方向\n\n### 这学期\n\n- 过英语六级\n- 做完一个能上线的小项目\n\n### 毕业时\n\n### 更远\n\n## 做法\n\n### 验证过的\n\n### 借来的\n\n「慢即是快」——还没试过，先记在这。\n\n## 还没想清楚\n`,
  )
  let r = 7
  const rnd = () => ((r = (r * 9301 + 49297) % 233280), r / 233280)
  const notes = ['散步时想清楚了下周的优先级', '读到一句话：慢即是快', '和朋友聊了很久', '把复杂问题拆小，立刻轻松很多', '午后犯困，下次少吃点']
  for (let i = 100; i >= 1; i--) {
    if (rnd() < 0.18) continue
    const date = plusDays(-i)
    const mood = Math.max(1, Math.min(10, Math.round(6 + Math.sin(i / 9) * 2 + (rnd() - 0.5) * 3)))
    const energy = Math.max(1, Math.min(10, Math.round(mood + (rnd() - 0.5) * 4)))
    gh.write(
      `days/${date.slice(0, 4)}/${date}.md`,
      `---\ndate: ${date}\nmood: ${mood}\nenergy: ${energy}\ntags: []\n---\n## 日记\n\n天气不错，完成了计划里的大部分事情。\n\n## 速记\n\n- 09:${pad(i % 60)} ${notes[i % notes.length]}\n`,
    )
  }
  gh.write(
    DAY_PATH,
    `---\ndate: ${TODAY}\nmood: 7\nenergy: 6\ntags: []\n---\n## 日记\n\n早上去河边跑了五公里，回来把这周的计划理了一遍。\n\n第一次觉得，记录不是负担，而是和自己对话的方式。\n\n## 速记\n\n- 08:12 把复杂的问题拆成最小的事实\n- 13:40 午饭后散步 20 分钟，下午明显更清醒\n`,
  )
  gh.write(
    'todo.md',
    `# 待办\n\n## 收件箱\n\n- [ ] 给妈妈打电话 @${TODAY}\n- [ ] 整理上个月的照片 @${plusDays(-2)}\n- [ ] 换手机壳\n- [ ] 查一下护照有效期\n- [x] 交房租 @${TODAY} ✓${TODAY}\n\n## 读书计划\n\n> 今年读完 24 本\n- [ ] 读完《置身事内》第 3 章 @${TODAY} #阅读\n- [ ] 写《置身事内》读书笔记 @${plusDays(3)}\n- [ ] 选下一本书\n- [x] 读完《人类简史》 ✓${plusDays(-6)}\n- [x] 读完《原则》 ✓${plusDays(-20)}\n\n## 健身\n\n> 每周 3 次，体脂降到 18%\n- [ ] 跑步 5 公里 @${TOMORROW}\n- [ ] 力量训练 @${plusDays(2)}\n- [x] 办健身卡 ✓${plusDays(-3)}\n\n## 春节旅行\n\n> 带爸妈去一趟云南\n- [ ] 定路线 @${plusDays(8)}\n- [ ] 比价机票\n\n## 将来\n\n- [ ] 学一首钢琴曲\n- [ ] 学做一道新菜\n`,
  )
  gh.write('thoughts/慢即是快.md', `---\ncreated: ${plusDays(-5)}\ntags: [方法, 节奏]\nfrom: \n---\n# 慢即是快\n\n急着推进时最容易返工。先花十分钟把问题写清楚，往往比直接动手省下一小时。\n`)
  gh.write('thoughts/能量管理.md', `---\ncreated: ${plusDays(-12)}\ntags: [精力]\nfrom: \n---\n# 能量管理比时间管理更重要\n\n上午的两小时是一天里最清醒的时候，留给最难的事；会议和杂事放到下午。\n`)
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
  const status = (name) => page.locator('.status button', { hasText: name })
  const openNotes = async () => {
    await status('速记').click()
    await sheet.locator('.sheet-head h2', { hasText: '速记' }).waitFor()
  }

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
    await status('情绪').click()
    await sheet.locator('.score-grid button', { hasText: /^7$/ }).click()
    await status('精力').click()
    await sheet.locator('.score-grid button', { hasText: /^5$/ }).click()
    await until(() => /mood: 7\nenergy: 5/.test(day()), 'frontmatter')
    await status('情绪').locator('b', { hasText: '7' }).waitFor()
  })

  await step('日记全屏编辑并自动保存', async () => {
    await status('日记').click()
    await page.waitForURL(/#\/journal\//)
    await page.fill('textarea.journal-area', '今天重新设计了 Life Log。\n\n很开心。')
    await until(() => day().includes('## 日记\n\n今天重新设计了 Life Log。\n\n很开心。\n'), '日记')
    await page.locator('.back').click()
    await page.locator('.status button.has', { hasText: '日记' }).waitFor()
  })

  await step('速记：在今天的速记弹层里添加', async () => {
    await openNotes()
    const input = sheet.locator('input[aria-label=速记]')
    await input.fill('第一条速记')
    await input.press('Enter')
    await sheet.locator('.notes li', { hasText: '第一条速记' }).waitFor()
    await until(() => day().includes('第一条速记'), '速记')
  })

  await step('另一台设备同时修改：两边内容都保留', async () => {
    gh.write(DAY_PATH, day().replace('## 速记\n', '## 速记\n\n- 07:00 手机上记的\n').replace(/\n\n\n/g, '\n\n'))
    const input = sheet.locator('input[aria-label=速记]')
    await input.fill('电脑上记的')
    await input.press('Enter')
    await until(() => day().includes('电脑上记的'), '合并')
    assert.ok(day().includes('手机上记的') && day().includes('第一条速记') && day().includes('很开心'))
    await page.keyboard.press('Escape')
  })

  await step('速记：点开可以编辑、删除，删除可以撤销', async () => {
    await openNotes()
    await sheet.locator('.note-row', { hasText: '电脑上记的' }).click()
    await sheet.locator('.sheet-head h2', { hasText: /^速记 · \d{2}:\d{2}$/ }).waitFor()
    await sheet.locator('textarea[aria-label=速记内容]').fill('电脑上记的（改过）')
    await sheet.locator('.text-btn', { hasText: '完成' }).click()
    await until(() => /- \d{2}:\d{2} 电脑上记的（改过）\n/.test(day()), '编辑速记')
    await sheet.locator('.note-row', { hasText: '电脑上记的（改过）' }).waitFor()

    await sheet.locator('.note-row', { hasText: '手机上记的' }).click()
    await sheet.locator('.text-btn.danger', { hasText: '删除' }).click()
    await until(() => !day().includes('手机上记的'), '删除速记')
    assert.ok(day().includes('第一条速记') && day().includes('电脑上记的（改过）'), '其他速记不受影响')
    assert.equal(await sheet.locator('.note-row', { hasText: '手机上记的' }).count(), 0)
    await page.locator('.toast button', { hasText: '撤销' }).click()
    await until(() => day().includes('- 07:00 手机上记的'), '撤销删除')
    assert.ok(day().indexOf('手机上记的') < day().indexOf('第一条速记'), '按时间插回原位')
    assert.ok(gh.puts.some((p) => p.message.startsWith('删除速记')), '删除有单独的提交说明')
    await page.keyboard.press('Escape')
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
    await openNotes()
    await sheet.locator('.notes li', { hasText: '地铁里没信号' }).waitFor()
    await page.keyboard.press('Escape')
    await ctx.setOffline(false)
    await until(() => day().includes('地铁里没信号'), '联网后同步')
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

  await step('从速记提炼为思想', async () => {
    await tab('今天')
    await openNotes()
    await sheet.locator('.note-row', { hasText: '第一条速记' }).click()
    await sheet.locator('.text-btn', { hasText: '提炼为思想' }).click()
    await page.waitForURL(/#\/thought\/new/)
    assert.equal(await page.inputValue('.body-input'), '第一条速记')
    await page.fill('.title-input', '记录本身就是思考')
    await page.fill('.tags-input', '方法 记录')
    await until(() => gh.read('thoughts/记录本身就是思考.md'), '思想文件')
    const md = gh.read('thoughts/记录本身就是思考.md')
    assert.match(md, new RegExp(`created: ${TODAY}\\ntags: \\[方法, 记录\\]\\nfrom: ${TODAY}`))
    assert.ok(md.includes('# 记录本身就是思考\n\n第一条速记'))
    await page.locator('.topbar .text-btn', { hasText: '完成' }).click()
    await page.locator('.prose', { hasText: '第一条速记' }).waitFor()
  })

  await step('笔记：思想列表、速记、搜索', async () => {
    await tab('笔记')
    await page.locator('.thought-row', { hasText: '记录本身就是思考' }).waitFor()
    await page.locator('.thought-row', { hasText: '第一性原理' }).waitFor()
    await page.locator('.notes-tabs button', { hasText: '速记' }).click()
    await page.locator('.notes li', { hasText: '地铁里没信号' }).waitFor()
    await page.fill('.search input', '地铁')
    await page.locator('.result', { hasText: '地铁里没信号' }).waitFor()
    await page.fill('.search input', '重新设计')
    await page.locator('.result', { hasText: '日记' }).waitFor()
  })

  await step('每周复盘：四步走完，生成复盘文件', async () => {
    await tab('复盘')
    await page.locator('.week-card .btn', { hasText: '开始复盘' }).click()
    await page.waitForURL(new RegExp(`#/week/${WEEK}`))
    await page.locator('.main .row', { hasText: '读完《置身事内》' }).waitFor()
    await page.locator('.step-actions .btn.primary').click() // → 清理
    await page.locator('.group-label', { hasText: '收件箱' }).waitFor()
    await page.locator('.step-actions .btn.primary').click() // → 反思
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
    await page.locator('.prose', { hasText: '专注上午效率高' }).waitFor()
  })

  await step('复制给 AI', async () => {
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
    await tab('复盘')
    await page.locator('.main .row', { hasText: '复制给 AI' }).click()
    await page.getByText('已复制').waitFor()
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    assert.ok(clip.includes(`帮我复盘 ${WEEK}`) && clip.includes('读完 24 本书') && clip.includes('重新设计了 Life Log'))
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
    await until(() => gh.read('me.md')?.includes('### 这学期\n\n过四级\n做完一个 ops 小项目\n\n### 毕业时'), '写入这学期')
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
    assert.ok(clip.includes('和我自己比，不和别人比') && clip.includes('还没验证') && clip.includes('### 这学期\n\n过四级'))
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
    await page.locator('.status button.has', { hasText: '日记' }).waitFor()
    await page.locator('.status button', { hasText: '4 条速记' }).waitFor()
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
      ['notes', '#/notes'],
      ['review', '#/review'],
      ['me', '#/me'],
      ['week', `#/week/${WEEK}`],
    ]
    for (const [name, opts] of targets)
      for (const scheme of ['light', 'dark']) {
        const { ctx: c, page: p, errors: errs } = await newPage(sample, { ...opts, colorScheme: scheme })
        await connect(p)
        for (const [tab, hash] of pages) {
          await p.goto(BASE + hash)
          await p.waitForTimeout(tab === 'review' || tab === 'notes' ? 1200 : 600)
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
        await p.locator('.status button', { hasText: '速记' }).click()
        await p.waitForTimeout(450)
        await p.screenshot({ path: new URL(`./shots/${name}-${scheme}-notes.png`, import.meta.url).pathname })
        await p.locator('.sheet-root.shown').last().locator('.note-row').first().click()
        await p.waitForTimeout(450)
        await p.screenshot({ path: new URL(`./shots/${name}-${scheme}-note.png`, import.meta.url).pathname })
        await p.keyboard.press('Escape')
        await p.keyboard.press('Escape')
        await p.waitForTimeout(300)
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
