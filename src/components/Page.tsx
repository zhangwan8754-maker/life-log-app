import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { cx } from '../lib/ui'
import { Icon } from './Icon'
import { SyncPill } from './SyncPill'

interface Props {
  title: string
  subtitle?: ComponentChildren
  back?: { href: string; label: string }
  actions?: ComponentChildren
  children: ComponentChildren
  class?: string
}

/** 大标题页面：滚动后大标题收进顶栏 */
export function Page({ title, subtitle, back, actions, children, class: cls }: Props) {
  const sentinel = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting), { rootMargin: '-56px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div class={cx('page', cls)}>
      <header class={cx('appbar', compact && 'compact')}>
        <div class="appbar-side">
          {back && (
            <a class="appbar-back" href={back.href}>
              <Icon name="back" />
              <span>{back.label}</span>
            </a>
          )}
        </div>
        <div class="appbar-title">{title}</div>
        <div class="appbar-side end">
          {actions}
          <SyncPill />
        </div>
      </header>
      <div class="large-title">
        <h1>{title}</h1>
        {subtitle && <div class="subtitle">{subtitle}</div>}
      </div>
      <div ref={sentinel} class="title-sentinel" />
      <div class="page-body">{children}</div>
    </div>
  )
}

export function Card({
  title,
  action,
  children,
  class: cls,
  onClick,
}: {
  title?: ComponentChildren
  action?: ComponentChildren
  children?: ComponentChildren
  class?: string
  onClick?: () => void
}) {
  return (
    <section class={cx('card', onClick && 'tappable', cls)} onClick={onClick}>
      {(title || action) && (
        <div class="card-head">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Empty({ children }: { children: ComponentChildren }) {
  return <p class="empty">{children}</p>
}
