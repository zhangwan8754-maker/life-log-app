import { describe, expect, it } from 'vitest'
import { emptyMe, parseMe, setMeField, termGoals } from './me'
import { applyOp } from './store'

const OLD_BLANK = `---
updated: 2026-11-05
---
# 我是谁

> 这是整个仓库最稳定的一页。

## 价值观
<!-- 我真正在乎什么？按优先级排。冲突时选哪个？ -->
-

## 长期目标（3–5 年）
-

## 今年
-

## 原则
<!-- 我反复验证过、愿意遵守的做事方式 -->
-

## 当前关注
-

## 已知的我
-
`
const field = (md: string, section: string, sub = '') =>
  parseMe(md).groups.find((g) => g.title === section)!.fields.find((f) => f.sub === sub)!.text

describe('空骨架', () => {
  it('五栏十项，文件里没有说明文字', () => {
    const md = emptyMe()
    expect(md).toBe(
      '---\nupdated:\n---\n# 我是谁\n\n## 现在\n\n## 在乎\n\n### 让我有劲的\n\n### 耗我的\n\n### 好的一天\n\n## 方向\n\n### 这学期\n\n### 每周投入\n\n### 毕业时\n\n### 更远\n\n## 做法\n\n### 验证过的\n\n### 借来的\n\n## 还没想清楚\n',
    )
    const me = parseMe(md)
    expect(me.groups.map((g) => [g.title, g.fields.map((f) => f.sub)])).toEqual([
      ['现在', ['']],
      ['在乎', ['让我有劲的', '耗我的', '好的一天']],
      ['方向', ['这学期', '每周投入', '毕业时', '更远']],
      ['做法', ['验证过的', '借来的']],
      ['还没想清楚', ['']],
    ])
    expect([me.filled, me.total, me.extras]).toEqual([0, 10, []])
    expect(parseMe(null).total).toBe(10)
  })
})

describe('只改一栏', () => {
  it('其余内容逐字不变，updated 更新', () => {
    let md = setMeField(null, '现在', '', '在读学生\n正在学 ops', '2026-11-10')
    md = setMeField(md, '做法', '借来的', '「成长性思维+承担责任」(11-07)', '2026-11-10')
    md = setMeField(md, '方向', '这学期', '- 过四级\n- 做完一个 ops 小项目', '2026-11-11')
    expect(md).toContain('---\nupdated: 2026-11-11\n---\n# 我是谁\n\n## 现在\n\n在读学生\n正在学 ops\n\n## 在乎\n')
    expect(md).toContain('## 方向\n\n### 这学期\n\n- 过四级\n- 做完一个 ops 小项目\n\n### 每周投入\n\n### 毕业时\n')
    expect(md).toContain('### 验证过的\n\n### 借来的\n\n「成长性思维+承担责任」(11-07)\n\n## 还没想清楚\n')
    expect(parseMe(md).filled).toBe(3)

    const again = setMeField(md, '做法', '借来的', '改了', '2026-11-11')
    expect(field(again, '现在')).toBe('在读学生\n正在学 ops')
    expect(field(again, '方向', '这学期')).toBe('- 过四级\n- 做完一个 ops 小项目')
    expect(field(again, '做法', '借来的')).toBe('改了')
    expect(field(setMeField(again, '做法', '借来的', '  ', '2026-11-12'), '做法', '借来的')).toBe('')
  })
  it('不认识的栏或小栏不写入', () => {
    const md = emptyMe()
    expect(setMeField(md, '没有这栏', '', 'x', '2026-11-10')).toBe(md)
    expect(setMeField(md, '在乎', '没有这个小栏', 'x', '2026-11-10')).toBe(md)
  })
  it('内容里的大标题降成小标题，不会变成新栏目', () => {
    const md = setMeField(null, '在乎', '好的一天', '## 标准\n睡够 + 学了点东西', '2026-11-10')
    expect(field(md, '在乎', '好的一天')).toBe('#### 标准\n睡够 + 学了点东西')
    expect(parseMe(md).extras).toEqual([])
  })
  it('可以作为同步操作重放', () => {
    const md = applyOp(null, { kind: 'me.set', section: '还没想清楚', sub: '', text: '我的尺子是什么？', date: '2026-11-10' })
    expect(field(md, '还没想清楚')).toBe('我的尺子是什么？')
  })
})

describe('旧模板', () => {
  it('完全空着的六栏：读的时候当作没有，第一次写入时清掉', () => {
    expect(parseMe(OLD_BLANK)).toMatchObject({ filled: 0, extras: [], updated: '2026-11-05' })
    const md = setMeField(OLD_BLANK, '现在', '', '在读学生', '2026-11-10')
    for (const t of ['价值观', '长期目标', '今年', '原则', '当前关注', '已知的我']) expect(md).not.toContain(`## ${t}`)
    expect(md).toContain('# 我是谁\n\n> 这是整个仓库最稳定的一页。\n\n## 现在\n\n在读学生\n')
  })
  it('写过字的旧栏目和自己加的栏目都保留', () => {
    const old = OLD_BLANK.replace('## 今年\n-', '## 今年\n- 读完 24 本书').replace('## 已知的我\n-', '## 已知的我\n- 容易和别人比') + '\n## 我喜欢的句子\n\n慢即是快\n'
    expect(termGoals(old)).toBe('- 读完 24 本书')
    const md = setMeField(old, '在乎', '耗我的', '无意识游走', '2026-11-10')
    expect(md).toContain('## 今年\n\n- 读完 24 本书')
    expect(md).toContain('## 已知的我\n\n- 容易和别人比')
    expect(md).toContain('## 我喜欢的句子\n\n慢即是快\n')
    expect(md).not.toContain('## 价值观')
    expect(parseMe(md).extras.map((e) => e.title)).toEqual(['今年', '已知的我', '我喜欢的句子'])
  })
})

describe('每周复盘对照的方向', () => {
  it('优先用「这学期」，没写时回退到旧的「今年」', () => {
    expect(termGoals(emptyMe())).toBe('')
    const old = OLD_BLANK.replace('## 今年\n-', '## 今年\n- 读完 24 本书')
    expect(termGoals(old)).toBe('- 读完 24 本书')
    expect(termGoals(setMeField(old, '方向', '这学期', '过四级', '2026-11-10'))).toBe('过四级')
  })
})
