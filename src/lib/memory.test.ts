import { describe, expect, it } from 'vitest'
import { advicePath, advisors, agentName, agentOf, parsePatterns, parseProposals, removeProposal, setPatternStatus } from './memory'

const patterns = `---
updated: 2026-11-11
---
# 模式账本

> AI 维护，主人裁决。

## P1 睡够的日子精力分更高

状态：观察中 · 首次记录 2026-11-11 · 支持 3 天

证据
- 11-07 精力 8：「睡到自然醒」

## P2 事情一多就推掉健身

状态：观察中 · 支持 2 天

证据
- 11-09

## 没编号的一条

只有正文。
`

describe('模式账本', () => {
  it('解析出标题、状态、说明和正文', () => {
    const ps = parsePatterns(patterns)
    expect(ps.map((p) => [p.id, p.title, p.status])).toEqual([
      ['P1', '睡够的日子精力分更高', '观察中'],
      ['P2', '事情一多就推掉健身', '观察中'],
      ['', '没编号的一条', ''],
    ])
    expect(ps[0].note).toBe('首次记录 2026-11-11 · 支持 3 天')
    expect(ps[0].body).toBe('证据\n- 11-07 精力 8：「睡到自然醒」')
    expect(parsePatterns(null)).toEqual([])
  })

  it('裁决只改那一行，并记下是主人哪天定的', () => {
    const md = setPatternStatus(patterns, 'P1 睡够的日子精力分更高', '成立', '2026-11-20')
    expect(md).toContain('状态：成立 · 首次记录 2026-11-11 · 支持 3 天 · 主人裁决 2026-11-20')
    expect(md).toContain('状态：观察中 · 支持 2 天')
    expect(md).toMatch(/^---\nupdated: 2026-11-20\n---/)
    expect(md.replace(/状态：成立.*\n/, '').replace('2026-11-20', '')).toBe(patterns.replace(/状态：观察中 · 首次.*\n/, '').replace('2026-11-11', ''))
    // 再改一次不会叠加记号；改回观察中则去掉
    const again = setPatternStatus(md, 'P1 睡够的日子精力分更高', '推翻', '2026-12-01')
    expect(again).toContain('状态：推翻 · 首次记录 2026-11-11 · 支持 3 天 · 主人裁决 2026-12-01')
    expect(setPatternStatus(again, 'P1 睡够的日子精力分更高', '观察中', '2026-12-02')).toContain('状态：观察中 · 首次记录 2026-11-11 · 支持 3 天\n')
  })

  it('没有状态行的补一行；找不到的标题不动', () => {
    expect(setPatternStatus(patterns, '没编号的一条', '成立', '2026-11-20')).toContain('## 没编号的一条\n\n状态：成立 · 主人裁决 2026-11-20\n\n只有正文。')
    expect(setPatternStatus(patterns, '不存在', '成立', '2026-11-20')).toBe(patterns)
  })
})

const proposals = `---
updated: 2026-11-11
---
# 提议

> AI 写，主人决定。

## 可以写成思想卡片的原话

埋在日记里的句子。

1. [11-10](../days/2026/2026-11-10.md)「先写清楚再动手」
2. 11-09 速记

## 待办和复盘

7. 「健身」项目可以二选一：
   - 改成有终点的任务；
   - 或者每天记投入。
8. 给项目写一行目标。
`

describe('提议', () => {
  it('按编号解析，续行算在同一条里', () => {
    const ps = parseProposals(proposals)
    expect(ps.map((p) => [p.n, p.section])).toEqual([
      [1, '可以写成思想卡片的原话'],
      [2, '可以写成思想卡片的原话'],
      [7, '待办和复盘'],
      [8, '待办和复盘'],
    ])
    expect(ps[2].text).toBe('「健身」项目可以二选一：\n- 改成有终点的任务；\n- 或者每天记投入。')
    expect(parseProposals(undefined)).toEqual([])
  })

  it('删一条：连同续行一起删，不重新编号，其余逐字保留', () => {
    const key = parseProposals(proposals)[2].key
    const md = removeProposal(proposals, key, '2026-11-12')
    expect(parseProposals(md).map((p) => p.n)).toEqual([1, 2, 8])
    expect(md).toContain('## 待办和复盘\n\n8. 给项目写一行目标。\n')
    expect(md).toContain('埋在日记里的句子。\n\n1. [11-10]')
    expect(md).toMatch(/^---\nupdated: 2026-11-12\n---/)
    expect(removeProposal(md, '不存在', '2026-11-12')).toBe(md)
  })
})

describe('每个 AI 的建议各放各的', () => {
  const files: Record<string, string> = {
    'memory/proposals/deepseek.md': '---\nupdated: 2026-11-12\n---\n# 建议\n\n## 2026-W46\n\n1. 早点睡\n2. 少刷手机\n',
    'memory/proposals/claude.md': proposals,
    'memory/proposals/local-llm.md': '---\nname: 本地模型\n---\n# 建议\n',
    'memory/proposals.md': '# 提议\n\n1. 旧位置的一条\n',
    'memory/proposals/archive/old.md': '1. 子目录里的不算\n',
    'memory/proposals/_template.md': '1. 模板不算\n',
    'memory/patterns.md': '',
  }
  it('按文件名认出是哪个 AI，各自解析', () => {
    const as = advisors(Object.keys(files), (p) => files[p])
    expect(as.map((a) => [a.agent, a.name, a.items.length, a.updated])).toEqual([
      ['claude', 'Claude', 4, '2026-11-11'],
      ['deepseek', 'DeepSeek', 2, '2026-11-12'],
      ['local-llm', '本地模型', 0, ''],
      ['ai', 'AI', 1, ''],
    ])
    expect(as[1].items[0]).toMatchObject({ n: 1, section: '2026-W46', key: '早点睡' })
  })
  it('旧位置清空后不再显示；代号与路径互相对得上', () => {
    expect(advisors(['memory/proposals.md'], () => '# 提议\n').length).toBe(0)
    expect([agentOf('memory/proposals/deepseek.md'), agentOf('memory/proposals.md'), agentOf('memory/patterns.md')]).toEqual(['deepseek', 'ai', ''])
    expect([advicePath('deepseek'), advicePath('ai')]).toEqual(['memory/proposals/deepseek.md', 'memory/proposals.md'])
    expect([agentName('DeepSeek'), agentName('mybot'), agentName('mybot', '---\nname: 小助手\n---\n')]).toEqual(['DeepSeek', 'mybot', '小助手'])
  })
})
