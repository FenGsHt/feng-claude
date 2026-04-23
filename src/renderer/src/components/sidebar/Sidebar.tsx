import React, { useState, useEffect } from 'react'
import { FileTree } from './FileTree'
import { HistoryPanel } from './HistoryPanel'
import { SlashCommandsPanel } from './SlashCommandsPanel'
import { SettingsPanel } from '../settings/SettingsPanel'
import { useFileTree } from '../../hooks/useFileTree'
import { useSessionStore } from '../../store/sessionStore'

type Tab = 'files' | 'history' | 'commands' | 'settings'

export function Sidebar(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('files')
  const { tree, loading, currentPath, loadTree, openDirDialog } = useFileTree()
  const { sessions, activeSessionId, loadHistory } = useSessionStore()

  const activeSession = sessions.find((s) => s.id === activeSessionId)

  // Load file tree when active session workdir changes
  useEffect(() => {
    if (activeSession?.workdir) {
      loadTree(activeSession.workdir)
    }
  }, [activeSession?.workdir, loadTree])

  // Load history on mount
  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const handleChangePath = async () => {
    await openDirDialog()
  }

  return (
    <div className="flex flex-col w-60 shrink-0 bg-claude-surface border-r border-claude-border overflow-hidden">
      {/* Tab selector */}
      <div className="flex border-b border-claude-border shrink-0">
        {(['files', 'history', 'commands', 'settings'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'text-claude-text border-b-2 border-amber-500'
                : 'text-claude-muted hover:text-claude-text'
            }`}
          >
            {tab === 'settings' ? '⚙' : tab === 'commands' ? '/' : tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'files' ? (
          <FileTree
            nodes={tree}
            loading={loading}
            currentPath={currentPath}
            onChangePath={handleChangePath}
          />
        ) : activeTab === 'history' ? (
          <div className="overflow-y-auto h-full">
            <HistoryPanel />
          </div>
        ) : activeTab === 'commands' ? (
          <SlashCommandsPanel />
        ) : (
          <SettingsPanel />
        )}
      </div>
    </div>
  )
}
