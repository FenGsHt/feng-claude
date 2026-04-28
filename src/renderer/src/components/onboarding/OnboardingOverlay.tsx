import React, { useState, useEffect, useCallback } from 'react'
import { useI18n } from '../../i18n'
import { navigateToSettingsTab } from '../sidebar/Sidebar'

const STORAGE_KEY = 'claude-gui-onboarding-complete'

interface OnboardingOverlayProps {
  onComplete: (provider: 'anthropic' | 'third-party') => void
}

// Third-party API provider presets
const PROVIDERS = [
  {
    id: 'aliyun',
    name: '阿里云 DashScope',
    baseUrl: 'https://coding.dashscope.aliyuncs.com/apps/anthropic',
    model: 'glm-5',
    hint: 'GLM-5 模型'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-sonnet-4',
    hint: '需 API Key'
  },
  {
    id: 'custom',
    name: '自定义',
    baseUrl: '',
    model: '',
    hint: '手动填写 Base URL 和模型'
  }
]

export function OnboardingOverlay({ onComplete }: OnboardingOverlayProps): React.ReactElement {
  const [step, setStep] = useState<'welcome' | 'choose-provider' | 'provider-detail'>('welcome')
  const [providerType, setProviderType] = useState<'anthropic' | 'third-party' | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<string>('aliyun')
  const { t, lang } = useI18n()

  const handleChooseProvider = (type: 'anthropic' | 'third-party') => {
    setProviderType(type)
    if (type === 'anthropic') {
      setStep('provider-detail')
    } else {
      setStep('choose-provider')
    }
  }

  const handleSelectThirdParty = (providerId: string) => {
    setSelectedProvider(providerId)
    setStep('provider-detail')
  }

  const handleCompleteAndGoToSettings = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true')
    if (providerType) {
      onComplete(providerType)
      // Navigate to settings after a short delay
      setTimeout(() => navigateToSettingsTab(), 50)
    }
  }, [providerType, onComplete])

  const handleSkip = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true')
    if (providerType) {
      onComplete(providerType)
    } else {
      onComplete('third-party')
    }
  }, [providerType, onComplete])

  // Close on Escape (only on welcome step)
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && step === 'welcome') {
        // Skip onboarding
        handleSkip()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [step, handleSkip])

  const getProviderConfig = () => {
    if (providerType === 'anthropic') {
      return { baseUrl: 'https://api.anthropic.com', model: '' }
    }
    const p = PROVIDERS.find((x) => x.id === selectedProvider)
    return p ? { baseUrl: p.baseUrl, model: p.model } : { baseUrl: '', model: '' }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center select-text">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[3px]" />

      {/* Card */}
      <div className="relative z-10 w-[420px] max-w-[90vw] bg-claude-surface border border-claude-border rounded-xl shadow-2xl overflow-hidden">
        {step === 'welcome' && (
          <>
            {/* Header */}
            <div className="px-5 pt-5 pb-4 border-b border-claude-border/60">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-amber-400 text-lg">⚡</span>
                <h2 className="text-[15px] font-semibold text-claude-text">
                  {lang === 'zh' ? '欢迎使用 Claude GUI' : 'Welcome to Claude GUI'}
                </h2>
              </div>
              <p className="text-[11px] text-claude-muted leading-relaxed">
                {lang === 'zh'
                  ? '在开始使用前，需要配置 API 服务。请选择您想使用的 API 提供商。'
                  : 'Before using the app, you need to configure an API service. Choose your preferred provider.'}
              </p>
            </div>

            {/* Options */}
            <div className="px-4 py-4 space-y-2">
              <button
                onClick={() => handleChooseProvider('anthropic')}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-claude-border hover:border-amber-500/50 hover:bg-amber-500/5 transition-all group"
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white text-lg font-bold">
                  A
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-claude-text group-hover:text-amber-400">
                    {lang === 'zh' ? 'Anthropic 官方 API' : 'Anthropic Official API'}
                  </div>
                  <div className="text-[10px] text-claude-muted">
                    {lang === 'zh' ? '使用 Claude 系列原生模型' : 'Use native Claude models'}
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 16 16" className="text-claude-muted group-hover:text-amber-400">
                  <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              <button
                onClick={() => handleChooseProvider('third-party')}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-claude-border hover:border-amber-500/50 hover:bg-amber-500/5 transition-all group"
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-lg">
                  ☁
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-claude-text group-hover:text-amber-400">
                    {lang === 'zh' ? '第三方 API 服务' : 'Third-party API Service'}
                  </div>
                  <div className="text-[10px] text-claude-muted">
                    {lang === 'zh' ? '阿里云、OpenRouter 等' : 'Aliyun, OpenRouter, etc.'}
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 16 16" className="text-claude-muted group-hover:text-amber-400">
                  <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-claude-border/60 bg-claude-bg/30">
              <button
                onClick={handleSkip}
                className="w-full text-[11px] text-claude-muted hover:text-claude-text transition-colors"
              >
                {lang === 'zh' ? '跳过，稍后配置 →' : 'Skip, configure later →'}
              </button>
            </div>
          </>
        )}

        {step === 'choose-provider' && (
          <>
            {/* Header */}
            <div className="px-5 pt-5 pb-4 border-b border-claude-border/60">
              <button
                onClick={() => setStep('welcome')}
                className="flex items-center gap-1 text-[11px] text-claude-muted hover:text-claude-text mb-2"
              >
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path d="M7 2L3 6l4 4" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {lang === 'zh' ? '返回' : 'Back'}
              </button>
              <h2 className="text-[14px] font-semibold text-claude-text">
                {lang === 'zh' ? '选择第三方服务' : 'Choose Third-party Service'}
              </h2>
              <p className="text-[11px] text-claude-muted mt-1">
                {lang === 'zh'
                  ? '选择一个预设配置，或在设置页面自定义'
                  : 'Select a preset or customize in Settings'}
              </p>
            </div>

            {/* Providers */}
            <div className="px-4 py-3 space-y-1.5">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelectThirdParty(p.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-all group ${
                    selectedProvider === p.id
                      ? 'border-amber-500/60 bg-amber-500/10'
                      : 'border-claude-border hover:border-amber-500/40 hover:bg-amber-500/5'
                  }`}
                >
                  <div className={`w-8 h-8 rounded flex items-center justify-center text-[13px] font-medium ${
                    p.id === 'aliyun' ? 'bg-orange-500/20 text-orange-400' :
                    p.id === 'openrouter' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-claude-border text-claude-muted'
                  }`}>
                    {p.id === 'aliyun' ? '阿' : p.id === 'openrouter' ? 'O' : '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-claude-text">
                      {p.name}
                    </div>
                    <div className="text-[10px] text-claude-muted truncate">
                      {p.hint}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-claude-border/60 bg-claude-bg/30">
              <button
                onClick={() => handleSelectThirdParty(selectedProvider)}
                className="w-full py-2 rounded text-[12px] font-medium bg-amber-500 hover:bg-amber-400 text-black transition-colors"
              >
                {lang === 'zh' ? '继续' : 'Continue'}
              </button>
            </div>
          </>
        )}

        {step === 'provider-detail' && (
          <>
            {/* Header */}
            <div className="px-5 pt-5 pb-4 border-b border-claude-border/60">
              <button
                onClick={() => setStep(providerType === 'anthropic' ? 'welcome' : 'choose-provider')}
                className="flex items-center gap-1 text-[11px] text-claude-muted hover:text-claude-text mb-2"
              >
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path d="M7 2L3 6l4 4" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {lang === 'zh' ? '返回' : 'Back'}
              </button>
              <h2 className="text-[14px] font-semibold text-claude-text">
                {providerType === 'anthropic'
                  ? (lang === 'zh' ? 'Anthropic 官方配置' : 'Anthropic Configuration')
                  : (lang === 'zh' ? `${PROVIDERS.find(p => p.id === selectedProvider)?.name} 配置` : `${PROVIDERS.find(p => p.id === selectedProvider)?.name} Configuration`)}
              </h2>
            </div>

            {/* Config preview */}
            <div className="px-4 py-4 space-y-3">
              <div className="bg-claude-bg rounded-lg p-3 border border-claude-border/50">
                <div className="text-[10px] text-claude-muted uppercase font-semibold mb-2">
                  {lang === 'zh' ? '配置预览' : 'Configuration Preview'}
                </div>
                <div className="space-y-1.5 text-[11px] font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-claude-muted shrink-0">Base URL:</span>
                    <span className="text-amber-400 truncate">{getProviderConfig().baseUrl || '(待填写)'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-claude-muted shrink-0">Model:</span>
                    <span className="text-green-400 truncate">{getProviderConfig().model || '(待填写)'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-claude-muted shrink-0">Auth Token:</span>
                    <span className="text-claude-text/50 truncate">(需要在设置页面填写)</span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-claude-muted leading-relaxed">
                {lang === 'zh'
                  ? '点击下方按钮跳转到设置页面，填写 Auth Token 后保存即可开始使用。'
                  : 'Click below to go to Settings, fill in your Auth Token and save to start using.'}
              </p>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-claude-border/60 bg-claude-bg/30 space-y-2">
              <button
                onClick={handleCompleteAndGoToSettings}
                className="w-full py-2 rounded text-[12px] font-medium bg-amber-500 hover:bg-amber-400 text-black transition-colors"
              >
                {lang === 'zh' ? '前往设置页面' : 'Go to Settings'}
              </button>
              <button
                onClick={handleSkip}
                className="w-full text-[11px] text-claude-muted hover:text-claude-text transition-colors"
              >
                {lang === 'zh' ? '稍后配置' : 'Configure later'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function isOnboardingComplete(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return true // Skip onboarding if localStorage fails
  }
}