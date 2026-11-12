import { useEffect, useState } from 'preact/hooks'
import * as A from '../lib/actions'
import { cnMonthDay, weekday } from '../lib/dates'
import { KIND_LABEL, noteKind, type Note } from '../lib/md'
import { useBox } from '../lib/ui'
import { Icon } from './Icon'
import { Sheet } from './Sheet'

/** 一条速记：点开可以编辑、删除。「投入 / 学到 / 问题」开头的显示成小标签 */
export function NoteRow({ date, note }: { date: string; note: Note }) {
  const k = noteKind(note.text)
  return (
    <li>
      <button type="button" class="note-row" onClick={() => A.noteSheet.set({ date, time: note.time, text: note.text })}>
        <time>{note.time}</time>
        <span>
          {k.kind !== 'plain' && <em class={`kind ${k.kind}`}>{KIND_LABEL[k.kind]}</em>}
          {k.body}
        </span>
        <Icon name="more" size={18} class="note-more" />
      </button>
    </li>
  )
}

export function NoteSheet() {
  const n0 = useBox(A.noteSheet)
  const [n, setN] = useState<A.NoteRef | null>(null)
  const [text, setText] = useState('')
  useEffect(() => {
    if (n0) {
      setN(n0)
      setText(n0.text)
    }
  }, [n0])

  /** 保存改动（如果有），返回最新的这条速记 */
  const commit = () => (n ? A.editNote(n, text) : n)
  const close = () => {
    commit()
    A.noteSheet.set(null)
  }

  return (
    <Sheet open={!!n0} onClose={close} title={n ? `速记 · ${n.time || '无时间'}` : ''} label="编辑速记">
      {n && (
        <div class="note-sheet">
          <p class="sheet-sub">
            {cnMonthDay(n.date)} {weekday(n.date)}
          </p>
          <textarea class="task-edit" rows={3} value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} aria-label="速记内容" />
          <div class="quick-bottom">
            <button
              type="button"
              class="text-btn danger"
              onClick={() => {
                A.deleteNote(n)
                A.noteSheet.set(null)
              }}
            >
              <Icon name="trash" size={18} />
              删除
            </button>
            <button type="button" class="text-btn strong" onClick={close}>
              完成
            </button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
