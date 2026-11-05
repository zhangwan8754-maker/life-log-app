import { Marked } from 'marked'

type Child = Node | string | number | null | undefined | false
type Props = Record<string, unknown>

/** 极小的 DOM 构造器：h('div.cls', {onclick}, ...children) */
export function h<K extends keyof HTMLElementTagNameMap>(
  sel: K | `${K}.${string}`,
  props?: Props | Child | Child[],
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const [tag, ...cls] = sel.split('.')
  const el = document.createElement(tag as K)
  if (cls.length) el.className = cls.join(' ')
  if (Array.isArray(props) || props instanceof Node || typeof props !== 'object' || props === null) {
    children.unshift(props as Child | Child[])
  } else {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === false) continue
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v as EventListener)
      else if (k === 'class') el.className += (el.className ? ' ' : '') + v
      else if (k in el && k !== 'list') (el as any)[k] = v
      else el.setAttribute(k, v === true ? '' : String(v))
    }
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c))
  return el
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t = 0
  const d = (...a: A) => {
    clearTimeout(t)
    t = window.setTimeout(() => fn(...a), ms)
  }
  d.flush = (...a: A) => {
    clearTimeout(t)
    fn(...a)
  }
  d.cancel = () => clearTimeout(t)
  return d
}

/** textarea 随内容增高 */
export function autoGrow(t: HTMLTextAreaElement) {
  const fit = () => {
    t.style.height = 'auto'
    t.style.height = `${t.scrollHeight + 2}px`
  }
  t.addEventListener('input', fit)
  addEventListener('resize', fit)
  document.fonts?.ready.then(fit)
  requestAnimationFrame(fit)
  return fit
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

const marked = new Marked({ gfm: true, breaks: true })
// 记录里的原始 HTML 一律当作文本显示
marked.use({ renderer: { html: ({ text }) => esc(text) } })

export function markdown(src: string): HTMLElement {
  const div = h('div.prose')
  div.innerHTML = marked.parse(src, { async: false }) as string
  div.querySelectorAll('a').forEach((a) => {
    a.target = '_blank'
    a.rel = 'noopener'
  })
  div.querySelectorAll('input[type=checkbox]').forEach((i) => ((i as HTMLInputElement).disabled = true))
  return div
}

let toastTimer = 0
export function toast(msg: string) {
  let el = document.querySelector<HTMLElement>('.toast')
  if (!el) document.body.append((el = h('div.toast', { role: 'status' })))
  el.textContent = msg
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), 1800)
}

export const go = (hash: string) => (location.hash = hash)
