import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { cx } from '../lib/ui'
import { Icon } from './Icon'
import { SyncPill } from './SyncPill'

interface Props {
  title: string
  /** 标题前的小图标（雾蓝），或任意节点（如进度饼图） */
  icon?: string | ComponentChildren
  subtitle?: ComponentChildren
  /** 子页面的返回地址；四个主页不传，没有返回箭头 */
  back?: { href: string; label?: string } | false
  actions?: ComponentChildren
  children: ComponentChildren
  class?: string
}

/** Things 式页面：左上「‹」，大标题配图标；滚动后标题收进顶栏 */
export function Page({ title, icon, subtitle, back, actions, children, class: cls }: Props) {
  const sentinel = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting), { rootMargin: '-52px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const b = back || null

  return (
    <div class={cx('page', cls)}>
      <header class={cx('topbar', compact && 'compact')}>
        <div class="topbar-side">
          {b && (
            <a class="back" href={b.href} aria-label={b.label ?? '返回'}>
              <Icon name="back" size={24} />
              {b.label && <span>{b.label}</span>}
            </a>
          )}
        </div>
        <div class="topbar-title">{title}</div>
        <div class="topbar-side end">
          <SyncPill />
          {actions}
        </div>
      </header>
      <div class="head">
        <h1>
          {icon && <span class="head-icon">{typeof icon === 'string' ? <Icon name={icon} size={26} /> : icon}</span>}
          <span>{title}</span>
        </h1>
        {subtitle && <div class="head-sub">{subtitle}</div>}
      </div>
      <div ref={sentinel} class="sentinel" />
      <div class="body">{children}</div>
    </div>
  )
}

/** 分组小标题 */
export function Section({ title, action, children, class: cls }: { title?: ComponentChildren; action?: ComponentChildren; children?: ComponentChildren; class?: string }) {
  return (
    <section class={cx('section', cls)}>
      {(title || action) && (
        <div class="section-head">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/** 兼容旧调用：不再画卡片，只是一个分组 */
export function Card({ title, action, children, class: cls, onClick }: { title?: ComponentChildren; action?: ComponentChildren; children?: ComponentChildren; class?: string; onClick?: () => void }) {
  return (
    <section class={cx('section', onClick && 'tappable', cls)} onClick={onClick}>
      {(title || action) && (
        <div class="section-head">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/** 空状态：一个很淡的大图标 + 一行文楷 */
export function Empty({ children, icon }: { children: ComponentChildren; icon?: string }) {
  return (
    <div class="empty">
      {icon && <Icon name={icon} size={44} />}
      <p>{children}</p>
    </div>
  )
}
