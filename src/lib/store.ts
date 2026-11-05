/**
 * 同步核心。
 *
 * 每次修改都不是“覆盖文件”，而是一个可重放的操作（追加速记、设置 mood、勾选待办……）。
 * 操作先进入本地队列（持久化，离线也能记），再在联网时：取远端最新版本 → 依次重放 → 提交。
 * 这样电脑和手机同时改同一天的文件也不会互相覆盖。
 */
import { type Config, GitHub, HttpError } from './github'
import * as idb from './idb'
import { appendNote, deleteNote, editNote, newDay, restoreNote, setMeta, setSection } from './md'
import * as T from './todo'

export type OpArgs =
  | { kind: 'note'; date: string; time: string; text: string }
  | { kind: 'note.edit'; date: string; time: string; text: string; next: string }
  | { kind: 'note.delete'; date: string; time: string; text: string }
  | { kind: 'note.restore'; date: string; time: string; text: string }
  | { kind: 'meta'; date: string; key: string; value: string }
  | { kind: 'journal'; date: string; text: string }
  | { kind: 'task.add'; text: string; group: string; date: string }
  | { kind: 'task.toggle'; key: string; group?: string; today: string }
  | { kind: 'task.date'; key: string; group?: string; date: string }
  | { kind: 'task.edit'; key: string; group?: string; text: string }
  | { kind: 'task.move'; key: string; group?: string; to: string }
  | { kind: 'task.delete'; key: string; group?: string }
  | { kind: 'project.add'; name: string; goal: string }
  | { kind: 'project.rename'; from: string; to: string }
  | { kind: 'project.goal'; name: string; goal: string }
  | { kind: 'project.delete'; name: string }
  | { kind: 'todo.migrate' }
  // v1 留在手机队列里、尚未同步的旧操作
  | { kind: 'todo.add'; text: string; section: string }
  | { kind: 'todo.toggle'; key: string; today: string }
  | { kind: 'todo.move'; key: string; section: string }
  | { kind: 'todo.delete'; key: string }
  | { kind: 'write'; content: string; label: string }

export type Op = OpArgs & { id: string; path: string }

const legacyGroup = (s: string) => (s === '之后' ? T.SOMEDAY : T.INBOX)

export function applyOp(c: string | null, op: OpArgs): string {
  switch (op.kind) {
    case 'note': return appendNote(c ?? newDay(op.date), op.time, op.text)
    case 'note.edit': return editNote(c ?? newDay(op.date), op.time, op.text, op.next)
    case 'note.delete': return deleteNote(c ?? newDay(op.date), op.time, op.text)
    case 'note.restore': return restoreNote(c ?? newDay(op.date), op.time, op.text)
    case 'meta': return setMeta(c ?? newDay(op.date), op.key, op.value)
    case 'journal': return setSection(c ?? newDay(op.date), '日记', op.text)
    case 'task.add': return T.addTask(c, op.text, op.group, op.date)
    case 'task.toggle': return T.toggleTask(c, op.key, op.today, op.group)
    case 'task.date': return T.setTaskDate(c, op.key, op.date, op.group)
    case 'task.edit': return T.editTask(c, op.key, op.text, op.group)
    case 'task.move': return T.moveTask(c, op.key, op.to, op.group)
    case 'task.delete': return T.deleteTask(c, op.key, op.group)
    case 'project.add': return T.addProject(c, op.name, op.goal)
    case 'project.rename': return T.renameProject(c, op.from, op.to)
    case 'project.goal': return T.setProjectGoal(c, op.name, op.goal)
    case 'project.delete': return T.deleteProject(c, op.name)
    case 'todo.migrate': return T.migrateTodo(c ?? T.emptyTodo())
    case 'todo.add': return T.addTask(c, op.text, legacyGroup(op.section))
    case 'todo.toggle': return T.toggleTask(c, op.key, op.today)
    case 'todo.move': return T.moveTask(c, op.key, legacyGroup(op.section))
    case 'todo.delete': return T.deleteTask(c, op.key)
    case 'write': return op.content
  }
}

/** 同一文件里可以合并的操作：后一个直接取代前一个 */
function coalesceKey(op: Op): string | null {
  if (op.kind === 'journal' || op.kind === 'write') return `${op.path}|${op.kind}`
  if (op.kind === 'meta') return `${op.path}|meta|${op.key}`
  return null
}

