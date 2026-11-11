import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import * as A from '../lib/actions'
import { cnMonthDay, dayPath, ymd } from '../lib/dates'
import { useStore } from '../lib/hooks'
import { daySpent, fmtHours, fmtMinutes, noteKind, parseNotes, parseSpent, type Spent } from '../lib/md'
import { store } from '../lib/store'
import { cx, haptic, useBox } from '../lib/ui'
import { NoteRow } from './NoteSheet'
import { Sheet } from './Sheet'

/** 时间花在哪：每项一行，条的长短按最长的一项算 */
export function SpentBars({ items }: { items: Spent[] }) {
  const max = Math.max(...items.map((x) => x.hours), 0.01)
  return (
    <ul class="spent-bars">
      {items.map((x) => (
        <li>
          <span class="spent-name">{x.name}</span>
          <span class="spent-track" aria-hidden="true">
            <i style={{ width: `${Math.max(4, (x.hours / max) * 100)}%` }} />
          </span>
          <span class="spent-hours">{fmtHours(x.hours)}</span>
        </li>
      ))}
    </ul>
  )
}

export const spentTotal = (items: Spent[]) => items.reduce((a, x) => a + x.hours, 0)

/** 以前记过的名称，常用的在前（只看最近 90 个有记录的日子） */
function knownNames(): string[] {
  const count = new Map<string, number>()
  for (const p of store.list('days/').slice(-90)) {
    for (const n of parseNotes(store.read(p) ?? '')) for (const x of parseSpent(n.text)?.items ?? []) count.set(x.name, (count.get(x.name) ?? 0) + 1)
  }
  return [...count].sort((a, b) => b[1] - a[1]).map(([n]) => n)
}

const DURATIONS: [number, string][] = [
  [15, '15 分'],
  [30, '30 分'],
  [45, '45 分'],
  [60, '1 小时'],
  [90, '1.5 小时'],
  [120, '2 小时'],
  [180, '3 小时'],
]

/** 记一笔投入：选（或写）一个名称，再点时长，两下记完；可以连着记 */
export function SpentSheet() {
  const c = useBox(A.spentSheet)
  const s = useStore()
  const [date, setDate] = useState(ymd())
  const [name, setName] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const names = useMemo(() => (c ? knownNames() : []), [c])
  useEffect(() => {
    if (c) {
      setDate(c.date)
      setName('')
    }
  }, [c])

  const md = s.read(dayPath(date)) ?? ''
  const items = daySpent(md)
  const raw = parseNotes(md).filter((n) => noteKind(n.text).kind === 'spent')
  const clean = name.replace(/[，,、；;]/g, ' ').replace(/\s+/g, ' ').trim()
  const close = () => A.spentSheet.set(null)
  const add = (min: number) => {
    if (!clean) return input.current?.focus()
    A.addNote(date, `投入：${clean} ${fmtMinutes(min)}`)
    haptic(10)
    setName('')
  }

  return (
    <Sheet open={!!c} onClose={close} title="记一笔投入" label="记一笔投入">
      <div class="spent-sheet">
        <p class="sheet-sub">{date === ymd() ? '时间花在哪了？' : `补记 ${cnMonthDay(date)}。`}复盘时按名称汇总，对照这学期的方向。</p>
        <input
          ref={input}
          class="field-input"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          placeholder="投在什么上，例如 英语"
          autocomplete="off"
          enterKeyHint="done"
          aria-label="投入的名称"
        />
        {names.length > 0 && (
          <div class="chips spent-names">
            {names.slice(0, 12).map((n) => (
              <button type="button" class={cx('chip', n === clean && 'on')} aria-pressed={n === clean} onClick={() => setName(n === clean ? '' : n)}>
                {n}
              </button>
            ))}
          </div>
        )}
        <p class="spent-label">多久</p>
        <div class="chips">
          {DURATIONS.map(([min, label]) => (
            <button type="button" class="chip dur" disabled={!clean} onClick={() => add(min)}>
              {label}
            </button>
          ))}
        </div>
        {raw.length > 0 && (
          <>
            <p class="spent-label">
              这一天已记 <b>{fmtHours(spentTotal(items))}</b>
            </p>
            <ul class="notes spent-raw">
              {raw.map((n) => (
                <NoteRow date={date} note={n} />
              ))}
            </ul>
          </>
        )}
        <div class="quick-bottom">
          <span class="hint">点一条可以改或删</span>
          <button type="button" class="text-btn strong" onClick={close}>
            完成
          </button>
        </div>
      </div>
    </Sheet>
  )
}
