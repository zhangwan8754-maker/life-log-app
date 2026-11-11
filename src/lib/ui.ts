import { Marked } from 'marked'
import { useEffect, useState } from 'preact/hooks'

/** 极简全局状态：一个值 + 订阅者 */
export class Box<T> {
  private ls = new Set<() => void>()
  constructor(public value: T) {}
  set(v: T) {
    this.value = v
    this.ls.forEach((f) => f())
  }
  subscribe(f: () => void) {
    this.ls.add(f)
    return () => {
      this.ls.delete(f)
    }
  }
}

export function useBox<T>(b: Box<T>): T {
  const [, force] = useState(0)
  useEffect(() => b.subscribe(() => force((x) => x + 1)), [b])
  return b.value
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t = 0
  let pending: A | null = null
  const d = (...a: A) => {
    pending = a
    clearTimeout(t)
    t = window.setTimeout(() => {
      pending = null
      fn(...a)
    }, ms)
  }
  d.flush = () => {
    clearTimeout(t)
    if (pending) {
      const a = pending
      pending = null
      fn(...a)
    }
  }
  d.pending = () => pending !== null
  return d
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const marked = new Marked({ gfm: true, breaks: true })
// 记录里的原始 HTML 一律当作文本显示
marked.use({ renderer: { html: ({ text }) => esc(text) } })

/** 仓库里文件之间的相对链接 → App 里对应的页面 */
function inAppLinks(src: string): string {
  return src
    .replace(/\]\((?:\.\.?\/)*days\/\d{4}\/(\d{4}-\d{2}-\d{2})\.md\)/g, '](#/day/$1)')
    .replace(/\]\((?:\.\.?\/)*reviews\/([^)\s]+\.md)\)/g, '](#/file/reviews/$1)')
    .replace(/\]\((?:\.\.?\/)*(?:memory\/)?(timeline|proposals)\.md\)/g, '](#/file/memory/$1.md)')
    .replace(/\]\((?:\.\.?\/)*(?:memory\/)?patterns\.md\)/g, '](#/memory/patterns)')
    .replace(/\]\((?:\.\.?\/)*me\.md\)/g, '](#/me)')
}

export function markdown(src: string): string {
  return (marked.parse(inAppLinks(src), { async: false }) as string)
    .replace(/<a (?!href="#)/g, '<a target="_blank" rel="noopener" ')
    .replace(/<input /g, '<input disabled ')
}

// ───── toast ─────

export interface Toast {
  id: number
  msg: string
  action?: { label: string; run: () => void }
}
export const toastBox = new Box<Toast | null>(null)
let toastTimer = 0
export function toast(msg: string, action?: Toast['action']) {
  toastBox.set({ id: Date.now(), msg, action })
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toastBox.set(null), action ? 4000 : 2000)
}

export const haptic = (ms = 8) => {
  try {
    navigator.vibrate?.(ms)
  } catch {}
}

export const go = (hash: string) => {
  location.hash = hash
}

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')
