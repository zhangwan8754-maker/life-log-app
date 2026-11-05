import { describe, expect, it } from 'vitest'
import { applyOp } from './store'
import {
  addProject, addTask, deleteProject, deleteTask, editTask, emptyTodo, isLegacy, migrateTodo, moveTask,
  parseTask, parseTodo, renameProject, setProjectGoal, setTaskDate, toggleTask,
} from './todo'

const names = (md: string) => parseTodo(md).map((g) => g.name)
const texts = (md: string, g: string) => parseTodo(md).find((x) => x.name === g)!.tasks.map((t) => (t.done ? `✓${t.text}` : t.text))

describe('解析', () => {
  it('任务字段', () => {
    expect(parseTask('- [ ] 读完《置身事内》 @2026-11-08 #阅读 #书', 'P')).toEqual({
      done: false, key: '读完《置身事内》 @2026-11-08 #阅读 #书', text: '读完《置身事内》', date: '2026-11-08',
      tags: ['阅读', '书'], doneOn: '', group: 'P',
    })
    expect(parseTask('- [x] 跑步 ✓2026-11-05')).toMatchObject({ done: true, key: '跑步', doneOn: '2026-11-05' })
    expect(parseTask('普通文字')).toBeNull()
  })
  it('分组顺序：收件箱最前、将来最后，读取项目目标', () => {
    const md = `# 待办\n\n## 将来\n\n- [ ] 钢琴\n\n## 读书\n\n> 今年 24 本\n- [ ] A\n\n## 收件箱\n\n- [ ] 牛奶\n`
    const gs = parseTodo(md)
    expect(gs.map((g) => [g.name, g.kind, g.goal])).toEqual([
      ['收件箱', 'inbox', ''], ['读书', 'project', '今年 24 本'], ['将来', 'someday', ''],
    ])
  })
  it('空文件也有收件箱和将来', () => {
    expect(names('')).toEqual(['收件箱', '将来'])
  })
})

describe('旧格式迁移', () => {
  const legacy = `# 待办\n\n## 现在\n\n- [ ] 填写 me.md #life-log\n\n## 之后\n\n- [ ] 学钢琴\n\n## 完成\n\n- [x] 搭建 ✓2026-11-05\n`
  it('现在→收件箱，之后→将来，完成并入收件箱', () => {
    expect(isLegacy(legacy)).toBe(true)
    const md = migrateTodo(legacy)
    expect(md).toBe(`# 待办\n\n## 收件箱\n\n- [ ] 填写 me.md #life-log\n- [x] 搭建 ✓2026-11-05\n\n## 将来\n\n- [ ] 学钢琴\n`)
    expect(isLegacy(md)).toBe(false)
    expect(migrateTodo(md)).toBe(md)
  })
  it('写操作会顺带迁移；旧版排队中的操作也能重放', () => {
    let md = applyOp(legacy, { kind: 'todo.add', text: '旧版加的', section: '现在' })
    md = applyOp(md, { kind: 'todo.toggle', key: '填写 me.md #life-log', today: '2026-11-06' })
    md = applyOp(md, { kind: 'todo.move', key: '旧版加的', section: '之后' })
    expect(isLegacy(md)).toBe(false)
    expect(texts(md, '收件箱')).toEqual(['✓填写 me.md', '✓搭建'])
    expect(texts(md, '将来')).toEqual(['学钢琴', '旧版加的'])
  })
})

describe('任务操作', () => {
  it('新增 / 完成留在原处 / 改期 / 编辑 / 移动 / 删除', () => {
    let md = emptyTodo()
    md = addTask(md, '买牛奶')
    md = addTask(md, '读书 #阅读', '读书计划', '2026-11-08')
    md = addTask(md, '写周报', '收件箱', '2026-11-06')
    expect(names(md)).toEqual(['收件箱', '读书计划', '将来'])
    expect(parseTodo(md)[1].tasks[0]).toMatchObject({ text: '读书', date: '2026-11-08', tags: ['阅读'] })

    md = toggleTask(md, '买牛奶', '2026-11-05')
    md = addTask(md, '新的') // 完成的留在原处；新任务排在最后一个未完成任务之后
    expect(texts(md, '收件箱')).toEqual(['✓买牛奶', '写周报', '新的'])
    expect(md).toContain('- [x] 买牛奶 ✓2026-11-05')

    md = setTaskDate(md, '读书 #阅读 @2026-11-08', '2026-11-10')
    expect(md).toContain('- [ ] 读书 #阅读 @2026-11-10')
    md = setTaskDate(md, '读书 #阅读 @2026-11-10', '')
    expect(md).toContain('- [ ] 读书 #阅读\n')
    md = setTaskDate(md, '买牛奶', '2026-11-04')
    expect(md).toContain('- [x] 买牛奶 @2026-11-04 ✓2026-11-05')

    md = editTask(md, '新的', '新的名字 @2026-11-07')
    md = moveTask(md, '新的名字 @2026-11-07', '读书计划', '收件箱')
    expect(texts(md, '读书计划')).toEqual(['读书', '新的名字'])
    md = toggleTask(md, '买牛奶 @2026-11-04', '2026-11-05')
    expect(texts(md, '收件箱')).toEqual(['买牛奶', '写周报'])
    md = deleteTask(md, '写周报 @2026-11-06')
    expect(texts(md, '收件箱')).toEqual(['买牛奶'])
    expect(md).toMatchSnapshot()
  })
  it('同名任务按分组区分', () => {
    let md = addTask(addTask(emptyTodo(), '复习'), '复习', 'A')
    md = toggleTask(md, '复习', '2026-11-05', 'A')
    expect(texts(md, '收件箱')).toEqual(['复习'])
    expect(texts(md, 'A')).toEqual(['✓复习'])
  })
})

describe('项目操作', () => {
  it('新建 / 目标 / 改名 / 删除', () => {
    let md = addProject(emptyTodo(), '健身', '体脂降到 18%')
    expect(names(md)).toEqual(['收件箱', '健身', '将来'])
    expect(parseTodo(md)[1].goal).toBe('体脂降到 18%')
    md = setProjectGoal(md, '健身', '每周 3 次')
    md = addTask(md, '办卡', '健身')
    expect(md).toContain('## 健身\n\n> 每周 3 次\n- [ ] 办卡')
    md = renameProject(md, '健身', '运动')
    expect(renameProject(md, '运动', '收件箱')).toBe(md) // 不能占用特殊名
    expect(names(md)).toEqual(['收件箱', '运动', '将来'])
    expect(deleteProject(md, '运动')).toBe(md) // 还有未完成任务，不删
    md = deleteProject(toggleTask(md, '办卡', '2026-11-05', '运动'), '运动')
    expect(names(md)).toEqual(['收件箱', '将来'])
  })
})
