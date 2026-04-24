import React, { useState, useEffect } from 'react'
import { FileTree } from './FileTree'
import { HistoryPanel } from './HistoryPanel'
import { SlashCommandsPanel } from './SlashCommandsPanel'
import { SettingsPanel } from '../settings/SettingsPanel'
import { useFileTree } from '../../hooks/useFileTree'
import { useSessionStore } from '../../store/sessionStore'

type Tab = 'files' | 'history' | 'commands' | 'settings'

interface TabConfig {
  id: Tab
  label: string
  icon: React.ReactElement
}

function IconFiles(): React.ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M2.5 2A1.5 1.5 0 0 1 4 .5h5l3.5 3.5V13A1.5 1.5 0 0 1 11 14.5H4A1.5 1.5 0 0 1 2.5 13V2Z"
        stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
      <path d="M9 .5V4H12.5" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
      <path d="M5 8h5M5 10.5h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  )
}

function IconHistory(): React.ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M7.5 4.5V7.5l2 2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconCommands(): React.ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M3 4l3.5 3.5L3 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9 11h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

function IconSettings(): React.ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.1"/>
      <path
        d="M7.5 1v1.5m0 9V13M13 7.5h-1.5m-9 0H1m10.3-4.8-1.06 1.06M4.76 10.24 3.7 11.3M11.3 11.3l-1.06-1.06M4.76 4.76 3.7 3.7"
        stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  )
}

const TABS: TabConfig[] = [
  { id: 'files', label: 'Files', icon: <IconFiles /> },
  { id: 'history', label: 'History', icon: <IconHistory /> },
  { id: 'commands', label: 'Commands', icon: <IconCommands /> },
  { id: 'settings', label: 'Settings', icon: <IconSettings /> }
]

export function Sidebar(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('files')
  const { tree, loading, currentPath, loadTree, openDirDialog } = useFileTree()
  const { sessions, activeSessionId, loadHistory } = useSessionStore()

  const activeSession = sessions.find((s) => s.id === activeSessionId)

  useEffect(() => {
    if (activeSession?.workdir) loadTree(activeSession.workdir)
  }, [activeSession?.workdir, loadTree])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  return (
    <div className="flex shrink-0 bg-claude-surface border-r border-claude-border overflow-hidden">
      {/* Icon-only tab rail (left column) */}
      <div className="flex flex-col w-11 shrink-0 border-r border-claude-border py-1 items-center gap-0.5">
        {TABS.map((t) => {
          const isActive = activeTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              title={t.label}
              aria-label={t.label}
              className={`sidebar-tab-icon relative flex items-center justify-center w-9 h-9 rounded-md transition-colors ${
                isActive
                  ? 'text-claude-text bg-claude-bg/80'
                  : 'text-claude-muted hover:text-claude-text hover:bg-claude-bg/40'
              }`}
            >
              {t.icon}
              {/* Active accent bar */}
              {isActive && (
                <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full bg-amber-500" />
              )}
            </button>
          )
        })}
      </div>

      {/* Content panel */}
      <div className="flex flex-col w-52 overflow-hidden">
        {/* Panel header */}
        <div className="flex items-center h-9 px-3 border-b border-claude-border shrink-0">
          <span className="text-[11px] font-semibold text-claude-muted uppercase tracking-wider">
            {TABS.find((t) => t.id === activeTab)?.label}
          </span>
        </div>

        {/* Panel body */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'files' ? (
            <FileTree
              nodes={tree}
              loading={loading}
              currentPath={currentPath}
              onChangePath={() => openDirDialog()}
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
    </div>
  )
}
