import { setDraft } from '../lib/actions'
import { ymd } from '../lib/dates'
import { useStore, useTree } from '../lib/hooks'
import { advisors, PROPOSALS_DIR, type Advisor, type Proposal } from '../lib/memory'
import { store } from '../lib/store'
import { go, markdown, toast } from '../lib/ui'
import { Tabs } from '../components/Controls'
import { Empty, Page } from '../components/Page'

/** 建议里引的那句原话和它的出处日期，用来直接起草一张思想卡片 */
function quoteOf(p: Proposal): { body: string; from: string } | null {
  const body = p.text.match(/「([^」]{4,})」/)?.[1]
  if (!body) return null
  return { body, from: p.text.match(/days\/\d{4}\/(\d{4}-\d{2}-\d{2})\.md/)?.[1] ?? '' }
}

export const useAdvisors = (): Advisor[] => {
  const s = useStore()
  useTree('memory/')
  return advisors(s.list('memory/'), (p) => s.read(p))
}

/**
 * AI 的建议：每个 AI（Claude、DeepSeek……）一栏，各看各的，互不覆盖。
 * AI 想让我改「我的声音」（我是谁、思想、待办）时排在这里，它不会自己动；做完或不采纳，都划掉。
 */
export function AdvicePage({ agent }: { agent?: string }) {
  const s = useStore()
  const all = useAdvisors()
  const cur = all.find((a) => a.agent === agent) ?? all[0]
  const items = cur?.items ?? []
  const sections = [...new Set(items.map((p) => p.section))]

  const remove = (p: Proposal) => {
    const before = s.read(cur.path)!
    store.enqueue(cur.path, { kind: 'proposal.remove', key: p.key, date: ymd() })
    toast(`已划掉第 ${p.n} 条`, {
      label: '撤销',
      run: () => store.enqueue(cur.path, { kind: 'write', content: before, label: '记忆：恢复一条建议' }),
    })
  }

  return (
    <Page title="AI 的建议" icon="sparkle" back={{ href: '#/review', label: '复盘' }} class="advice-page">
      {all.length > 1 && (
        <div class="notes-tabs">
          <Tabs value={cur.agent} options={all.map((a) => ({ value: a.agent, label: `${a.name}${a.items.length ? ` ${a.items.length}` : ''}` }))} onChange={(v) => go(`#/advice/${encodeURIComponent(v)}`)} />
        </div>
      )}
      {cur && (
        <p class="group-note lead">
          {all.length === 1 && <b>{cur.name}　</b>}
          {items.length ? `${items.length} 条等你决定` : '没有等你决定的建议'}
          {cur.updated && ` · 更新于 ${cur.updated.slice(5).replace('-', '/')}`}。它不会自己改你写的东西；做完或不采纳，划掉就行。
        </p>
      )}
      {sections.map((sec) => (
        <>
          {sec && <p class="group-label">{sec}</p>}
          <div class="group">
            {items
              .filter((p) => p.section === sec)
              .map((p) => {
                const q = /思想/.test(sec) ? quoteOf(p) : null
                return (
                  <div class="proposal">
                    <span class="proposal-n">{p.n}</span>
                    <div class="proposal-main">
                      <div class="prose" dangerouslySetInnerHTML={{ __html: markdown(p.text) }} />
                      <div class="proposal-actions">
                        {q && (
                          <button
                            type="button"
                            class="text-btn small"
                            onClick={() => {
                              setDraft(q)
                              go('#/thought/new')
                            }}
                          >
                            写成思想
                          </button>
                        )}
                        {/我是谁|me\.md/.test(sec) && (
                          <a class="text-btn small" href="#/me">
                            去「我是谁」
                          </a>
                        )}
                        <button type="button" class="text-btn small muted" aria-label={`划掉第 ${p.n} 条`} onClick={() => remove(p)}>
                          划掉
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        </>
      ))}
      {s.treeLoaded && !all.length && (
        <div class="group">
          <Empty icon="sparkle">还没有 AI 留下建议。让 Claude、DeepSeek 或别的 AI 读这个仓库并复盘一次，它的建议会各自出现在这里（{PROPOSALS_DIR}）。</Empty>
        </div>
      )}
    </Page>
  )
}
