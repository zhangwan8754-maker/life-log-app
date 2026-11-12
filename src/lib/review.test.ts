import { describe, expect, it } from 'vitest'
import { aiPrompt, parseReview, reviewMarkdown, weekFromId, weekOf, weekStats } from './review'

const day = (date: string, mood: number | '', energy: number | '', notes: string[] = [], journal = '') =>
  `---\ndate: ${date}\nmood: ${mood}\nenergy: ${energy}\ntags: []\n---\n## 日记\n\n${journal}\n\n## 速记\n\n${notes.map((n) => `- 09:00 ${n}`).join('\n')}\n`

const todo = `# 待办\n\n## 收件箱\n\n- [ ] 逾期的 @2026-11-01\n- [x] 本周完成 ✓2026-11-03\n- [x] 上周完成 ✓2026-10-30\n\n## 读书\n\n> 24 本\n- [ ] 读完 @2026-11-10\n\n## 将来\n`

const days: Record<string, string> = {
  '2026-11-02': day('2026-11-02', 6, 5, ['a', 'b'], '周一跑步'),
  '2026-11-04': day('2026-11-04', 8, '', ['c']),
}

describe('周', () => {
  it('ISO 周范围从周一到周日', () => {
    expect(weekOf('2026-11-05')).toMatchObject({ id: '2026-W45', week: 45, from: '2026-11-02', to: '2026-11-08' })
    expect(weekOf('2026-11-02').from).toBe('2026-11-02')
    expect(weekOf('2026-11-08').from).toBe('2026-11-02')
    expect(weekFromId('2026-W45')?.from).toBe('2026-11-02')
    expect(weekFromId('2026-W01')?.from).toBe('2025-12-29')
    expect(weekFromId('2026-W53')?.id).toBe('2026-W53')
    expect(weekFromId('坏的')).toBeNull()
  })
})

describe('统计与复盘文件', () => {
  const r = weekOf('2026-11-05')
  const s = weekStats(r, (d) => days[d], todo, '2026-11-05')

  it('统计', () => {
    expect(s).toMatchObject({ daysLogged: 2, moodAvg: '7.0', energyAvg: '5.0', notes: 3, open: 2 })
    expect(s.completed.map((t) => t.text)).toEqual(['本周完成'])
    expect(s.overdue.map((t) => t.text)).toEqual(['逾期的'])
    expect(s.mood).toEqual([6, null, 8, null, null, null, null])
  })

  it('生成、再读回、再次保存时保留其余内容', () => {
    const md = reviewMarkdown(r, s, { facts: '跑了两次步', patterns: '睡够精力好', next: '- 早睡' })
    expect(md).toMatch(/^---\nperiod: 2026-W45\nfrom: 2026-11-02\nto: 2026-11-08\n---\n# 复盘 · 2026-W45\n/)
    expect(md).toContain('- 完成待办 1 件，逾期 1 件，未完成共 2 件')
    expect(md).toContain('- 本周完成（收件箱）')
    expect(parseReview(md)).toEqual({ facts: '跑了两次步', patterns: '睡够精力好', next: '- 早睡' })
    const again = reviewMarkdown(r, s, { ...parseReview(md), next: '- 早睡\n- 跑步' }, md + '\n## 附记\n\n手写的\n')
    expect(again).toContain('## 附记\n\n手写的')
    expect(parseReview(again).next).toBe('- 早睡\n- 跑步')
  })

  it('AI 提示词包含我是谁、每天记录和未完成待办', () => {
    const p = aiPrompt(r, '---\nupdated: x\n---\n# 我是谁\n\n## 价值观\n- 自由\n', (d) => days[d], todo, s)
    expect(p).toContain('复盘 2026-W45（2026-11-02 至 2026-11-08）')
    expect(p).toContain('- 自由')
    expect(p).toContain('### 2026-11-02（情绪 6，精力 5）\n周一跑步')
    expect(p).toContain('### 2026-11-04（情绪 8，精力 —）\n（无日记）')
    expect(p).toContain('- 读书（目标：24 本）：读完 @2026-11-10')
    expect(p).not.toContain('updated: x')
  })
})

describe('投入、下一步、叫法', () => {
  it('周统计汇总投入和标了「学到 / 问题」的速记，并写进数据', async () => {
    const { dataSection, weekOf, weekStats } = await import('./review')
    const r = weekOf('2026-11-05')
    const ds: Record<string, string> = {
      '2026-11-02': day('2026-11-02', 6, 5, ['投入：英语 1h，写代码 30min', '学到：先写清楚再动手']),
      '2026-11-04': day('2026-11-04', 8, '', ['投入：写代码 2h', '问题：要不要换到早上跑步', '普通的一条']),
    }
    const s = weekStats(r, (d) => ds[d], todo, '2026-11-05')
    expect(s.spent).toEqual([
      { name: '写代码', hours: 2.5 },
      { name: '英语', hours: 1 },
    ])
    expect(s.spentTotal).toBe(3.5)
    expect(s.marked.map((m) => [m.date, m.kind])).toEqual([
      ['2026-11-02', 'learned'],
      ['2026-11-04', 'question'],
    ])
    expect(dataSection(s)).toContain('- 投入 3.5h：写代码 2.5h、英语 1h')
  })

  it('读出上一期的下一步', async () => {
    const { nextSteps, periodLabel, prevWeek, weekOf } = await import('./review')
    expect(nextSteps('## 下一步\n\n- 早睡\n- [ ] 每天读书 1h\n2. 周日做计划\n<!-- 注释 -->\n')).toEqual(['早睡', '每天读书 1h', '周日做计划'])
    expect(nextSteps('## 事实\n\n没有下一步\n')).toEqual([])
    expect(prevWeek(weekOf('2026-11-05')).id).toBe('2026-W44')
    expect([periodLabel('2026-W05'), periodLabel('2026-11'), periodLabel('2026'), periodLabel('随便')]).toEqual(['2026 年第 5 周', '2026 年 11 月', '2026 年', '随便'])
  })

  it('AI 提示词带上上周的下一步和模式账本', async () => {
    const { aiPrompt, weekOf, weekStats } = await import('./review')
    const r = weekOf('2026-11-05')
    const s = weekStats(r, (d) => days[d], todo, '2026-11-05')
    const p = aiPrompt(r, '', (d) => days[d], todo, s, {
      prevNext: ['早睡'],
      patterns: [{ heading: 'P1 x', id: 'P1', title: '睡够的日子精力更好', status: '观察中', note: '', body: '' }],
    })
    expect(p).toContain('## 上周说的下一步\n- 早睡')
    expect(p).toContain('- P1 睡够的日子精力更好（观察中）')
    expect(aiPrompt(r, '', (d) => days[d], todo, s)).not.toContain('模式账本（')
  })
})
