/** 本地内容缓存：sha → 文本。sha 不可变，所以缓存永不过期，只需清理不再引用的条目。 */

const DB = 'life-log'
const STORE = 'blobs'

let dbp: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  return (dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  }))
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | void> {
  return db().then(
    (d) =>
      new Promise((resolve, reject) => {
        const t = d.transaction(STORE, mode)
        const req = fn(t.objectStore(STORE))
        t.oncomplete = () => resolve(req ? req.result : undefined)
        t.onerror = () => reject(t.error)
      }),
  )
}

export async function loadAll(): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  try {
    const d = await db()
    await new Promise<void>((resolve, reject) => {
      const req = d.transaction(STORE).objectStore(STORE).openCursor()
      req.onsuccess = () => {
        const c = req.result
        if (!c) return resolve()
        out.set(c.key as string, c.value as string)
        c.continue()
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    // 隐私模式等情况下没有 IndexedDB：仅用内存
  }
  return out
}

export const put = (sha: string, text: string) => tx('readwrite', (s) => s.put(text, sha)).catch(() => {})

export const del = (shas: string[]) =>
  tx('readwrite', (s) => {
    for (const k of shas) s.delete(k)
  }).catch(() => {})

export const clear = () => tx('readwrite', (s) => s.clear()).catch(() => {})
