import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import * as A from '../lib/actions'
import { ymd } from '../lib/dates'
import { useFile } from '../lib/hooks'
import { fmtHours } from '../lib/md'
import { store } from '../lib/store'
import { formatTargets, meTargets, TARGET_SECTION, TARGET_SUB, type Progress, type Target } from '../lib/targets'
import { useBox } from '../lib/ui'
import { Icon } from './Icon'
import { Sheet } from './Sheet'
import { knownNames } from './Spent'

/** 每周目标的进度：每项一行，条的长短是「实际 / 目标」，满了就换成完成色 */
export function TargetBars({ items }: { items: Progress[] }) {
  return (
    <ul class="spent-bars target-bars">
      {items.map((x) => {
        const pct = Math.min(100, (x.done / x.hours) * 100)
        return (
          <li class={pct >= 100 ? 'met' : undefined}>
            <span class="spent-name">{x.name}</span>
            <span class="spent-track" role="progressbar" aria-label={`${x.name}本周进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
              <i style={{ width: `${pct}%` }} />
            </span>
            <span class="spent-hours">
              <b>
                {pct >= 100 && '✓ '}
                {fmtHours(x.done)}
              </b>{' '}
              / {fmtHours(x.hours)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

interface Row {
  name: string
  hours: string
}
const cleanName = (s: string) => s.replace(/[，,、；;:：]/g, ' ').replace(/\s+/g, ' ').trim()
const toTargets = (rows: Row[]): Target[] =>
  rows.map((r) => ({ name: cleanName(r.name), hours: Number(r.hours) })).filter((t) => t.name && t.hours > 0)

/** 每周目标：每科一周打算投入几小时。写进 me.md「方向 · 每周投入」 */
export function TargetSheet() {
  const open = useBox(A.targetSheet)
  const me = useFile(open ? 'me.md' : null)
  const [rows, setRows] = useState<Row[]>([])
  const ready = useRef(false)
  const names = useMemo(() => (open ? knownNames() : []), [open])

  useEffect(() => {
    if (!open) ready.current = false
    else if (!ready.current && me !== undefined) {
      ready.current = true
      const cur = meTargets(me)
      setRows(cur.length ? cur.map((t) => ({ name: t.name, hours: String(Math.round(t.hours * 10) / 10) })) : [{ name: '', hours: '' }])
    }
  }, [open, me])

  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const close = () => {
    if (ready.current) {
      const next = formatTargets(toTargets(rows))
      if (next !== formatTargets(meTargets(me))) store.enqueue('me.md', { kind: 'me.set', section: TARGET_SECTION, sub: TARGET_SUB, text: next, date: ymd() })
    }
    A.targetSheet.set(false)
  }
  const taken = new Set(rows.map((r) => cleanName(r.name)))
  const suggest = names.filter((n) => !taken.has(n)).slice(0, 8)
  const total = toTargets(rows).reduce((a, t) => a + t.hours, 0)

  return (
    <Sheet open={open} onClose={close} title="每周目标" label="每周目标">
      <div class="target-sheet">
        <p class="sheet-sub">每科一周打算投入几小时？名称和记投入时用的一样；「英语」会把「英语语法」这样以它开头的也算进去。</p>
        <div class="target-rows">
          {rows.map((r, i) => (
            <div class="target-row">
              <input
                class="field-input"
                value={r.name}
                onInput={(e) => set(i, { name: (e.target as HTMLInputElement).value })}
                placeholder="名称，例如 数学"
                autocomplete="off"
                aria-label={`第 ${i + 1} 项的名称`}
              />
              <input
                class="field-input target-hours"
                value={r.hours}
                onInput={(e) => set(i, { hours: (e.target as HTMLInputElement).value.replace(/[^\d.]/g, '') })}
                inputMode="decimal"
                placeholder="0"
                autocomplete="off"
                aria-label={`${cleanName(r.name) || `第 ${i + 1} 项`}每周几小时`}
              />
              <span class="target-unit">小时</span>
              <button type="button" class="icon-btn small" aria-label={`去掉${cleanName(r.name) || `第 ${i + 1} 项`}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                <Icon name="close" size={18} />
              </button>
            </div>
          ))}
        </div>
        <div class="chips target-add">
          {suggest.map((n) => (
            <button type="button" class="chip" onClick={() => setRows([...rows.filter((r) => r.name.trim() || r.hours), { name: n, hours: '' }])}>
              <Icon name="plus" size={14} />
              {n}
            </button>
          ))}
          <button type="button" class="chip" onClick={() => setRows([...rows, { name: '', hours: '' }])}>
            <Icon name="plus" size={14} />
            加一项
          </button>
        </div>
        <div class="quick-bottom">
          <span class="hint">{total > 0 ? `一周合计 ${fmtHours(total)}，平均每天 ${fmtHours(total / 7)}` : '没填时长的不会保存'}</span>
          <button type="button" class="text-btn strong" onClick={close}>
            完成
          </button>
        </div>
      </div>
    </Sheet>
  )
}