function label(op: Op): string {
  switch (op.kind) {
    case 'note':
    case 'note.edit':
    case 'note.restore': return `速记 ${op.date}`
    case 'note.delete': return `删除速记 ${op.date}`
    case 'meta': return `状态 ${op.date}`
    case 'journal': return `日记 ${op.date}`
    case 'write': return op.label
    case 'todo.migrate': return '待办：升级格式'
    default: return op.kind.startsWith('project') ? '项目' : '待办'
  }
}

export type Status = 'idle' | 'syncing' | 'offline' | 'error'

const TRACKED = (p: string) => p === 'me.md' || p === 'todo.md' || /^(days|thoughts|reviews)\/.+\.md$/.test(p)
const CFG_KEY = 'll.config'
const STATE_KEY = 'll.state'

interface Persisted {
  shas: Record<string, string | null>
  pending: Op[]
}

const ls = {
  get<T>(k: string): T | null {
    try {
      const v = localStorage.getItem(k)
      return v ? (JSON.parse(v) as T) : null
    } catch {
      return null
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v))
    } catch {}
  },
  del(k: string) {
    try {
      localStorage.removeItem(k)
    } catch {}
  },
}

class Store {
  config: Config | null = ls.get<Config>(CFG_KEY)
  status: Status = 'idle'
  error = ''
  /** 已知的远端 sha；null = 远端确认不存在；缺省 = 未知 */
  private shas: Record<string, string | null> = {}
  private pending: Op[] = []
  private blobs = new Map<string, string>()
  private listeners = new Set<() => void>()
  private gh: GitHub | null = null
  private flushing = false
  private flushTimer = 0
  private retryTimer = 0
  private lastWrite: Record<string, number> = {}
  treeLoaded = false

