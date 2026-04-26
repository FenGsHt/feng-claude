import React, { useState, useEffect } from 'react'
import type { ClaudeSettings } from '../../types/settings'
import { DEFAULT_SETTINGS } from '../../types/settings'
import { useGlobalTokenStore, DEFAULT_PRICING, type Pricing } from '../../store/globalTokenStore'

export function SettingsPanel(): React.ReactElement {
  const [form, setForm] = useState<ClaudeSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const { pricing, setPricing } = useGlobalTokenStore()
  const [pricingForm, setPricingForm] = useState<Pricing>(pricing)

  useEffect(() => {
    setPricingForm(pricing)
  }, [pricing])

  useEffect(() => {
    window.electronAPI.settings.get().then((s) => {
      setForm(s)
      setLoading(false)
    })
  }, [])

  const handleChange = <K extends keyof ClaudeSettings>(key: K, value: ClaudeSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  const handleSave = async () => {
    await window.electronAPI.settings.set(form)
    setPricing(pricingForm)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-claude-muted text-xs">
        Loading...
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 pt-3 pb-2 text-[10px] font-semibold text-claude-muted uppercase tracking-wider">
        API Configuration
      </div>

      <div className="px-3 space-y-3 pb-4">
        {/* Auth Token */}
        <Field label="Auth Token" hint="ANTHROPIC_AUTH_TOKEN">
          <input
            type="password"
            value={form.authToken}
            onChange={(e) => handleChange('authToken', e.target.value)}
            placeholder="sk-sp-..."
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

        <div className="pt-1 pb-1 border-t border-claude-border">
          <div className="text-[10px] font-semibold text-claude-muted uppercase tracking-wider pt-2 pb-1">
            Permissions / 权限
          </div>
        </div>

        <Field label="默认权限模式" hint="claude --permission-mode">
          <select
            value={form.permissionPreset}
            onChange={(e) =>
              handleChange('permissionPreset', e.target.value as ClaudeSettings['permissionPreset'])
            }
            className="field-input"
          >
            <option value="acceptEdits">
              大部分自动批准（编辑与常用文件命令；其余仍会询问）
            </option>
            <option value="bypassPermissions">
              允许几乎所有操作（跳过绝大多数确认；慎用）
            </option>
          </select>
        </Field>

        <Field label="额外技能目录（可选）" hint="claude --add-dir">
          <div className="flex gap-1">
            <input
              type="text"
              value={form.sharedSkillAddDir}
              onChange={(e) => handleChange('sharedSkillAddDir', e.target.value)}
              placeholder="含 .claude/skills 的项目根绝对路径"
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
              浏览…
            </button>
          </div>
          <p className="mt-1 text-[9px] leading-snug text-claude-muted">
            任意会话 cwd 下合并该目录内 `.claude/skills`。留空时，若
            <span className="text-claude-text"> 已安装/便携打包 </span>
            且 exe 同目录或 resources 下存在 `.claude` 或 `.claude/skills`，将自动附加 `--add-dir`；源码开发启动不自动探测。保存后新开会话生效。
            保存后新开 / 自动重启的 Claude 生效。
          </p>
        </Field>

        <div className="pt-1 pb-1 border-t border-claude-border">
          <div className="text-[10px] font-semibold text-claude-muted uppercase tracking-wider pt-2 pb-1">
            Model Routing
          </div>
        </div>

        {/* Models */}
        {(
          [
            ['model', 'Default Model', 'ANTHROPIC_MODEL'],
            ['sonnetModel', 'Sonnet Model', 'ANTHROPIC_DEFAULT_SONNET_MODEL'],
            ['haikuModel', 'Haiku Model', 'ANTHROPIC_DEFAULT_HAIKU_MODEL'],
            ['opusModel', 'Opus Model', 'ANTHROPIC_DEFAULT_OPUS_MODEL'],
            ['subagentModel', 'Subagent Model', 'CLAUDE_CODE_SUBAGENT_MODEL']
          ] as [keyof ClaudeSettings, string, string][]
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

        {/* Disable experimental betas */}
        <div className="flex items-center justify-between py-1">
          <div>
            <div className="text-xs text-claude-text">Disable Experimental Betas</div>
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
                form.disableExperimentalBetas ? 'left-4.5 translate-x-0' : 'left-0.5'
              }`}
            />
          </button>
        </div>

        <div className="pt-1 pb-1 border-t border-claude-border">
          <div className="text-[10px] font-semibold text-claude-muted uppercase tracking-wider pt-2 pb-1">
            Pricing / 费用估算 <span className="normal-case font-normal">($ / M tokens)</span>
          </div>
        </div>

        {(
          [
            ['inputPerM', 'Input', '$3.00'],
            ['outputPerM', 'Output', '$15.00'],
            ['cacheCreatePerM', 'Cache Write', '$3.75'],
            ['cacheReadPerM', 'Cache Read', '$0.30'],
          ] as [keyof Pricing, string, string][]
        ).map(([key, label, placeholder]) => (
          <Field key={key} label={label} hint={`default: ${placeholder}`}>
            <div className="flex items-center gap-1">
              <span className="text-claude-muted text-xs">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={pricingForm[key]}
                onChange={(e) =>
                  setPricingForm((prev) => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))
                }
                className="field-input flex-1"
              />
              <button
                type="button"
                onClick={() => setPricingForm((prev) => ({ ...prev, [key]: DEFAULT_PRICING[key] }))}
                title="Reset to default"
                className="shrink-0 text-[9px] text-claude-muted hover:text-claude-text px-1"
              >
                ↺
              </button>
            </div>
          </Field>
        ))}

        {/* Save button */}
        <button
          onClick={handleSave}
          className={`w-full py-1.5 rounded text-xs font-medium transition-colors ${
            saved
              ? 'bg-green-700 text-white'
              : 'bg-amber-500 hover:bg-amber-400 text-black'
          }`}
        >
          {saved ? '✓ Saved' : 'Save Settings'}
        </button>

        <p className="text-[10px] text-claude-muted text-center leading-snug">
          Settings apply to new sessions.
          <br />
          Restart existing sessions to pick up changes.
        </p>
      </div>

      <style>{`
        .field-input {
          width: 100%;
          background: #0d0d0d;
          border: 1px solid #2a2a2a;
          border-radius: 4px;
          padding: 4px 6px;
          font-size: 11px;
          color: #e5e5e5;
          outline: none;
          font-family: 'Cascadia Code', monospace;
        }
        .field-input:focus {
          border-color: #f59e0b;
        }
        .field-input::placeholder {
          color: #555;
        }
      `}</style>
    </div>
  )
}

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between">
        <label className="text-xs text-claude-text">{label}</label>
        <span className="text-[9px] text-claude-muted font-mono">{hint}</span>
      </div>
      {children}
    </div>
  )
}
