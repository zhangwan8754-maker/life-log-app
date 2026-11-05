import { useStore } from '../lib/hooks'
import { go } from '../lib/ui'

/** 同步状态：一切正常时什么都不显示，只在有事时出现一行小字 */
export function SyncPill() {
  const s = useStore()
  const n = s.pendingCount()
  if (s.status === 'idle' && !n) return null
  const label =
    s.status === 'syncing' ? '同步中' : s.status === 'offline' ? `离线${n ? ` · ${n}` : ''}` : s.status === 'error' ? '同步出错' : `待同步 · ${n}`
  return (
    <button
      type="button"
      class="sync"
      data-state={s.status === 'idle' ? 'pending' : s.status}
      title={s.error || (s.status === 'offline' ? '联网后自动同步' : '点击立即同步')}
      onClick={() => (s.status === 'error' ? go('#/settings') : s.flush())}
    >
      {label}
    </button>
  )
}