  async init() {
    const st = ls.get<Persisted>(STATE_KEY)
    if (st) {
      this.shas = st.shas ?? {}
      this.pending = st.pending ?? []
    }
    this.blobs = await idb.loadAll()
    // 清理不再引用的旧版本
    const live = new Set(Object.values(this.shas).filter(Boolean) as string[])
    const dead = [...this.blobs.keys()].filter((k) => !live.has(k))
    dead.forEach((k) => this.blobs.delete(k))
    if (dead.length) idb.del(dead)

    if (this.config) this.gh = new GitHub(this.config)
    addEventListener('online', () => this.flush())
    addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.flush()
    })
    if (this.pending.length) this.flush()
  }

  // ───── 配置 ─────

  async connect(cfg: Omit<Config, 'branch'> & { branch?: string }) {
    const gh = new GitHub({ ...cfg, branch: cfg.branch || 'main' })
    const info = await gh.repoInfo()
    const full: Config = { ...cfg, branch: cfg.branch || info.default_branch }
    const changed = JSON.stringify(full) !== JSON.stringify(this.config)
    this.config = full
    this.gh = new GitHub(full)
    ls.set(CFG_KEY, full)
    if (changed) {
      this.shas = {}
      this.treeLoaded = false
      this.persist()
    }
    this.notify()
    return info
  }

  disconnect() {
    this.config = null
    this.gh = null
    this.shas = {}
    this.pending = []
    this.blobs.clear()
    this.treeLoaded = false
    ls.del(CFG_KEY)
    ls.del(STATE_KEY)
    idb.clear()
    this.notify()
  }

  // ───── 读 ─────

  subscribe(fn: () => void) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private notify() {
    this.listeners.forEach((f) => f())
  }

  private persist() {
    ls.set(STATE_KEY, { shas: this.shas, pending: this.pending } satisfies Persisted)
  }

  /** 远端版本 + 本地未同步的操作。undefined = 还没加载 */
  read(path: string): string | null | undefined {
    const sha = this.shas[path]
    let base: string | null | undefined = sha === undefined ? undefined : sha === null ? null : this.blobs.get(sha)
    const ops = this.pending.filter((o) => o.path === path)
    if (base === undefined && !ops.length) return undefined
    return ops.reduce<string | null>((c, o) => applyOp(c, o), base ?? null)
  }

  pendingCount() {
    return this.pending.length
  }

  hasPending(path: string, kind?: OpArgs['kind']) {
    return this.pending.some((o) => o.path === path && (!kind || o.kind === kind))
  }

  /** 从远端拉取单个文件的最新版本 */
  async load(path: string) {
    if (!this.gh) return
    try {
      const f = await this.gh.getFile(path)
      this.setRemote(path, f?.sha ?? null, f?.content)
      this.notify()
    } catch (e) {
      this.fail(e)
    }
  }

  private setRemote(path: string, sha: string | null, content?: string) {
    this.shas[path] = sha
    if (sha && content !== undefined && !this.blobs.has(sha)) {
      this.blobs.set(sha, content)
      idb.put(sha, content)
    }
    this.persist()
  }

  /** 列出目录下的文件（含本地新建、未同步的） */
  list(prefix: string): string[] {
    const set = new Set<string>()
    for (const [p, sha] of Object.entries(this.shas)) if (sha && p.startsWith(prefix)) set.add(p)
    for (const o of this.pending) if (o.path.startsWith(prefix)) set.add(o.path)
    return [...set].sort()
  }

  /** 拉取整个仓库的文件索引，并下载缺失的内容（按 sha 缓存，只下载变化的） */
  async loadTree(prefixes: string[]) {
    if (!this.gh) return
    try {
      const t0 = Date.now()
      const tree = (await this.gh.tree()).filter((t) => TRACKED(t.path))
      const seen = new Set(tree.map((t) => t.path))
      for (const t of tree) if (!(this.lastWrite[t.path] > t0)) this.shas[t.path] = t.sha
      for (const p of Object.keys(this.shas)) if (!seen.has(p) && !(this.lastWrite[p] > t0)) this.shas[p] = null
      this.persist()
      this.treeLoaded = true
      this.notify()

      const missing = tree.filter((t) => prefixes.some((p) => t.path.startsWith(p)) && !this.blobs.has(t.sha))
      let i = 0
      let last = Date.now()
      const worker = async () => {
        while (i < missing.length) {
          const t = missing[i++]
          const text = await this.gh!.blob(t.sha)
          this.blobs.set(t.sha, text)
          idb.put(t.sha, text)
          if (Date.now() - last > 300) {
            last = Date.now()
            this.notify()
          }
        }
      }
      await Promise.all(Array.from({ length: 6 }, worker))
      this.notify()
    } catch (e) {
      this.fail(e)
    }
  }

  // ───── 写 ─────

  enqueue(path: string, args: OpArgs) {
    const op = { ...args, path, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}` } as Op
    const key = coalesceKey(op)
    if (key) this.pending = this.pending.filter((o) => coalesceKey(o) !== key)
    this.pending.push(op)
    this.persist()
    this.notify()
    clearTimeout(this.flushTimer)
    this.flushTimer = window.setTimeout(() => this.flush(), 1200)
  }

  async flush() {
    if (this.flushing || !this.gh || !this.pending.length) return
    if (!navigator.onLine) return this.setStatus('offline')
    this.flushing = true
    this.setStatus('syncing')
    try {
      while (this.pending.length) {
        const path = this.pending[0].path
        const ops = this.pending.filter((o) => o.path === path)
        let done = false
        for (let attempt = 0; attempt < 4 && !done; attempt++) {
          const remote = await this.gh.getFile(path)
          const content = ops.reduce<string | null>((c, o) => applyOp(c, o), remote?.content ?? null)!
          if (remote && content === remote.content) {
            this.setRemote(path, remote.sha, remote.content)
            done = true
            break
          }
          const msg = [...new Set(ops.map(label))].join('，')
          try {
            const sha = await this.gh.putFile(path, content, remote?.sha ?? null, msg)
            this.lastWrite[path] = Date.now()
            this.setRemote(path, sha, content)
            done = true
          } catch (e) {
            // 409/422：远端在此期间被改了 → 重新取、重新重放
            if (!(e instanceof HttpError && (e.status === 409 || e.status === 422))) throw e
          }
        }
        if (!done) throw new Error(`同步 ${path} 时多次冲突`)
        const ids = new Set(ops.map((o) => o.id))
        this.pending = this.pending.filter((o) => !ids.has(o.id))
        this.persist()
        this.notify()
      }
      this.setStatus('idle')
    } catch (e) {
      this.fail(e)
    } finally {
      this.flushing = false
    }
    if (this.pending.length && this.status !== 'error') {
      clearTimeout(this.retryTimer)
      this.retryTimer = window.setTimeout(() => this.flush(), 20000)
    }
  }

  private setStatus(s: Status, err = '') {
    this.status = s
    this.error = err
    this.notify()
  }

  private fail(e: unknown) {
    if (e instanceof HttpError) {
      const hint = e.status === 401 ? '令牌无效或已过期' : e.status === 403 ? '令牌没有该仓库的读写权限' : e.message
      this.setStatus('error', `${e.status} · ${hint}`)
    } else if (e instanceof TypeError || !navigator.onLine) {
      this.setStatus('offline')
    } else {
      this.setStatus('error', String((e as Error)?.message ?? e))
    }
  }
}

export const store = new Store()
