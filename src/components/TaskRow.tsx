import type { ComponentChildren } from 'preact'
import { useRef } from 'preact/hooks'
import { dateSheet, recent, taskId, taskSheet, toggle } from '../lib/actions'
import { daysBetween, relDay } from '../lib/dates'
import { INBOX, type Task } from '../lib/todo'
import { cx, haptic, useBox } from '../lib/ui'
import { Check } from './Controls'
import { Icon } from './Icon'

const THRESHOLD = 76

/** 可左右滑动的行：右滑 = 主要动作，左滑 = 次要动作 */
export function SwipeRow({
  onRight,
  onLeft,
  right,
  left,
  children,
}: {
  onRight?: () => void
  onLeft?: () => void
  right?: ComponentChildren
  left?: ComponentChildren
  children: ComponentChildren
}) {
  const fg = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const st = useRef<{ x: number; y: number; dx: number; mode: 'idle' | 'h' | 'v'; id: number; armed: boolean } | null>(null)
  const suppress = useRef(false)

  const set = (dx: number, anim = false) => {
    const el = fg.current
    if (!el) return
    el.style.transition = anim ? 'transform .22s cubic-bezier(.2,.8,.2,1)' : 'none'
    el.style.transform = dx ? `translateX(${dx}px)` : ''
    root.current?.setAttribute('data-dir', dx > 0 ? 'right' : dx < 0 ? 'left' : '')
  }

  return (
    <div
      ref={root}
      class="swipe"
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        st.current = { x: e.clientX, y: e.clientY, dx: 0, mode: 'idle', id: e.pointerId, armed: false }
      }}
      onPointerMove={(e) => {
        const s = st.current
        if (!s || s.id !== e.pointerId) return
        const dx = e.clientX - s.x
        const dy = e.clientY - s.y
        if (s.mode === 'idle') {
          if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.4) {
            s.mode = 'h'
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          } else if (Math.abs(dy) > 10) s.mode = 'v'
        }
        if (s.mode !== 'h') return
        let d = dx
        if ((d > 0 && !onRight) || (d < 0 && !onLeft)) d = d / 5
        else if (Math.abs(d) > THRESHOLD) d = Math.sign(d) * (THRESHOLD + (Math.abs(d) - THRESHOLD) / 3)
        s.dx = d
        const armed = Math.abs(d) >= THRESHOLD && ((d > 0 && !!onRight) || (d < 0 && !!onLeft))
        if (armed !== s.armed) {
          s.armed = armed
          root.current?.classList.toggle('armed', armed)
          if (armed) haptic(6)
        }
        set(d)
      }}
      onPointerUp={() => {
        const s = st.current
        st.current = null
        root.current?.classList.remove('armed')
        if (!s || s.mode !== 'h') return
        suppress.current = true
        setTimeout(() => (suppress.current = false), 50)
        set(0, true)
        if (s.dx >= THRESHOLD && onRight) onRight()
        else if (s.dx <= -THRESHOLD && onLeft) onLeft()
      }}
      onPointerCancel={() => {
        st.current = null
        set(0, true)
      }}
      onClickCapture={(e) => {
        if (suppress.current) {
          e.stopPropagation()
          e.preventDefault()
        }
      }}
    >
      <div class="swipe-bg right">{right}</div>
      <div class="swipe-bg left">{left}</div>
      <div ref={fg} class="swipe-fg">
        {children}
      </div>
    </div>
  )
}

export function dateLabel(t: Task, today: string) {
  if (!t.date) return null
  const late = !t.done && t.date < today
  return <span class={cx('meta-date', late && 'late')}>{late ? `逾期 ${daysBetween(t.date, today)} 天` : relDay(t.date, today)}</span>
}

export function TaskRow({ task: t, today, showGroup = true, showDate = true }: { task: Task; today: string; showGroup?: boolean; showDate?: boolean }) {
  const rec = useBox(recent)
  const state = rec[taskId(t)]
  const done = t.done
  const meta = [
    showGroup && t.group !== INBOX && <span class="meta-group">{t.group}</span>,
    showDate && dateLabel(t, today),
    ...t.tags.map((g) => <span class="meta-tag">#{g}</span>),
  ].filter(Boolean)
  return (
    <div class={cx('task-wrap', state === 'leaving' && 'leaving')}>
      <div class="task-clip">
        <SwipeRow
          onRight={() => toggle(t)}
          onLeft={done ? undefined : () => dateSheet.set(t)}
          right={
            <>
              <Icon name="check" />
              {done ? '恢复' : '完成'}
            </>
          }
          left={
            <>
              改期
              <Icon name="calendar" />
            </>
          }
        >
          <div class={cx('task', done && 'done')} onClick={() => taskSheet.set(t)} role="button" tabIndex={0}>
            <Check done={done} onToggle={() => toggle(t)} label={done ? '标记为未完成' : '完成'} />
            <div class="task-main">
              <div class="task-text">{t.text || t.key}</div>
              {meta.length > 0 && <div class="task-meta">{meta}</div>}
            </div>
          </div>
        </SwipeRow>
      </div>
    </div>
  )
}
