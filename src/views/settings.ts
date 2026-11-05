import { store } from '../lib/store'
import { go, h, toast } from '../lib/ui'

export function mountSettings(root: HTMLElement) {
  const c = store.config
  const field = (label: string, input: HTMLInputElement, help?: Node | string) =>
    h('label.field', h('span.field-label', label), input, help && h('span.field-help', help))
  const owner = h('input.line-input', { value: c?.owner ?? '', placeholder: 'GitHub 用户名', autocapitalize: 'off', required: true })
  const repo = h('input.line-input', { value: c?.repo ?? 'life-log', placeholder: 'life-log', autocapitalize: 'off', required: true })
  const branch = h('input.line-input', { value: c?.branch ?? '', placeholder: '留空 = 仓库默认分支', autocapitalize: 'off' })
  const token = h('input.line-input', { value: c?.token ?? '', type: 'password', placeholder: 'github_pat_…', autocomplete: 'off', required: true })
  const msg = h('p.hint')
  const submit = h('button.btn.primary', { type: 'submit' }, c ? '保存' : '连接')

  const form = h(
    'form.settings',
    {
      onsubmit: async (e: Event) => {
        e.preventDefault()
        submit.disabled = true
        msg.textContent = '连接中…'
        try {
          const info = await store.connect({
            owner: owner.value.trim(),
            repo: repo.value.trim(),
            branch: branch.value.trim(),
            token: token.value.trim(),
          })
          if (!info.private) toast('注意：这个仓库是公开的，任何人都能看到你的记录')
          else toast('已连接')
          go('#/')
        } catch (err) {
          msg.textContent = `连接失败：${(err as Error).message}`
        } finally {
          submit.disabled = false
        }
      },
    },
    field('用户名', owner),
    field('数据仓库', repo, '建议保持私有'),
    field('分支', branch),
    field(
      '访问令牌',
      token,
      h(
        'span',
        '在 ',
        h('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener' }, 'GitHub → Fine-grained token'),
        ' 新建：Repository access 只选这个仓库，Permissions → Contents 设为 Read and write。令牌只保存在这台设备上。',
      ),
    ),
    h('div.row', submit, msg),
  )

  root.replaceChildren(
    h(
      'article.fade.narrow',
      h('header.page-head', h('div.eyebrow', c ? h('a', { href: '#/review' }, '‹ 回看') : '开始'), h('h1.title', c ? '设置' : 'Life Log')),
      !c && h('p.lede', '日记、待办、思想——都以 Markdown 存在你自己的 GitHub 仓库里。电脑与手机互通，AI 随时可读。'),
      form,
      c &&
        h(
          'section',
          h('h2.sec', '本机'),
          h('p.hint', `未同步的修改：${store.pendingCount()} 条`),
          h(
            'button.btn.danger',
            {
              type: 'button',
              onclick: () => {
                const n = store.pendingCount()
                if (confirm(n ? `还有 ${n} 条修改没同步，断开会丢失它们。确定？` : '断开并清除这台设备上的缓存和令牌？')) {
                  store.disconnect()
                  go('#/settings')
                }
              },
            },
            '断开并清除本机数据',
          ),
        ),
    ),
  )
  return () => {}
}
