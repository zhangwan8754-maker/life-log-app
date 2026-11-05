import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isoWeek } from './dates'
import {
  addTodo, appendNote, deleteTodo, emptyTodo, getMeta, getSection, moveTodo, newDay,
  newThought, parseNotes, parseTodos, setMeta, setSection, setThoughtBody, thoughtBody, toggleTodo,
} from './md'

const repoUrl = (p: string) => new URL(`../../../${p}`, import.meta.url)
const repo = (p: string) => readFileSync(repoUrl(p), 'utf8')
// app 单独部署到公开仓库时没有数据文件，跳过这些测试
const inDataRepo = existsSync(repoUrl('todo.md'))

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
  it.skipIf(!inDataRepo)('能读仓库里的真实文件', () => {
    const md = repo('days/2026/2026-11-05.md')
    expect(getMeta(md, 'date')).toBe('2026-11-05')
    expect(getSection(md, '日记')).toContain('life-log')
  })
  it('缺少小节时追加', () => {
    expect(parseNotes(appendNote('手写的文件', '09:00', 'hi'))).toEqual([{ time: '09:00', text: 'hi' }])
  })
})

describe('待办', () => {
  it.skipIf(!inDataRepo)('解析真实 todo.md', () => {
    const t = parseTodos(repo('todo.md'))
    expect(t.现在[0]).toMatchObject({ done: false, text: '填写 me.md', tags: ['life-log'] })
  })
  it('新增 / 完成 / 撤销 / 移动 / 删除', () => {
    let md = emptyTodo()
    md = addTodo(md, '买书 @2026-11-08 #阅读')
    md = addTodo(md, '跑步')
    md = addTodo(md, '学钢琴', '之后')
    let t = parseTodos(md)
    expect(t.现在.map((x) => x.text)).toEqual(['买书', '跑步'])
    expect(t.现在[0]).toMatchObject({ due: '2026-11-08', tags: ['阅读'] })

    md = toggleTodo(md, '买书 @2026-11-08 #阅读', '2026-11-05')
    md = toggleTodo(md, '跑步', '2026-11-06')
    t = parseTodos(md)
    expect(t.现在).toEqual([])
    expect(t.完成.map((x) => [x.text, x.doneOn])).toEqual([['跑步', '2026-11-06'], ['买书', '2026-11-05']])

    md = toggleTodo(md, '跑步', '2026-11-06')
    md = moveTodo(md, '学钢琴', '现在')
    md = deleteTodo(md, '买书 @2026-11-08 #阅读')
    t = parseTodos(md)
    expect(t.现在.map((x) => x.text)).toEqual(['跑步', '学钢琴'])
    expect(t.之后).toEqual([])
    expect(t.完成).toEqual([])
    expect(md).toMatchSnapshot()
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
