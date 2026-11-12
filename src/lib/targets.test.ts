import { describe, expect, it } from 'vitest'
import { parseMe, setMeField } from './me'
import { formatTargets, meTargets, parseTargets, progressLine, targetProgress } from './targets'

describe('每周投入的目标', () => {
  it('一行一项；不写单位算小时；认不出的行单独列出', () => {
    const { items, bad } = parseTargets('- 数学 10h\n- 英语：14 小时\n单词 30min\n* 跑步 3\n\n- 随便写写\n- 零 0h')
    expect(items).toEqual([
      { name: '数学', hours: 10 },
      { name: '英语', hours: 14 },
      { name: '单词', hours: 0.5 },
      { name: '跑步', hours: 3 },
    ])
    expect(bad).toEqual(['随便写写', '零 0h'])
    expect(parseTargets(undefined)).toEqual({ items: [], bad: [] })
  })

  it('同名的后写的算数；写回去是整齐的列表', () => {
    const { items } = parseTargets('数学 8h\n数学 10.5h')
    expect(items).toEqual([{ name: '数学', hours: 10.5 }])
    expect(formatTargets([...items, { name: '英语', hours: 14 }])).toBe('- 数学 10.5h\n- 英语 14h')
  })

  it('写在 me.md「方向 · 每周投入」里，和别的栏互不影响', () => {
    let md = setMeField(null, '方向', '这学期', '数学学完一轮', '2026-11-12')
    md = setMeField(md, '方向', '每周投入', '- 数学 10h\n- 英语 14h', '2026-11-12')
    expect(md).toContain('### 这学期\n\n数学学完一轮\n\n### 每周投入\n\n- 数学 10h\n- 英语 14h\n\n### 毕业时')
    expect(meTargets(md)).toEqual([
      { name: '数学', hours: 10 },
      { name: '英语', hours: 14 },
    ])
    expect(meTargets(setMeField(md, '方向', '每周投入', '', '2026-11-13'))).toEqual([])
    expect(parseMe(md).extras).toEqual([])
  })

  it('实际投入对目标：同名或以目标开头的算进去，取最长的；对不上的算「其他」', () => {
    const targets = [
      { name: '英语', hours: 14 },
      { name: '英语语法', hours: 4 },
      { name: '数学', hours: 10 },
    ]
    const spent = [
      { name: '英语语法', hours: 2 },
      { name: '英语阅读', hours: 1.5 },
      { name: '数学', hours: 2 },
      { name: '单词', hours: 1 },
    ]
    const p = targetProgress(targets, spent)
    expect(p.items.map((x) => [x.name, x.done])).toEqual([
      ['英语', 1.5],
      ['英语语法', 2],
      ['数学', 2],
    ])
    expect(p.other).toBe(1)
    expect(progressLine(p.items)).toBe('英语 1.5h/14h、英语语法 2h/4h、数学 2h/10h')
  })
})
