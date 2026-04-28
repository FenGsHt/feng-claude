import React, { useState, useEffect } from 'react'
import type { PetLogRecord } from '../../types/ipc'
import { useI18n } from '../../i18n'

export function PetLogPanel(): React.ReactElement {
  const [logs, setLogs] = useState<PetLogRecord[]>([])
  const [loading, setLoading] = useState(true)
  const { lang } = useI18n()

  const loadLogs = async (): void => {
    setLoading(true)
    try {
      const result = await window.electronAPI.pet.getLogs(100)
      setLogs(result)
    } catch (e) {
      console.error('Failed to load pet logs:', e)
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadLogs()
  }, [])

  const handleClear = async (): void => {
    try {
      await window.electronAPI.pet.clearLogs()
      setLogs([])
    } catch (e) {
      console.error('Failed to clear pet logs:', e)
    }
  }

  const formatDate = (timestamp: number): string => {
    const d = new Date(timestamp)
    return d.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const triggerTypeLabel: Record<string, string> = {
    auto: lang === 'zh' ? '自动' : 'Auto',
    manual: lang === 'zh' ? '手动' : 'Manual',
    pet: lang === 'zh' ? '抚摸' : 'Pet',
    'content-bank': lang === 'zh' ? '内容库' : 'Content',
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-claude-muted text-xs">
        {lang === 'zh' ? '加载中...' : 'Loading...'}
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-claude-muted text-xs gap-2">
        {lang === 'zh' ? '暂无宠物日志' : 'No pet logs yet'}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-claude-border shrink-0">
        <span className="text-[11px] text-claude-muted">
          {logs.length} {lang === 'zh' ? '条记录' : 'records'}
        </span>
        <button
          onClick={handleClear}
          className="text-[10px] px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 hover:bg-red-600/30"
        >
          {lang === 'zh' ? '清空' : 'Clear'}
        </button>
      </div>

      {/* Logs list */}
      <div className="flex-1 overflow-y-auto py-1">
        {logs.map((log) => (
          <div
            key={log.id}
            className="px-2 py-2 hover:bg-claude-border/30 border-b border-claude-border/30 last:border-b-0"
          >
            {/* Header: time + pet + trigger */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] text-claude-muted font-mono">
                {formatDate(log.timestamp)}
              </span>
              <span className="text-[10px] px-1 py-0.5 rounded bg-slate-700/50 text-slate-300">
                {log.petName}
              </span>
              <span className="text-[10px] px-1 py-0.5 rounded bg-amber-600/20 text-amber-400">
                {triggerTypeLabel[log.triggerType] ?? log.triggerType}
              </span>
            </div>

            {/* User message */}
            <div className="text-[11px] text-claude-text mb-1 leading-snug">
              <span className="text-claude-muted">{lang === 'zh' ? '问: ' : 'Q: '}</span>
              {log.userMessage.length > 100
                ? log.userMessage.slice(0, 100) + '...'
                : log.userMessage}
            </div>

            {/* Assistant message */}
            <div className="text-[11px] text-slate-300 leading-snug">
              <span className="text-claude-muted">{lang === 'zh' ? '答: ' : 'A: '}</span>
              {log.assistantMessage.length > 150
                ? log.assistantMessage.slice(0, 150) + '...'
                : log.assistantMessage}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}