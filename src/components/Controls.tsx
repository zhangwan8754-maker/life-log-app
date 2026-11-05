import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import { addDays, nextMonday, parseYmd, relDay, shortWeekday, weekend, ymd } from '../lib/dates'
import { cx } from '../lib/ui'
import { Icon } from './Icon'

/** 文字标签切换：选中的字深、其余灰，下面一道细线 */
export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div class="tabs" role="tablist">
      {options.map((o) => (
        <button type="button" role="tab" aria-selected={o.value === value} class={cx(o.value === value && 'on')} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
/** 兼容旧调用 */
export const Segmented = Tabs

export function Chip({ on, onClick, children, icon }: { on?: boolean; onClick: () => void; children: ComponentChildren; icon?: string }) {
  return (
    <button type="button" class={cx('chip', on && 'on')} aria-pressed={!!on} onClick={onClick}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  )
}

/** 像 Things 的方形勾选框：填色 → 画出对勾 → 轻微回弹 */
export function Check({ done, onToggle, label }: { done: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      class={cx('check', done && 'done')}
      aria-label={label}
      aria-pressed={done}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <rect x="1" y="1" width="18" height="18" rx="5.5" />
        <path d="M5.8 10.4l2.9 2.9 5.6-6.1" />
      </svg>
    </button>
  )
}

/** 项目进度小饼图：空心圆 → 扇形逐渐填满 */
export function Pie({ done, total, size = 18 }: { done: number; total: number; size?: number }) {
  const p = total ? done / total : 0
  const r = 5.5
  const a = p * 2 * Math.PI
  const x = 9 + r * Math.sin(a)
  const y = 9 - r * Math.cos(a)
  const d = p >= 1 ? '' : `M9 9V${9 - r}A${r} ${r} 0 ${p > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z`
  return (
    <svg class="pie" width={size} height={size} viewBox="0 0 18 18" role="img" aria-label={`进度 ${done}/${total}`}>
      <circle cx="9" cy="9" r="7.6" class="pie-ring" />
      {p >= 1 ? <circle cx="9" cy="9" r={r} class="pie-fill" /> : p > 0 && <path d={d} class="pie-fill" />}
    </svg>
  )
}

export function ListRow({
  icon,
  label,
  detail,
  href,
  onClick,
  on,
  lead,
  chev,
}: {
  icon?: string
  label: ComponentChildren
  detail?: ComponentChildren
  href?: string
  onClick?: () => void
  on?: boolean
  lead?: ComponentChildren
  /** 右侧显示「›」，表示点进去还有一页 */
  chev?: boolean
}) {
  const inner = (
    <>
      <span class="row-icon">{lead ?? (icon && <Icon name={icon} size={22} />)}</span>
      <span class="row-label">{label}</span>
      {detail !== undefined && detail !== '' && <span class="row-detail">{detail}</span>}
      {chev && <Icon name="right" size={18} class="chev" />}
    </>
  )
  return href ? (
    <a class={cx('row', on && 'on')} href={href} aria-current={on ? 'page' : undefined}>
      {inner}
    </a>
  ) : (
    <button type="button" class={cx('row', on && 'on')} onClick={onClick}>
      {inner}
    </button>
  )
}

/** 像 Things 的「When」：几个常用日子 + 一个月历 + 不定 */
export function WhenPicker({ value, today, onPick }: { value: string; today: string; onPick: (d: string) => void }) {
  const [month, setMonth] = useState((value || today).slice(0, 7))
  const quick: [string, string, string][] = [
    ['today', '今天', today],
    ['calendar', '明天', addDays(today, 1)],
    ['box', weekend(today) === today ? '这个周末' : '本周末', weekend(today)],
    ['upcoming', '下周一', nextMonday(today)],
  ]
  const first = parseYmd(`${month}-01`)
  const start = addDays(`${month}-01`, -((first.getDay() + 6) % 7))
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const shift = (n: number) => setMonth(ymd(new Date(first.getFullYear(), first.getMonth() + n, 1)).slice(0, 7))
  return (
    <div class="when">
      {quick.map(([icon, label, d]) => (
        <button type="button" class={cx('when-row', value === d && 'on')} onClick={() => onPick(d)}>
          <Icon name={icon} size={20} />
          <span>{label}</span>
          <span class="when-hint">{d === today ? '' : `${shortWeekday(d)} ${Number(d.slice(5, 7))}/${Number(d.slice(8))}`}</span>
        </button>
      ))}
      <div class="cal">
        <div class="cal-head">
          <button type="button" class="icon-btn small" aria-label="上个月" onClick={() => shift(-1)}>
            <Icon name="back" size={18} />
          </button>
          <span>
            {first.getFullYear()}年{first.getMonth() + 1}月
          </span>
          <button type="button" class="icon-btn small" aria-label="下个月" onClick={() => shift(1)}>
            <Icon name="right" size={18} />
          </button>
        </div>
        <div class="cal-grid">
          {['一', '二', '三', '四', '五', '六', '日'].map((w) => (
            <span class="cal-wd">{w}</span>
          ))}
          {cells.map((c) => (
            <button
              type="button"
              class={cx('cal-day', !c.startsWith(month) && 'out', c === value && 'sel', c === today && 'today', c < today && 'past')}
              aria-label={c}
              onClick={() => onPick(c)}
            >
              {Number(c.slice(8))}
            </button>
          ))}
        </div>
      </div>
      <button type="button" class={cx('when-row', !value && 'on')} onClick={() => onPick('')}>
        <Icon name="close" size={20} />
        <span>不定</span>
        <span class="when-hint">不放进日程</span>
      </button>
    </div>
  )
}

export const whenLabel = (d: string, today: string) => (d ? relDay(d, today) : '不定')

export function ProgressRing({ done, total }: { done: number; total: number }) {
  return <Pie done={done} total={total} size={22} />
}
