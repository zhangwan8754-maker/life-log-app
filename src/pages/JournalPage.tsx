import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { cnMonthDay, dayPath, isYmd, weekday, ymd } from '../lib/dates'
import { useAutoGrow, useFile } from '../lib/hooks'
import { getSection } from '../lib/md'
import { store } from '../lib/store'
import { debounce } from '../lib/ui'
import { Page } from '../components/Page'

export function JournalPage({ date }: { date: string }) {
  const d = isYmd(date) ? date : ymd()
  const path = dayPath(d)
  const md = useFile(path)
  const remote = getSection(md ?? '', '日记') ?? ''
  const [text, setText] = useState(remote)
  const [editing, setEditing] = useState(false)
  const touched = useRef(false)
  const ref = useAutoGrow(text)

  // 远端内容到达且用户还没动过时，同步进输入框
  useEffect(() => {
    if (!touched.current) setText(remote)
  }, [remote])

  const save = useMemo(
    () =>
      debounce((v: string) => {
        store.enqueue(path, { kind: 'journal', date: d, text: v })
        setEditing(false)
      }, 1200),
    [path],
  )
  useEffect(() => () => save.flush(), [save])
  useEffect(() => {
    if (md !== undefined) setTimeout(() => ref.current?.focus(), 80)
  }, [md === undefined])

  return (
    <Page
      title={cnMonthDay(d)}
      icon="journal"
      subtitle={`${weekday(d)} · 日记${editing ? ' · 编辑中' : ''}`}
      back={{ href: d === ymd() ? '#/' : `#/day/${d}`, label: d === ymd() ? '今天' : cnMonthDay(d) }}
      class="journal-page"
    >
      <textarea
        ref={ref}
        class="journal-area"
        value={text}
        placeholder="今天发生了什么？感受如何？"
        onInput={(e) => {
          const v = (e.target as HTMLTextAreaElement).value
          touched.current = true
          setText(v)
          setEditing(true)
          save(v)
        }}
        onBlur={() => save.flush()}
        aria-label="日记"
      />
    </Page>
  )
}
