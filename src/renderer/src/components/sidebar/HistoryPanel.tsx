import React, { useState } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import { historyRecordPrimaryLabel } from '../../lib/historyLabels'
import { TopicEditModal } from './TopicEditModal'

export function HistoryPanel(): React.ReactElement {
  const { history, restoreFromHistory, deleteHistory, updateHistoryTopic } = useSessionStore()
  const [topicEditId, setTopicEditId] = useState<string | null>(null)
  const editing = topicEditId ? history.find((r) => r.id === topicEditId) : undefined

  if (history.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-claude-muted text-xs">
        No history yet
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-0.5 py-1">
        {history.map((record) => (
          <div
            key={record.id}
            className="flex items-start gap-2 px-3 py-2 hover:bg-claude-border/50 rounded cursor-pointer group"
            title={`${record.workdir}\n左键打开 · 右键编辑主题`}
            onClick={() => restoreFromHistory(record)}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setTopicEditId(record.id)
            }}
          >
            <div className="flex-1 min-w-0">
              {/* [2026-04-23] 原仅 record.title；现 topic / lastUserPrompt 优先 */}
              <p className="text-xs text-claude-text truncate">{historyRecordPrimaryLabel(record)}</p>
              {/* [2026-04-23] 原仅显示最后一级目录名；改为展示完整路径便于区分同名文件夹 */}
              <p
                className="text-[10px] text-claude-muted truncate font-mono mt-0.5 leading-snug"
                title={record.workdir}
              >
                {record.workdir}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                deleteHistory(record.id)
              }}
              className="shrink-0 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-red-600/20 text-claude-muted hover:text-red-400 transition-all text-xs"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <TopicEditModal
        key={topicEditId ?? 'closed'}
        open={topicEditId != null && editing != null}
        initialValue={editing?.topic ?? ''}
        onSave={(value) => {
          if (!topicEditId) return
          void updateHistoryTopic(topicEditId, value.trim() === '' ? null : value.trim())
          setTopicEditId(null)
        }}
        onClear={() => {
          if (!topicEditId) return
          void updateHistoryTopic(topicEditId, null)
          setTopicEditId(null)
        }}
        onClose={() => setTopicEditId(null)}
      />
    </>
  )
}
