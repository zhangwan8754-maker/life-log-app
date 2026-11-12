import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { dayPath, ymd } from './dates'
import { store } from './store'
import { parseTodo } from './todo'

/** 订阅整个 store；任何同步/修改都会触发重新渲染 */
export function useStore() {
  const [, force] = useState(0)
  useEffect(() => store.subscribe(() => force((x) => x + 1)), [])
  return store
}

/** 读一个文件，挂载时从远端拉一次最新版本 */
export function useFile(path: string | null) {
  useStore()
  useEffect(() => {
    if (path) store.load(path)
  }, [path])
  return path ? store.read(path) : undefined
}

/** 拉取文件索引并下载某些目录下的内容（按 sha 缓存） */
export function useTree(...prefixes: string[]) {
  useStore()
  const key = prefixes.join('|')
  useEffect(() => {
    store.loadTree(prefixes)
  }, [key])
  return store.treeLoaded
}

export function useTodo() {
  const md = useFile('todo.md')
  return { md: md ?? '', groups: parseTodo(md ?? ''), loading: md === undefined }
}

export const dayMd = (date: string) => store.read(dayPath(date))

/** 跨过午夜时刷新“今天” */
export function useToday() {
  const [t, set] = useState(ymd())
  useEffect(() => {
    const check = () => set(ymd())
    const id = setInterval(check, 60_000)
    addEventListener('visibilitychange', check)
    return () => {
      clearInterval(id)
      removeEventListener('visibilitychange', check)
    }
  }, [])
  return t
}

/** textarea 随内容增高 */
export function useAutoGrow(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const t = ref.current
    if (!t) return
    t.style.height = 'auto'
    t.style.height = `${t.scrollHeight + 2}px`
  }, [value])
  return ref
}

/** 现在的时刻；active 时每秒更新一次（计时用） */
export function useNow(active: boolean) {
  const [now, set] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const tick = () => set(Date.now())
    tick()
    const id = setInterval(tick, 1000)
    addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      removeEventListener('visibilitychange', tick)
    }
  }, [active])
  return now
}
