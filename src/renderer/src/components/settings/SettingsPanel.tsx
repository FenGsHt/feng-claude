import React, { useState, useEffect } from 'react'
import type { ClaudeSettings, ApiProfile, FallbackConfig } from '../../types/settings'
import { DEFAULT_SETTINGS, createDefaultProfile, DEFAULT_PRICING as SETTINGS_DEFAULT_PRICING } from '../../types/settings'
import { useI18n, useLangStore } from '../../i18n'
import { useThemeStore, type ThemeMode } from '../../store/themeStore'
import type { UpdateStatusPayload } from '../../types/ipc'
import { v4 as uuidv4 } from 'uuid'

export function SettingsPanel(): React.ReactElement {
  const [form, setForm] = useState<ClaudeSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const { t, lang } = useI18n()
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)

  // Update status
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusPayload | null>(null)
  const [checking, setChecking] = useState(false)

  // [2026-04-28] Profile 编辑弹窗
  const [editingProfile, setEditingProfile] = useState<ApiProfile | null>(null)
  const [showProfileEditor, setShowProfileEditor] = useState(false)
  const [isNewProfile, setIsNewProfile] = useState(false)

  // [2026-04-30] 备用配置折叠状态
  const [fallbacksExpanded, setFallbacksExpanded] = useState(true)

  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatus) return
    const unsub = window.electronAPI.onUpdateStatus((payload) => {
      setUpdateStatus(payload)
      setChecking(false)
    })
    return unsub
  }, [])

  useEffect(() => {
    window.electronAPI.settings.get().then((s) => {
      setForm(s)
      setLoading(false)
    })
  }, [])

  // 获取当前激活的 profile
  const activeProfile = form.profiles.find(p => p.id === form.activeProfileId) ?? form.profiles[0]

  // 处理非 API 配置的变化
  const handleChange = <K extends keyof ClaudeSettings>(key: K, value: ClaudeSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
    if (key === 'language') {
      useLangStore.getState().setLang(value as ClaudeSettings['language'])
    }
  }

  // [2026-04-28] 处理 profile 切换
  const handleProfileSwitch = async (profileId: string) => {
    const result = await window.electronAPI.profiles.setActive(profileId)
    if (result.success) {
      setForm(prev => ({ ...prev, activeProfileId: profileId }))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  // [2026-04-28] 处理 profile 字段变化
  const handleProfileChange = <K extends keyof ApiProfile>(key: K, value: ApiProfile[K]) => {
    if (!activeProfile) return
    const updatedProfile = { ...activeProfile, [key]: value }
    // 更新本地状态
    setForm(prev => ({
      ...prev,
      profiles: prev.profiles.map(p => p.id === activeProfile.id ? updatedProfile : p)
    }))
    setSaved(false)
    // 立即保存到主进程
    void window.electronAPI.profiles.update(activeProfile.id, { [key]: value })
  }

  // [2026-04-30] 备用配置操作
  const handleAddFallback = () => {
    if (!activeProfile) return
    const newFallback: FallbackConfig = {
      id: uuidv4(),
      name: lang === 'zh' ? `备用 ${((activeProfile.fallbacks?.length ?? 0) + 1)}` : `Fallback ${(activeProfile.fallbacks?.length ?? 0) + 1}`,
      enabled: true,
      // [2026-04-30] 默认复用主配置的地址和密钥
      baseUrl: activeProfile.baseUrl,
      authToken: activeProfile.authToken,
      model: activeProfile.model
    }
    const fallbacks = [...(activeProfile.fallbacks ?? []), newFallback]
    handleProfileChange('fallbacks', fallbacks)
  }

  const handleUpdateFallback = (fallbackId: string, updates: Partial<FallbackConfig>) => {
    if (!activeProfile) return
    const fallbacks = (activeProfile.fallbacks ?? []).map(f =>
      f.id === fallbackId ? { ...f, ...updates } : f
    )
    handleProfileChange('fallbacks', fallbacks)
  }

  const handleRemoveFallback = (fallbackId: string) => {
    if (!activeProfile) return
    const fallbacks = (activeProfile.fallbacks ?? []).filter(f => f.id !== fallbackId)
    handleProfileChange('fallbacks', fallbacks)
  }

  const handleToggleFallback = (fallbackId: string) => {
    if (!activeProfile) return
    const fallbacks = (activeProfile.fallbacks ?? []).map(f =>
      f.id === fallbackId ? { ...f, enabled: !f.enabled } : f
    )
    handleProfileChange('fallbacks', fallbacks)
  }

  // [2026-04-28] 添加新 profile
  const handleAddProfile = () => {
    setIsNewProfile(true)
    setEditingProfile(createDefaultProfile(lang === 'zh' ? '新配置' : 'New Profile', uuidv4()))
    setShowProfileEditor(true)
  }

  // [2026-04-28] 编辑当前 profile
  const handleEditProfile = () => {
    if (!activeProfile) return
    setIsNewProfile(false)
    setEditingProfile(activeProfile)
    setShowProfileEditor(true)
  }

  // [2026-04-28] 删除当前 profile
  const handleDeleteProfile = async () => {
    if (!activeProfile) return
    if (form.profiles.length <= 1) return // 不能删除最后一个
    const result = await window.electronAPI.profiles.delete(activeProfile.id)
    if (result.success) {
      const updated = await window.electronAPI.settings.get()
      setForm(updated)
    }
  }

  // [2026-04-28] 保存 profile 编辑
  const handleProfileSave = async (profile: ApiProfile) => {
    if (isNewProfile) {
      await window.electronAPI.profiles.add(profile)
      await window.electronAPI.profiles.setActive(profile.id)
    } else {
      await window.electronAPI.profiles.update(profile.id, profile)
    }
    const updated = await window.electronAPI.settings.get()
    setForm(updated)
    setShowProfileEditor(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleSave = async () => {
    // Always include current theme so saving other settings doesn't overwrite it
    await window.electronAPI.settings.set({ ...form, theme })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-claude-muted text-xs">
        {t.common.loading}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Language selector */}
      <div className="px-3 pt-3 pb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-claude-muted uppercase tracking-wider">
          {t.settings.language}
        </span>
        <div className="flex rounded overflow-hidden border border-claude-border text-[10px]">
          {(['zh', 'en'] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => handleChange('language', lang)}
              className={`px-2 py-0.5 transition-colors ${
                form.language === lang
                  ? 'bg-amber-500 text-black font-medium'
                  : 'text-claude-muted hover:text-claude-text'
              }`}
            >
              {lang === 'zh' ? t.settings.languageZh : t.settings.languageEn}
            </button>
          ))}
        </div>
      </div>

      {/* Theme selector */}
      <div className="px-3 pb-2 border-t border-claude-border pt-2">
        <span className="text-[10px] font-semibold text-claude-muted uppercase tracking-wider">
          {lang === 'zh' ? '主题模式' : 'Theme'}
        </span>
        <div className="flex rounded overflow-hidden border border-claude-border text-[10px] mt-1">
          {([
            ['dark', lang === 'zh' ? '暗色' : 'Dark'],
            ['light', lang === 'zh' ? '亮色' : 'Light'],
            ['auto', lang === 'zh' ? '自动' : 'Auto'],
          ] as [ThemeMode, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTheme(key)}
              className={`flex-1 px-2 py-0.5 transition-colors ${
                theme === key
                  ? 'bg-amber-500 text-black font-medium'
                  : 'text-claude-muted hover:text-claude-text'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Developer Mode toggle */}
      <div className="px-3 pb-2 border-t border-claude-border pt-2">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-[10px] font-semibold text-claude-muted uppercase tracking-wider">
            {lang === 'zh' ? '开发者模式' : 'Developer Mode'}
          </span>
          <div className="relative w-8 h-4 rounded-full bg-claude-border transition-colors"
            style={{ backgroundColor: form.devMode ? '#f59e0b' : undefined }}>
            <div className="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform"
              style={{ transform: form.devMode ? 'translateX(16px)' : 'translateX(0)' }} />
          </div>
          <input
            type="checkbox"
            className="sr-only"
            checked={!!form.devMode}
            onChange={(e) => handleChange('devMode' as never, e.target.checked as never)}
          />
        </label>
        <p className="mt-1 text-[9px] leading-snug text-claude-muted">
          {lang === 'zh' ? '开启后侧边栏显示日志面板，可捕获 console 日志并打开 DevTools' : 'Shows a log panel in sidebar to capture console logs and open DevTools'}
        </p>
      </div>
      <div className="px-3 pb-2 border-t border-claude-border pt-2">
        <div className="text-[10px] font-semibold text-claude-muted uppercase tracking-wider mb-1">
          {lang === 'zh' ? 'API 配置' : 'API Configuration'}
        </div>
        <div className="flex items-center gap-1">
          {/* Profile dropdown */}
          <select
            value={form.activeProfileId}
            onChange={(e) => handleProfileSwitch(e.target.value)}
            className="field-input"
            style={{ flex: 1, minWidth: 0 }}
            title={form.profiles.find(p => p.id === form.activeProfileId)?.model ?? ''}
          >
            {form.profiles.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.model})</option>
            ))}
          </select>
          {/* Add button */}
          <button
            onClick={handleAddProfile}
            title={lang === 'zh' ? '添加配置' : 'Add profile'}
            className="shrink-0 rounded border border-claude-border bg-claude-bg px-2 py-1 text-[10px] text-amber-500 hover:border-amber-600/50"
          >
            +
          </button>
          {/* Edit button */}
          <button
            onClick={handleEditProfile}
            title={lang === 'zh' ? '编辑配置' : 'Edit profile'}
            className="shrink-0 rounded border border-claude-border bg-claude-bg px-2 py-1 text-[10px] text-claude-muted hover:border-amber-600/50 hover:text-claude-text"
          >
            ✏
          </button>
          {/* Delete button (only if more than 1 profile) */}
          {form.profiles.length > 1 && (
            <button
              onClick={handleDeleteProfile}
              title={lang === 'zh' ? '删除配置' : 'Delete profile'}
              className="shrink-0 rounded border border-claude-border bg-claude-bg px-2 py-1 text-[10px] text-red-400 hover:border-red-500/50"
            >
              ✕
            </button>
          )}
        </div>
        <p className="mt-1 text-[9px] leading-snug text-claude-muted">
          {lang === 'zh' ? '切换配置后，新创建的会话将使用新配置' : 'New sessions will use the selected profile'}
        </p>
      </div>

      {/* [2026-04-30] API 容灾代理 */}
      <div className="px-3 pb-2 border-t border-claude-border pt-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.enableApiProxy ?? false}
            onChange={(e) => handleChange('enableApiProxy', e.target.checked)}
            className="w-4 h-4 accent-amber-500"
          />
          <span className="text-[11px] text-claude-text">{lang === 'zh' ? '启用本地 API 容灾代理' : 'Enable local API failover proxy'}</span>
        </label>
        <p className="mt-1 text-[9px] leading-snug text-claude-muted">
          {lang === 'zh' ? '开启后请求通过本地代理转发，主地址失败时自动切换备用配置。' : 'Requests go through local proxy; auto-switches to fallback on primary failure.'}
        </p>
      </div>

      {/* [2026-04-30] 多级备用配置（仅当启用代理时显示） */}
      {form.enableApiProxy && activeProfile && (
        <div className="px-3 pb-4 border-t border-claude-border pt-2">
          {/* 折叠标题 */}
          <div
            className="flex items-center gap-2 cursor-pointer select-none"
            onClick={() => setFallbacksExpanded(!fallbacksExpanded)}
          >
            <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider">
              {lang === 'zh' ? '多级备用配置（容灾）' : 'Multi-level Fallbacks (Failover)'}
            </span>
            <span className="text-[10px] text-claude-muted">
              ({(activeProfile.fallbacks ?? []).filter(f => f.enabled).length}/{(activeProfile.fallbacks ?? []).length})
            </span>
            <svg
              className={`w-3 h-3 text-claude-muted transition-transform ${fallbacksExpanded ? 'rotate-180' : ''}`}
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          </div>

          {fallbacksExpanded && (
            <div className="mt-2 space-y-2">
              {(activeProfile.fallbacks ?? []).length === 0 && (
                <p className="text-[9px] text-claude-muted">
                  {lang === 'zh' ? '未配置备用地址，主地址失败时无法自动切换' : 'No fallbacks configured; cannot auto-switch when primary fails'}
                </p>
              )}

              {(activeProfile.fallbacks ?? []).map((fallback, idx) => (
                <div
                  key={fallback.id}
                  className="p-2 rounded bg-claude-bg/50 border border-claude-border group relative"
                >
                  {/* 启用勾选框 + 名称 */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <input
                      type="checkbox"
                      checked={fallback.enabled}
                      onChange={() => handleToggleFallback(fallback.id)}
                      className="w-3.5 h-3.5 accent-amber-500"
                    />
                    <span className="text-[10px] font-medium text-claude-text">
                      #{idx + 1} {fallback.name}
                    </span>
                    {!fallback.baseUrl && (
                      <span className="text-[9px] text-red-400">({lang === 'zh' ? '未配置' : 'Not configured'})</span>
                    )}
                    {/* 删除按钮 */}
                    <button
                      onClick={() => handleRemoveFallback(fallback.id)}
                      className="ml-auto text-[9px] text-claude-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ✕
                    </button>
                  </div>

                  {/* 详细配置（仅启用时显示） */}
                  {fallback.enabled && (
                    <div className="space-y-1.5 pl-5">
                      {/* 名称 */}
                      <div className="flex gap-2 items-center">
                        <span className="text-[9px] text-claude-muted w-12">{lang === 'zh' ? '名称' : 'Name'}</span>
                        <input
                          type="text"
                          value={fallback.name}
                          onChange={(e) => handleUpdateFallback(fallback.id, { name: e.target.value })}
                          className="field-input !text-[10px] !py-1.5"
                        />
                      </div>
                      {/* Base URL */}
                      <div className="flex gap-2 items-center">
                        <span className="text-[9px] text-claude-muted w-12">{lang === 'zh' ? '地址' : 'URL'}</span>
                        <input
                          type="text"
                          value={fallback.baseUrl}
                          onChange={(e) => handleUpdateFallback(fallback.id, { baseUrl: e.target.value })}
                          placeholder="https://..."
                          className="field-input !text-[10px] !py-1.5"
                        />
                      </div>
                      {/* Auth Token */}
                      <div className="flex gap-2 items-center">
                        <span className="text-[9px] text-claude-muted w-12">{lang === 'zh' ? '密钥' : 'Token'}</span>
                        <input
                          type="password"
                          value={fallback.authToken}
                          onChange={(e) => handleUpdateFallback(fallback.id, { authToken: e.target.value })}
                          placeholder="sk-..."
                          className="field-input !text-[10px] !py-1.5"
                        />
                      </div>
                      {/* Model */}
                      <div className="flex gap-2 items-center">
                        <span className="text-[9px] text-claude-muted w-12">{lang === 'zh' ? '模型' : 'Model'}</span>
                        <input
                          type="text"
                          value={fallback.model ?? ''}
                          onChange={(e) => handleUpdateFallback(fallback.id, { model: e.target.value })}
                          className="field-input !text-[10px] !py-1.5"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* 添加按钮 */}
              <button
                onClick={handleAddFallback}
                className="w-full py-1.5 text-[10px] text-amber-500 hover:bg-amber-500/10 rounded border border-claude-border hover:border-amber-500/50 transition-colors"
              >
                + {lang === 'zh' ? '添加备用配置' : 'Add Fallback'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* [2026-04-28] Active profile fields */}
      {activeProfile && (
        <div className="px-3 space-y-3 pb-4 border-t border-claude-border pt-2">
          {/* Auth Token */}
          <Field label="Auth Token" hint="x-api-key">
            <input
              type="password"
              value={activeProfile.authToken}
              onChange={(e) => handleProfileChange('authToken', e.target.value)}
              placeholder="sk-ant-..."
              className="field-input"
            />
          </Field>

          {/* Base URL */}
          <Field label="Base URL" hint="ANTHROPIC_BASE_URL">
            <input
              type="text"
              value={activeProfile.baseUrl}
              onChange={(e) => handleProfileChange('baseUrl', e.target.value)}
              placeholder="https://api.anthropic.com"
              className="field-input"
            />
          </Field>

          {/* All Models */}
          {(
            [
              ['model', lang === 'zh' ? '默认模型' : 'Default Model', 'ANTHROPIC_MODEL'],
              ['sonnetModel', 'Sonnet Model', 'ANTHROPIC_DEFAULT_SONNET_MODEL'],
              ['haikuModel', 'Haiku Model', 'ANTHROPIC_DEFAULT_HAIKU_MODEL'],
              ['opusModel', 'Opus Model', 'ANTHROPIC_DEFAULT_OPUS_MODEL'],
              ['subagentModel', 'Subagent Model', 'CLAUDE_CODE_SUBAGENT_MODEL'],
            ] as [keyof ApiProfile, string, string][]
          ).map(([key, label, hint]) => (
            <Field key={key} label={label} hint={hint}>
              <input
                type="text"
                value={activeProfile[key] as string}
                onChange={(e) => handleProfileChange(key, e.target.value)}
                placeholder="model-name"
                className="field-input"
              />
            </Field>
          ))}

          {/* Context Window */}
          <Field label={lang === 'zh' ? '上下文窗口' : 'Context Window'} hint="K tokens (e.g. 200 = 200K)">
            <input
              type="number"
              min="0"
              step="1"
              value={activeProfile.contextWindow ?? ''}
              onChange={(e) => handleProfileChange('contextWindow', e.target.value ? parseInt(e.target.value) || 0 : (undefined as any))}
              placeholder={lang === 'zh' ? '例如：200' : 'e.g. 200'}
              className="field-input"
            />
          </Field>

          {/* Disable experimental betas */}
          <div className="flex items-center justify-between py-1">
            <div>
              <div className="text-xs text-claude-text">{lang === 'zh' ? '禁用实验性功能' : 'Disable Experimental Betas'}</div>
              <div className="text-[10px] text-claude-muted">CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS</div>
            </div>
            <button
              onClick={() => handleProfileChange('disableExperimentalBetas', !activeProfile.disableExperimentalBetas)}
              className={`relative w-8 h-4 rounded-full transition-colors ${
                activeProfile.disableExperimentalBetas ? 'bg-amber-500' : 'bg-claude-border'
              }`}
            >
              <span
                className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                  activeProfile.disableExperimentalBetas ? 'left-4.5' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        </div>
      )}

      <div className="px-3 pb-2 text-[10px] font-semibold text-claude-muted uppercase tracking-wider border-t border-claude-border pt-2">
        {lang === 'zh' ? '权限设置' : 'Permissions'}
      </div>

      <div className="px-3 space-y-3 pb-4">
        <Field label={lang === 'zh' ? '默认权限模式' : 'Permission Mode'} hint="claude --permission-mode">
          <select
            value={form.permissionPreset}
            onChange={(e) =>
              handleChange('permissionPreset', e.target.value as ClaudeSettings['permissionPreset'])
            }
            className="field-input"
          >
            <option value="acceptEdits">
              {lang === 'zh' ? '大部分自动批准（编辑与常用文件命令；其余仍会询问）' : 'Accept edits & common commands; ask for others'}
            </option>
            <option value="bypassPermissions">
              {lang === 'zh' ? '允许几乎所有操作（跳过绝大多数确认；慎用）' : 'Allow almost all operations (use with caution)'}
            </option>
          </select>
        </Field>

        {/* [2026-04-29] 同步 skipDangerousModePermissionPrompt 至 CLAUDE_CONFIG_DIR/settings.json（Claude Code 官方字段） */}
        <div className="rounded border border-amber-600/25 bg-amber-500/5 px-2 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs text-claude-text">
                {lang === 'zh' ? '跳过「危险 / 绕过权限」模式启动确认' : 'Skip bypass-mode startup confirmation'}
              </div>
              <p className="mt-0.5 text-[9px] leading-snug text-claude-muted">
                {lang === 'zh'
                  ? '开启后写入与「应用设置」同根的 claude-session/settings.json（便携版为 exe 同目录 data\\claude-session，与 CLAUDE_CONFIG_DIR 一致）。使用 bypass 等模式时将不再每次出现「Yes, I accept」。修改后请保存并新开终端会话。'
                  : 'Writes to claude-session/settings.json next to your app data (portable: <exe>/data/claude-session). Save, then open a new session. Do not enable on untrusted machines.'}
              </p>
            </div>
            <button
              type="button"
              aria-label={lang === 'zh' ? '切换跳过启动确认' : 'Toggle skip startup prompt'}
              onClick={() =>
                handleChange('skipDangerousModePermissionPrompt', !form.skipDangerousModePermissionPrompt)
              }
              className={`relative mt-0.5 h-4 w-8 shrink-0 rounded-full transition-colors ${
                form.skipDangerousModePermissionPrompt ? 'bg-amber-500' : 'bg-claude-border'
              }`}
            >
              <span
                className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
                  form.skipDangerousModePermissionPrompt ? 'left-4.5' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        <Field label={lang === 'zh' ? '额外技能目录（可选）' : 'Extra skills directory (optional)'} hint="claude --add-dir">
          <div className="flex gap-1">
            <input
              type="text"
              value={form.sharedSkillAddDir}
              onChange={(e) => handleChange('sharedSkillAddDir', e.target.value)}
              placeholder={lang === 'zh' ? '含 .claude/skills 的项目根绝对路径' : 'Absolute path containing .claude/skills'}
              className="field-input flex-1 min-w-0"
            />
            <button
              type="button"
              onClick={async () => {
                const dir = await window.electronAPI.openDirDialog()
                if (dir) handleChange('sharedSkillAddDir', dir)
              }}
              className="shrink-0 rounded border border-claude-border bg-claude-bg px-2 py-1 text-[10px] text-claude-muted hover:border-amber-600/50 hover:text-claude-text"
            >
              {lang === 'zh' ? '浏览…' : 'Browse…'}
            </button>
          </div>
        </Field>
      </div>

      {/* Pricing - per profile */}
      {activeProfile && (
        <div className="px-3 space-y-3 pb-4 border-t border-claude-border pt-2">
          <div className="text-[10px] font-semibold text-claude-muted uppercase tracking-wider">
            {lang === 'zh' ? '费用估算' : 'Pricing'} <span className="normal-case font-normal">($ / M tokens)</span>
          </div>

          {(
            [
              ['inputPerM', lang === 'zh' ? '输入' : 'Input', '$3.00'],
              ['outputPerM', lang === 'zh' ? '输出' : 'Output', '$15.00'],
              ['cacheCreatePerM', lang === 'zh' ? '缓存写入' : 'Cache Write', '$3.75'],
              ['cacheReadPerM', lang === 'zh' ? '缓存读取' : 'Cache Read', '$0.30'],
            ] as [keyof typeof SETTINGS_DEFAULT_PRICING, string, string][]
          ).map(([key, label, placeholder]) => (
            <Field key={key} label={label} hint={`default: ${placeholder}`}>
              <div className="flex items-center gap-1">
                <span className="text-claude-muted text-xs">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={activeProfile.pricing?.[key] ?? SETTINGS_DEFAULT_PRICING[key]}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0
                    const newPricing = { ...activeProfile.pricing ?? SETTINGS_DEFAULT_PRICING, [key]: val }
                    handleProfileChange('pricing', newPricing)
                  }}
                  className="field-input flex-1"
                />
                <button
                  type="button"
                  onClick={() => {
                    const newPricing = { ...activeProfile.pricing ?? SETTINGS_DEFAULT_PRICING, [key]: SETTINGS_DEFAULT_PRICING[key] }
                    handleProfileChange('pricing', newPricing)
                  }}
                  title="Reset to default"
                  className="shrink-0 text-[9px] text-claude-muted hover:text-claude-text px-1"
                >
                  ↺
                </button>
              </div>
            </Field>
          ))}
        </div>
      )}

      {/* [2026-04-28] 宠物专用 API 配置 */}
      <div className="px-3 space-y-3 pb-4 border-t border-claude-border pt-2">
        <div className="text-[10px] font-semibold text-claude-muted uppercase tracking-wider">
          {lang === 'zh' ? '宠物 API 配置' : 'Pet API Config'}
        </div>
        <p className="text-[9px] leading-snug text-claude-muted">
          {lang === 'zh' ? '宠物使用独立的 API 配置，不影响主会话' : 'Pet uses separate API config, independent from main sessions'}
        </p>

        {/* 宠物 Auth Token */}
        <Field label={lang === 'zh' ? '宠物 API Token' : 'Pet API Token'}>
          <input
            type="password"
            value={form.petApi?.authToken ?? ''}
            onChange={(e) => setForm(prev => ({
              ...prev,
              petApi: { ...prev.petApi, authToken: e.target.value, baseUrl: prev.petApi?.baseUrl ?? '', model: prev.petApi?.model ?? '' }
            }))}
            placeholder="sk-..."
            className="field-input"
          />
        </Field>

        {/* 宠物 Base URL */}
        <Field label={lang === 'zh' ? '宠物 Base URL' : 'Pet Base URL'}>
          <input
            type="text"
            value={form.petApi?.baseUrl ?? ''}
            onChange={(e) => setForm(prev => ({
              ...prev,
              petApi: { ...prev.petApi, baseUrl: e.target.value, authToken: prev.petApi?.authToken ?? '', model: prev.petApi?.model ?? '' }
            }))}
            placeholder="https://api.deepseek.com"
            className="field-input"
          />
          <p className="text-[9px] text-claude-muted mt-0.5">
            {lang === 'zh'
              ? '填 Base URL 即可（如 https://api.deepseek.com），系统将自动补全为普通聊天对话接口路径'
              : 'Base URL (e.g. https://api.deepseek.com), auto-appended to standard chat completion endpoint'}
          </p>
        </Field>

        {/* 宠物 Model */}
        <Field label={lang === 'zh' ? '宠物模型' : 'Pet Model'}>
          <input
            type="text"
            value={form.petApi?.model ?? ''}
            onChange={(e) => setForm(prev => ({
              ...prev,
              petApi: { ...prev.petApi, model: e.target.value, authToken: prev.petApi?.authToken ?? '', baseUrl: prev.petApi?.baseUrl ?? '' }
            }))}
            placeholder="claude-haiku-4-5"
            className="field-input"
          />
        </Field>

        {/* 请求头格式（仅自定义配置时显示） */}
        {form.petApi && (
        <Field label={lang === 'zh' ? '请求头格式' : 'Request Format'}>
          <div className="flex gap-1">
            {[
              { value: '', label: lang === 'zh' ? '自动' : 'Auto', tip: lang === 'zh' ? '根据 URL 自动推断' : 'Auto-detect from URL' },
              { value: 'anthropic', label: 'Anthropic', tip: 'x-api-key + /v1/messages' },
              { value: 'anthropic-bearer', label: lang === 'zh' ? 'Anthropic + Bearer' : 'Anthropic + Bearer', tip: lang === 'zh' ? 'Bearer 认证 + Anthropic 格式（Claude Code 代理兼容）' : 'Bearer auth + Anthropic body format' },
              { value: 'openai', label: 'OpenAI', tip: 'Authorization: Bearer + /v1/chat/completions' },
            ].map(opt => (
              <button
                key={opt.value}
                title={opt.tip}
                onClick={() => setForm(prev => ({
                  ...prev,
                  petApi: prev.petApi ? { ...prev.petApi, format: (opt.value || undefined) as 'anthropic' | 'openai' | 'anthropic-bearer' | undefined } : prev.petApi,
                }))}
                className={`flex-1 text-[10px] px-1.5 py-1 rounded border transition-colors ${
                  form.petApi.format === (opt.value || undefined)
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                    : 'border-claude-border text-claude-muted hover:text-claude-text hover:bg-claude-surface'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>
        )}

        {/* 使用主配置开关 */}
        <div className="flex items-center justify-between py-1">
          <div>
            <div className="text-xs text-claude-text">{lang === 'zh' ? '使用主配置' : 'Use Main Config'}</div>
            <div className="text-[9px] text-claude-muted">
              {lang === 'zh' ? '宠物 Token/URL 为空时使用主配置' : 'Fall back to main config if pet config is empty'}
            </div>
          </div>
          <button
            onClick={() => {
              // 清空宠物配置即使用主配置
              setForm(prev => ({ ...prev, petApi: undefined }))
              setSaved(false)
            }}
            className={`relative w-8 h-4 rounded-full transition-colors ${
              !form.petApi?.authToken && !form.petApi?.baseUrl ? 'bg-amber-500' : 'bg-claude-border'
            }`}
          >
            <span
              className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                !form.petApi?.authToken && !form.petApi?.baseUrl ? 'left-4.5' : 'left-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Save button */}
      <div className="px-3 pb-4">
        <button
          onClick={handleSave}
          className={`w-full py-1.5 rounded text-xs font-medium transition-colors ${
            saved
              ? 'bg-green-700 text-white'
              : 'bg-amber-500 hover:bg-amber-400 text-black'
          }`}
        >
          {saved ? `✓ ${t.settings.saved}` : t.settings.save}
        </button>
      </div>

      {/* Check update */}
      <div className="px-3 pb-4 border-t border-claude-border pt-2">
        <button
          onClick={() => { setChecking(true); window.electronAPI?.checkForUpdates() }}
          disabled={checking}
          className={`w-full py-1.5 rounded text-xs font-medium transition-colors ${
            updateStatus?.status === 'available' || updateStatus?.status === 'downloaded'
              ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
              : 'bg-claude-border text-claude-muted hover:bg-claude-border/80'
          } disabled:opacity-50`}
        >
          {checking
            ? (lang === 'zh' ? '检查中...' : 'Checking...')
            : updateStatus?.status === 'available'
              ? (lang === 'zh' ? `发现新版本 ${updateStatus.version}` : `Update ${updateStatus.version} available`)
              : updateStatus?.status === 'downloaded'
                ? (lang === 'zh' ? '安装更新' : 'Install update')
                : (lang === 'zh' ? '检查更新' : 'Check for updates')}
        </button>
        {updateStatus?.status === 'available' && (
          <p className="text-[10px] text-amber-400 mt-1">
            {lang === 'zh' ? '正在后台下载…' : 'Downloading in background…'}
          </p>
        )}
        {updateStatus?.status === 'downloaded' && (
          <button
            onClick={() => window.electronAPI?.installUpdate()}
            className="w-full mt-1 py-1.5 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-500"
          >
            {lang === 'zh' ? '立即重启安装' : 'Restart & Install'}
          </button>
        )}
        {updateStatus?.status === 'error' && (
          <p className="text-[10px] text-red-400 mt-1">{updateStatus.error}</p>
        )}
        {updateStatus?.status === 'not-available' && (
          <p className="text-[10px] text-claude-muted mt-1">{lang === 'zh' ? '已是最新版本' : 'You are up to date'}</p>
        )}
      </div>

      {/* [2026-04-28] Profile 编辑弹窗 */}
      {showProfileEditor && editingProfile && (
        <ProfileEditor
          profile={editingProfile}
          isNew={isNewProfile}
          onSave={handleProfileSave}
          onCancel={() => setShowProfileEditor(false)}
          onDelete={isNewProfile ? undefined : handleDeleteProfile}
          lang={lang}
        />
      )}

      <style>{`
        .field-input {
          width: 100%;
          background: var(--field-bg);
          border: 1px solid var(--field-border);
          border-radius: 4px;
          padding: 4px 6px;
          font-size: 11px;
          color: var(--claude-text);
          outline: none;
          font-family: 'Cascadia Code', monospace;
        }
        .field-input:focus {
          border-color: var(--claude-accent);
        }
        .field-input::placeholder {
          color: var(--field-placeholder);
        }
      `}</style>
    </div>
  )
}

// [2026-04-28] Profile 编辑弹窗
function ProfileEditor({
  profile,
  isNew,
  onSave,
  onCancel,
  onDelete,
  lang
}: {
  profile: ApiProfile
  isNew: boolean
  onSave: (profile: ApiProfile) => void
  onCancel: () => void
  onDelete?: () => void
  lang: 'zh' | 'en'
}): React.ReactElement {
  const [form, setForm] = useState<ApiProfile>(profile)

  const handleChange = <K extends keyof ApiProfile>(key: K, value: ApiProfile[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    onSave(form)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-claude-surface2 border border-claude-border rounded-lg w-[360px] max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="px-3 py-2 border-b border-claude-border flex items-center justify-between">
          <span className="text-xs font-semibold text-claude-text">
            {isNew
              ? (lang === 'zh' ? '添加 API 配置' : 'Add API Profile')
              : (lang === 'zh' ? '编辑 API 配置' : 'Edit API Profile')}
          </span>
          <button onClick={onCancel} className="text-claude-muted hover:text-claude-text text-sm">✕</button>
        </div>

        {/* Form */}
        <div className="px-3 py-2 space-y-3">
          {/* Profile Name */}
          <Field label={lang === 'zh' ? '配置名称' : 'Profile Name'}>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder={lang === 'zh' ? '例如：生产环境' : 'e.g. Production'}
              className="field-input"
            />
          </Field>

          {/* Auth Token */}
          <Field label="Auth Token" hint="ANTHROPIC_AUTH_TOKEN">
            <input
              type="password"
              value={form.authToken}
              onChange={(e) => handleChange('authToken', e.target.value)}
              placeholder="sk-..."
              className="field-input"
            />
          </Field>

          {/* Base URL */}
          <Field label="Base URL" hint="ANTHROPIC_BASE_URL">
            <input
              type="text"
              value={form.baseUrl}
              onChange={(e) => handleChange('baseUrl', e.target.value)}
              placeholder="https://api.anthropic.com"
              className="field-input"
            />
          </Field>

          {/* Models */}
          {(
            [
              ['model', lang === 'zh' ? '默认模型' : 'Default Model', 'ANTHROPIC_MODEL'],
              ['sonnetModel', 'Sonnet Model', 'ANTHROPIC_DEFAULT_SONNET_MODEL'],
              ['haikuModel', 'Haiku Model', 'ANTHROPIC_DEFAULT_HAIKU_MODEL'],
              ['opusModel', 'Opus Model', 'ANTHROPIC_DEFAULT_OPUS_MODEL'],
              ['subagentModel', 'Subagent Model', 'CLAUDE_CODE_SUBAGENT_MODEL'],
            ] as [keyof ApiProfile, string, string][]
          ).map(([key, label, hint]) => (
            <Field key={key} label={label} hint={hint}>
              <input
                type="text"
                value={form[key] as string}
                onChange={(e) => handleChange(key, e.target.value)}
                placeholder="model-name"
                className="field-input"
              />
            </Field>
          ))}

          {/* Context Window */}
          <Field label={lang === 'zh' ? '上下文窗口' : 'Context Window'} hint="K tokens (e.g. 200 = 200K)">
            <input
              type="number"
              min="0"
              step="1"
              value={form.contextWindow ?? ''}
              onChange={(e) => handleChange('contextWindow', e.target.value ? parseInt(e.target.value) || 0 : (undefined as any))}
              placeholder={lang === 'zh' ? '例如：200' : 'e.g. 200'}
              className="field-input"
            />
          </Field>

          {/* Disable experimental betas */}
          <div className="flex items-center justify-between py-1">
            <div>
              <div className="text-xs text-claude-text">{lang === 'zh' ? '禁用实验性功能' : 'Disable Experimental Betas'}</div>
              <div className="text-[10px] text-claude-muted">CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS</div>
            </div>
            <button
              onClick={() => handleChange('disableExperimentalBetas', !form.disableExperimentalBetas)}
              className={`relative w-8 h-4 rounded-full transition-colors ${
                form.disableExperimentalBetas ? 'bg-amber-500' : 'bg-claude-border'
              }`}
            >
              <span
                className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                  form.disableExperimentalBetas ? 'left-4.5' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-claude-border flex gap-2">
          {onDelete && (
            <button
              onClick={onDelete}
              className="flex-1 py-1.5 rounded text-xs font-medium bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/30"
            >
              {lang === 'zh' ? '删除' : 'Delete'}
            </button>
          )}
          <button
            onClick={onCancel}
            className="flex-1 py-1.5 rounded text-xs font-medium bg-claude-border text-claude-muted hover:bg-claude-border/80"
          >
            {t.common.cancel}
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-1.5 rounded text-xs font-medium bg-amber-500 hover:bg-amber-400 text-black"
          >
            {t.common.save}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between">
        <label className="text-xs text-claude-text">{label}</label>
        {hint && <span className="text-[9px] text-claude-muted font-mono">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

// 兼容旧的 t.settings
const t = {
  common: {
    cancel: 'Cancel',
    save: 'Save',
    loading: 'Loading...'
  },
  settings: {
    language: 'Language',
    languageZh: '中文',
    languageEn: 'English',
    saved: 'Saved',
    save: 'Save',
    disableExperimentalBetas: 'Disable Experimental Betas'
  }
}