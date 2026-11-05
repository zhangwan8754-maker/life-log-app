import { recent, visible } from '../lib/actions'
import { addDays, cnMonthDay, relDay, shortWeekday } from '../lib/dates'
import { useToday, useTodo } from '../lib/hooks'
import { allTasks, SOMEDAY, type Task } from '../lib/todo'
import { cx, useBox } from '../lib/ui'
import { Empty, Page } from '../components/Page'
import { TaskRow } from '../components/TaskRow'

/** 日程：逾期、今天、未来 14 天按天分组、以后 */
export function UpcomingPage() {
  const today = useToday()
  const { groups, loading } = useTodo()
  const rec = useBox(recent)
  const open = allTasks(groups).filter((t) => visible(t, rec) && t.date)
  const overdue = open.filter((t) => t.date < today).sort((a, b) => a.date.localeCompare(b.date))
  const horizon = addDays(today, 14)
  const byDay = new Map<string, Task[]>()
  for (const t of open) if (t.date >= today && t.date <= horizon) byDay.set(t.date, [...(byDay.get(t.date) ?? []), t])
  const days = [...byDay.keys()].sort()
  const later = open.filter((t) => t.date > horizon).sort((a, b) => a.date.localeCompare(b.date))
  const undated = allTasks(groups).filter((t) => !t.done && !t.date && t.group !== SOMEDAY).length

  const dayLabel = (d: string) => {
    const r = relDay(d, today)
    return r === cnMonthDay(d) ? `${cnMonthDay(d)} ${shortWeekday(d)}` : `${r} · ${cnMonthDay(d)}${r.startsWith('周') ? '' : ` ${shortWeekday(d)}`}`
  }

  return (
    <Page title="日程" icon="upcoming" back={{ href: '#/plan', label: '计划' }}>
      {overdue.length > 0 && (
        <>
          <p class="group-label late">逾期</p>
          <div class="group">
            <div class="tasks">
              {overdue.map((t) => (
                <TaskRow task={t} today={today} />
              ))}
            </div>
          </div>
        </>
      )}
      {days.map((d) => (
        <>
          <p class={cx('group-label', d === today && 'today-label')}>{dayLabel(d)}</p>
          <div class="group">
            <div class="tasks">
              {byDay.get(d)!.map((t) => (
                <TaskRow task={t} today={today} showDate={false} />
              ))}
            </div>
          </div>
        </>
      ))}
      {later.length > 0 && (
        <>
          <p class="group-label">以后</p>
          <div class="group">
            <div class="tasks">
              {later.map((t) => (
                <TaskRow task={t} today={today} />
              ))}
            </div>
          </div>
        </>
      )}
      {!loading && !overdue.length && !days.length && !later.length && (
        <div class="group">
          <Empty icon="upcoming">未来两周还没有安排。</Empty>
        </div>
      )}
      {undated > 0 && <p class="group-note">收件箱和项目里还有 {undated} 件没排日期，左滑任务就能安排。</p>}
    </Page>
  )
}

