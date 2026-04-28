import React, { useState, useEffect } from 'react'
import { FileTree } from './FileTree'
import { HistoryPanel } from './HistoryPanel'
import { SlashCommandsPanel } from './SlashCommandsPanel'
import { SettingsPanel } from '../settings/SettingsPanel'
import { TokenUsageWidget } from './TokenUsageWidget'
import { UsageChart } from '../stats/UsageChart'
import { PluginsPanel } from '../plugins/PluginsPanel'
import { GuidePanel } from '../guide/GuidePanel'
import { McpPanel } from '../mcp/McpPanel'
import { SkillsPanel } from '../skills/SkillsPanel'
import { PetWidget } from './PetWidget'
import { PetPanel } from './PetPanel'
import { TestPanel } from './TestPanel'
import { useFileTree } from '../../hooks/useFileTree'
import { useSessionStore } from '../../store/sessionStore'
import { useI18n } from '../../i18n'

type Tab = 'files' | 'history' | 'commands' | 'settings' | 'stats' | 'plugins' | 'guide' | 'mcp' | 'skills' | 'pet' | 'test'

// Global state for external tab control
let setActiveTabExternal: ((tab: Tab) => void) | null = null

export function navigateToSettingsTab(): void {
  if (setActiveTabExternal) {
    setActiveTabExternal('settings')
  }
}

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

function IconPlugins(): React.ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M6 2.5A1.5 1.5 0 0 1 7.5 1v0A1.5 1.5 0 0 1 9 2.5V3h2.5A1.5 1.5 0 0 1 13 4.5v2H12.5A1.5 1.5 0 0 0 11 8v0a1.5 1.5 0 0 0 1.5 1.5H13v2A1.5 1.5 0 0 1 11.5 13H9v-.5A1.5 1.5 0 0 0 7.5 11v0A1.5 1.5 0 0 0 6 12.5V13H3.5A1.5 1.5 0 0 1 2 11.5v-2h.5A1.5 1.5 0 0 0 4 8v0A1.5 1.5 0 0 0 2.5 6.5H2v-2A1.5 1.5 0 0 1 3.5 3H6v-.5z"
        stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
    </svg>
  )
}

function IconSkills(): React.ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M7.5 1.5L9.5 5.5L14 6.2L10.75 9.3L11.5 13.5L7.5 11.4L3.5 13.5L4.25 9.3L1 6.2L5.5 5.5L7.5 1.5Z"
        stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
    </svg>
  )
}

function IconMcp(): React.ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="1.5" y="4" width="5" height="7" rx="1" stroke="currentColor" strokeWidth="1.1"/>
      <rect x="8.5" y="4" width="5" height="7" rx="1" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M6.5 7.5h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <path d="M4 2v2M11 2v2M4 11v2M11 11v2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  )
}

function IconGuide(): React.ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M2.5 2A1.5 1.5 0 0 1 4 .5h7A1.5 1.5 0 0 1 12.5 2v11A1.5 1.5 0 0 1 11 14.5H4A1.5 1.5 0 0 1 2.5 13V2Z"
        stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
      <path d="M5 4.5h5M5 7h5M5 9.5h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  )
}

function IconStats(): React.ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="1.5" y="8" width="2.5" height="5.5" rx="0.5" stroke="currentColor" strokeWidth="1.1"/>
      <rect x="6" y="5" width="2.5" height="8.5" rx="0.5" stroke="currentColor" strokeWidth="1.1"/>
      <rect x="10.5" y="2" width="2.5" height="11.5" rx="0.5" stroke="currentColor" strokeWidth="1.1"/>
    </svg>
  )
}

function IconPetLog(): React.ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M4 10c1.5-1 3.5-1 7 0" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <path d="M3 12h9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  )
}

function IconPet(): React.ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M3 3.5C3 2.7 3.7 2 4.5 2S6 2.7 6 3.5 5.3 5 4.5 5 3 4.3 3 3.5Z" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M9 3.5C9 2.7 9.7 2 10.5 2S12 2.7 12 3.5 11.3 5 10.5 5 9 4.3 9 3.5Z" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M2 8.5C2 6.6 4.5 5 7.5 5S13 6.6 13 8.5c0 2.5-2.5 4.5-5.5 4.5S2 11 2 8.5Z" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M5.5 9.5c.5.5 1 .8 2 .8s1.5-.3 2-.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  )
}

function IconTest(): React.ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M5 7.5l1.5 1.5L10 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function Sidebar({ width }: { width: number }): React.ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('files')
  const { tree, loading, currentPath, loadTree, openDirDialog } = useFileTree()
  const { sessions, activeSessionId, loadHistory } = useSessionStore()
  const { t, lang } = useI18n()

  // Register external tab control callback
  useEffect(() => {
    setActiveTabExternal = setActiveTab
    return () => { setActiveTabExternal = null }
  }, [setActiveTab])

  const TABS: TabConfig[] = [
    { id: 'files', label: t.sidebar.files, icon: <IconFiles /> },
    { id: 'history', label: t.sidebar.history, icon: <IconHistory /> },
    { id: 'commands', label: t.sidebar.commands, icon: <IconCommands /> },
    { id: 'stats', label: t.sidebar.stats, icon: <IconStats /> },
    { id: 'plugins', label: t.sidebar.plugins, icon: <IconPlugins /> },
    { id: 'skills', label: t.sidebar.skills, icon: <IconSkills /> },
    { id: 'mcp', label: t.sidebar.mcp, icon: <IconMcp /> },
    { id: 'pet', label: lang === 'zh' ? '宠物' : 'Pet', icon: <IconPet /> },
    { id: 'test', label: t.sidebar.test, icon: <IconTest /> },
    { id: 'guide', label: t.sidebar.guide, icon: <IconGuide /> },
    { id: 'settings', label: t.sidebar.settings, icon: <IconSettings /> },
  ]

  const activeSession = sessions.find((s) => s.id === activeSessionId)

  useEffect(() => {
    if (activeSession?.workdir) loadTree(activeSession.workdir)
  }, [activeSession?.workdir, loadTree])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  return (
    <div className="flex shrink-0 bg-claude-surface border-r border-claude-border overflow-hidden" style={{ width }}>
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
              {isActive && (
                <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full bg-amber-500" />
              )}
            </button>
          )
        })}
      </div>

      {/* Content panel */}
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
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
          ) : activeTab === 'stats' ? (
            <UsageChart />
          ) : activeTab === 'plugins' ? (
            <PluginsPanel />
          ) : activeTab === 'skills' ? (
            <SkillsPanel />
          ) : activeTab === 'mcp' ? (
            <McpPanel />
          ) : activeTab === 'pet' ? (
            <PetPanel />
          ) : activeTab === 'test' ? (
            <TestPanel />
          ) : activeTab === 'guide' ? (
            <GuidePanel />
          ) : (
            <SettingsPanel />
          )}
        </div>

        {/* Pet widget — always visible above token usage */}
        <PetWidget />

        {/* Global token usage footer — always visible */}
        <TokenUsageWidget />
      </div>
    </div>
  )
}
