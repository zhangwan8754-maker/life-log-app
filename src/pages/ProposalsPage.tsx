import { setDraft } from '../lib/actions'
import { ymd } from '../lib/dates'
import { useFile } from '../lib/hooks'
import { parseProposals, PROPOSALS, type Proposal } from '../lib/memory'
import { store } from '../lib/store'
import { go, markdown, toast } from '../lib/ui'
import { Empty, Page } from '../components/Page'

/** 提议里引的那句原话和它的出处日期，用来直接起草一张思想卡片 */
function quoteOf(p: Proposal): { body: string; from: string } | null {
  const body = p.text.match(/「([^」]{4,})」/)?.[1]
  if (!body) return null
  return { body, from: p.text.match(/days\/\d{4}\/(\d{4}-\d{2}-\d{2})\.md/)?.[1] ?? '' }
}

/**
 * AI 的提议：AI 想让我改「我的声音」（我是谁、思想、待办）时排在这里，它不会自己动。
 * 做完或不采纳，都划掉这一条。
 */
export function ProposalsPage() {
  const md = useFile(PROPOSALS)
  const items = parseProposals(md)
  const sections = [...new Set(items.map((p) => p.section))]

  const remove = (p: Proposal) => {
    const before = md!
    store.enqueue(PROPOSALS, { kind: 'proposal.remove', key: p.key, date: ymd() })
    toast(`已划掉第 ${p.n} 条`, {
      label: '撤销',
      run: () => store.enqueue(PROPOSALS, { kind: 'write', content: before, label: '记忆：恢复一条提议' }),
    })
  }

  return (
    <Page title="提议" icon="sparkle" subtitle={items.length ? `${items.length} 条等你决定` : undefined} back={{ href: '#/review', label: '复盘' }} class="proposals-page">
      <p class="group-note lead">AI 想动你写的东西时，先排在这里，它不会自己改。做完了或者不采纳，都划掉就行。</p>
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
      {md !== undefined && !items.length && (
        <div class="group">
          <Empty icon="sparkle">没有等你决定的提议。让 AI 复盘之后，它想让你改的地方会出现在这里。</Empty>
        </div>
      )}
    </Page>
  )
}
