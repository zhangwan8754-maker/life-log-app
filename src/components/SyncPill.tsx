import { useStore } from '../lib/hooks'
import { go } from '../lib/ui'

export function SyncPill() {
  const s = useStore()
  const n = s.pendingCount()
  const state = s.status === 'idle' && n ? 'pending' : s.status
  const label =
    s.status === 'syncing' ? '同步中' : s.status === 'offline' ? `离线${n ? ` ${n}` : ''}` : s.status === 'error' ? '同步出错' : n ? `待同步 ${n}` : '已同步'
  return (
    <button
      type="button"
      class="sync"
      data-state={state}
      title={s.error || (s.status === 'offline' ? '联网后自动同步' : '点击立即同步')}
      onClick={() => (s.status === 'error' ? go('#/settings') : s.flush())}
    >
      <i />
      <span>{label}</span>
    </button>
  )
}
