import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import * as A from '../lib/actions'
import { cnMonthDay, dayPath, hm, ymd } from '../lib/dates'
import { useNow, useStore } from '../lib/hooks'
import { daySpent, fmtHours, fmtMinutes, noteKind, parseNotes, parseSpent, type Spent } from '../lib/md'
import { store } from '../lib/store'
import { cx, haptic, useBox } from '../lib/ui'
import { Icon } from './Icon'
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
export function knownNames(): string[] {
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
  const running = useBox(A.timer)
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
        {date === ymd() &&
          (running ? (
            <p class="timer-note">正在给「{running.name}」计时，结束后才能开始下一段。</p>
          ) : (
            <button
              type="button"
              class="btn tonal block timer-start"
              disabled={!clean}
              onClick={() => {
                A.startTimer(clean)
                close()
              }}
            >
              <Icon name="clock" size={18} />
              不知道多久？开始计时
            </button>
          ))}
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

/** 12:07 或 1:02:07 */
const clock = (ms: number) => {
  const sec = Math.max(0, Math.floor(ms / 1000))
  const two = (n: number) => String(n).padStart(2, '0')
  const h = Math.floor(sec / 3600)
  return `${h ? `${h}:` : ''}${two(Math.floor(sec / 60) % 60)}:${two(sec % 60)}`
}
const startedAt = (start: number) => {
  const d = new Date(start)
  return `${ymd(d) === ymd() ? '' : `${cnMonthDay(ymd(d))} `}${hm(d)}`
}

/** 正在计时：「今天」页最上面的一张卡片。结束就记成一笔投入 */
export function TimerCard() {
  const t = useBox(A.timer)
  const now = useNow(!!t)
  if (!t) return null
  return (
    <div class="group timer-card">
      <div class="timer-top" role="timer" aria-label={`正在给${t.name}计时`}>
        <span class="timer-dot" aria-hidden="true" />
        <span class="timer-name">{t.name}</span>
        <span class="timer-clock">{clock(now - t.start)}</span>
      </div>
      <div class="timer-bottom">
        <span class="timer-since">{startedAt(t.start)} 开始</span>
        <button type="button" class="text-btn muted small" onClick={A.discardTimer}>
          放弃
        </button>
        <button type="button" class="btn tonal small" onClick={A.stopTimer}>
          结束并记下
        </button>
      </div>
    </div>
  )
}

/** 计时超过 4 小时：多半是忘了结束，先问实际学了多久 */
export function TimerStopSheet() {
  const t0 = useBox(A.timerStop)
  const [t, setT] = useState<A.Timer | null>(null)
  const [min, setMin] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (t0) {
      setT(t0)
      setMin('')
      setTimeout(() => input.current?.focus(), 80)
    }
  }, [t0])
  const close = () => A.timerStop.set(null)
  const n = Number(min)
  return (
    <Sheet open={!!t0} onClose={close} title="这次学了多久？" label="结束计时">
      {t && (
        <form
          class="timer-stop"
          onSubmit={(e) => {
            e.preventDefault()
            if (!(n >= 1)) return input.current?.focus()
            A.logTimer(t, Math.round(n))
            close()
          }}
        >
          <p class="sheet-sub">
            「{t.name}」从 {startedAt(t.start)} 开始计时，已经过了 {A.minutesLabel(A.timerMinutes(t))}，像是忘了结束。实际学了多少分钟？
          </p>
          <input
            ref={input}
            class="field-input big"
            value={min}
            onInput={(e) => setMin((e.target as HTMLInputElement).value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder="分钟"
            autocomplete="off"
            aria-label="实际学了多少分钟"
          />
          <div class="quick-bottom">
            <button
              type="button"
              class="text-btn muted"
              onClick={() => {
                A.discardTimer()
                close()
              }}
            >
              不记这次
            </button>
            <button type="submit" class="text-btn strong" disabled={!(n >= 1)}>
              记下
            </button>
          </div>
        </form>
      )}
    </Sheet>
  )
}
