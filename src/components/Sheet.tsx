import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { cx } from '../lib/ui'
import { Icon } from './Icon'

interface Props {
  open: boolean
  onClose: () => void
  title?: ComponentChildren
  children: ComponentChildren
  /** 全屏（手机上占满屏幕） */
  full?: boolean
  label?: string
}

/** 底部弹层：手机上从底部滑出、可下拉关闭；桌面上是居中对话框 */
export function Sheet({ open, onClose, title, children, full, label }: Props) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; dy: number } | null>(null)

  useEffect(() => {
    if (open) {
      setMounted(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    } else if (mounted) {
      setShown(false)
      const t = setTimeout(() => setMounted(false), 260)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    document.body.classList.add('sheet-open')
    return () => {
      removeEventListener('keydown', onKey)
      document.body.classList.remove('sheet-open')
    }
  }, [open])

  // 键盘弹出时把弹层顶到键盘上方（iOS 不会缩小布局视口）
  useEffect(() => {
    if (!open || !window.visualViewport) return
    const vv = window.visualViewport
    const fit = () => panel.current?.style.setProperty('--kb', `${Math.max(0, innerHeight - vv.height - vv.offsetTop)}px`)
    vv.addEventListener('resize', fit)
    vv.addEventListener('scroll', fit)
    fit()
    return () => {
      vv.removeEventListener('resize', fit)
      vv.removeEventListener('scroll', fit)
    }
  }, [open])

  if (!mounted) return null

  const onDown = (e: PointerEvent) => {
    drag.current = { y: e.clientY, dy: 0 }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    const d = drag.current
    const p = panel.current
    if (!d || !p) return
    d.dy = Math.max(0, e.clientY - d.y)
    p.style.transition = 'none'
    p.style.transform = `translateY(${d.dy}px)`
  }
  const onUp = () => {
    const d = drag.current
    const p = panel.current
    drag.current = null
    if (!p || !d) return
    p.style.transition = ''
    p.style.transform = ''
    if (d.dy > 90) onClose()
  }

  return (
    <div class={cx('sheet-root', shown && 'shown')} role="dialog" aria-modal="true" aria-label={label}>
      <div class="sheet-backdrop" onClick={onClose} />
      <div ref={panel} class={cx('sheet', full && 'full')}>
        <div class="sheet-grab" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <span />
        </div>
        {title !== undefined && (
          <div class="sheet-head">
            <h2>{title}</h2>
            <button type="button" class="icon-btn" aria-label="关闭" onClick={onClose}>
              <Icon name="close" />
            </button>
          </div>
        )}
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  )
}
