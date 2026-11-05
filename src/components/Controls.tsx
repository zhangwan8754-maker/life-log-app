import type { ComponentChildren } from 'preact'
import { useRef } from 'preact/hooks'
import { addDays, nextMonday, relDay, weekend } from '../lib/dates'
import { cx } from '../lib/ui'
import { Icon } from './Icon'

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  const i = Math.max(0, options.findIndex((o) => o.value === value))
  return (
    <div class="segmented" role="tablist" style={{ '--n': options.length, '--i': i }}>
      <span class="segmented-pill" />
      {options.map((o) => (
        <button type="button" role="tab" aria-selected={o.value === value} class={cx(o.value === value && 'on')} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Chip({ on, onClick, children, icon }: { on?: boolean; onClick: () => void; children: ComponentChildren; icon?: string }) {
  return (
    <button type="button" class={cx('chip', on && 'on')} aria-pressed={!!on} onClick={onClick}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  )
}

/** 计划日期：今天 / 明天 / 周末 / 下周 / 不定 / 选日期 */
export function DateChips({ value, today, onChange }: { value: string; today: string; onChange: (d: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const opts: [string, string][] = [
    ['今天', today],
    ['明天', addDays(today, 1)],
    ['周末', weekend(today)],
    ['下周', nextMonday(today)],
    ['不定', ''],
  ]
  const known = opts.some(([, d]) => d === value)
  return (
    <div class="chips">
      {opts.map(([label, d]) => (
        <Chip on={value === d} onClick={() => onChange(d)}>
          {label}
        </Chip>
      ))}
      <label class={cx('chip', !known && 'on')}>
        <Icon name="calendar" size={16} />
        {known ? '选日期' : relDay(value, today)}
        <input
          ref={input}
          type="date"
          class="date-input"
          value={value}
          onChange={(e) => onChange((e.target as HTMLInputElement).value)}
        />
      </label>
    </div>
  )
}

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
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9.5" />
        <path d="M7.5 12.3l3 3 6-6.3" />
      </svg>
    </button>
  )
}

export function ProgressRing({ done, total, size = 40 }: { done: number; total: number; size?: number }) {
  const r = 15.5
  const c = 2 * Math.PI * r
  const p = total ? done / total : 0
  return (
    <svg class="ring" width={size} height={size} viewBox="0 0 36 36" role="img" aria-label={`完成 ${done}/${total}`}>
      <circle cx="18" cy="18" r={r} class="ring-track" />
      <circle cx="18" cy="18" r={r} class="ring-value" stroke-dasharray={`${c * p} ${c}`} transform="rotate(-90 18 18)" />
      <text x="18" y="21.5" text-anchor="middle">
        {done}/{total}
      </text>
    </svg>
  )
}

export function ListRow({ icon, label, detail, href, onClick }: { icon: string; label: string; detail?: ComponentChildren; href?: string; onClick?: () => void }) {
  const inner = (
    <>
      <span class="row-icon">
        <Icon name={icon} size={20} />
      </span>
      <span class="row-label">{label}</span>
      {detail && <span class="row-detail">{detail}</span>}
      <Icon name="right" size={18} class="row-chevron" />
    </>
  )
  return href ? (
    <a class="list-row" href={href}>
      {inner}
    </a>
  ) : (
    <button type="button" class="list-row" onClick={onClick}>
      {inner}
    </button>
  )
}
