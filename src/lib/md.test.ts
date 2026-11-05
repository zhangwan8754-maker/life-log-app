import { describe, expect, it } from 'vitest'
import { isoWeek } from './dates'
import {
  appendNote, getMeta, getSection, newDay,
  newThought, parseNotes, setMeta, setSection, setThoughtBody, thoughtBody,
} from './md'

describe('frontmatter', () => {
  it('读写字段并保留注释与其他行', () => {
    const md = '---\ndate: 2026-11-05\nmood: 7        # 1-10\nenergy:\n---\n正文'
    expect(getMeta(md, 'mood')).toBe('7')
    expect(getMeta(md, 'energy')).toBe('')
    const out = setMeta(setMeta(md, 'mood', '3'), 'energy', '8')
    expect(out).toBe('---\ndate: 2026-11-05\nmood: 3        # 1-10\nenergy: 8\n---\n正文')
    expect(getMeta(setMeta(out, 'mood', ''), 'mood')).toBe('')
  })
  it('缺失字段时插入', () => {
    expect(setMeta('---\ndate: x\n---\n', 'mood', '5')).toBe('---\ndate: x\nmood: 5\n---\n')
  })
})

describe('每日文件', () => {
  it('新建 → 写日记 → 速记，往返不丢内容', () => {
    let md = newDay('2026-11-05')
    md = setSection(md, '日记', '今天下雨。\n\n### 小标题\n第二段')
    md = appendNote(md, '08:12', '突然想到')
    md = appendNote(md, '21:00', '多行\n合成一行')
    expect(getSection(md, '日记')).toBe('今天下雨。\n\n### 小标题\n第二段')
    expect(parseNotes(md)).toEqual([
      { time: '08:12', text: '突然想到' },
      { time: '21:00', text: '多行 合成一行' },
    ])
    md = setSection(md, '日记', '改写')
    expect(getSection(md, '日记')).toBe('改写')
    expect(parseNotes(md)).toHaveLength(2)
    expect(md).toMatchSnapshot()
  })
  it('缺少小节时追加', () => {
    expect(parseNotes(appendNote('手写的文件', '09:00', 'hi'))).toEqual([{ time: '09:00', text: 'hi' }])
  })
})

describe('思想', () => {
  it('正文读写保留 frontmatter', () => {
    let md = newThought('标题', '第一版', '2026-11-05', '2026-11-04')
    expect(thoughtBody(md)).toBe('第一版')
    md = setThoughtBody(md, '新标题', '第二版')
    expect(getMeta(md, 'from')).toBe('2026-11-04')
    expect(md).toContain('# 新标题')
    expect(thoughtBody(md)).toBe('第二版')
  })
})

describe('日期', () => {
  it('ISO 周', () => {
    expect(isoWeek('2026-11-05')).toEqual([2026, 45])
    expect(isoWeek('2027-01-01')).toEqual([2026, 53])
    expect(isoWeek('2024-12-30')).toEqual([2025, 1])
  })
})
