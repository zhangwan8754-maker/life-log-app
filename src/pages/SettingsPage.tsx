import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import { useStore } from '../lib/hooks'
import { go, toast } from '../lib/ui'
import { BrandMark } from '../components/Icon'
import { Page } from '../components/Page'

export function SettingsPage() {
  const s = useStore()
  const c = s.config
  const [owner, setOwner] = useState(c?.owner ?? '')
  const [repo, setRepo] = useState(c?.repo ?? 'life-log')
  const [branch, setBranch] = useState(c?.branch ?? '')
  const [token, setToken] = useState(c?.token ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const field = (label: string, value: string, set: (v: string) => void, props: Record<string, unknown> = {}) => (
    <label class="field-row">
      <span>{label}</span>
      <input value={value} onInput={(e) => set((e.target as HTMLInputElement).value)} autocapitalize="off" autocomplete="off" spellcheck={false} {...props} />
    </label>
  )
  const note = (children: ComponentChildren) => <p class="group-note">{children}</p>

  const body = (
    <>
      {!c && (
        <div class="welcome">
          <BrandMark size={44} />
          <p>计划、日记、思想，都以 Markdown 存在你自己的 GitHub 仓库里。手机电脑互通，AI 随时可读。</p>
        </div>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setMsg('连接中…')
          try {
            const info = await s.connect({ owner: owner.trim(), repo: repo.trim(), branch: branch.trim(), token: token.trim() })
            toast(info.private ? '已连接' : '注意：这个仓库是公开的，任何人都能看到你的记录')
            go('#/')
          } catch (err) {
            setMsg(`连接失败：${(err as Error).message}`)
          } finally {
            setBusy(false)
          }
        }}
      >
        <p class="group-label">数据仓库</p>
        <div class="group">
          {field('用户名', owner, setOwner, { required: true, placeholder: 'GitHub 用户名' })}
          {field('仓库', repo, setRepo, { required: true, placeholder: 'life-log' })}
          {field('分支', branch, setBranch, { placeholder: '默认分支' })}
          {field('令牌', token, setToken, { required: true, type: 'password', placeholder: 'github_pat_…' })}
        </div>
        {note(
          <>
            令牌在{' '}
            <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">
              GitHub → Fine-grained token
            </a>{' '}
            新建：只选这个仓库，Contents 设为 Read and write。令牌只保存在这台设备上。
          </>,
        )}
        <button type="submit" class="btn primary block settings-submit" disabled={busy}>
          {c ? '保存' : '连接'}
        </button>
        {msg && <p class="group-note">{msg}</p>}
      </form>
      {c && (
        <>
          <p class="group-label">这台设备</p>
          <div class="group">
            <div class="row plain">
              <span class="row-label">未同步的修改</span>
              <span class="row-detail">{s.pendingCount()} 条</span>
            </div>
            <button
              type="button"
              class="row danger-row"
              onClick={() => {
                const n = s.pendingCount()
                if (confirm(n ? `还有 ${n} 条修改没同步，断开会丢失它们。确定？` : '断开并清除这台设备上的缓存和令牌？')) {
                  s.disconnect()
                  go('#/settings')
                }
              }}
            >
              <span class="row-label">断开并清除本机数据</span>
            </button>
          </div>
        </>
      )}
    </>
  )
  return c ? (
    <Page title="设置" icon="settings" back={{ href: '#/review', label: '复盘' }}>
      {body}
    </Page>
  ) : (
    <Page title="Life Log">{body}</Page>
  )
}
