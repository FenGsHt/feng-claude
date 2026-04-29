/**
 * PetGrowthPanel — 宠物成长面板，展示等级、XP、好感度、技能树
 */
import React, { useState, useRef } from 'react'
import { usePetStore, getAffectionTier } from '../../store/petStore'
import { SKILL_DEFINITIONS } from '../../lib/petSkills'

const TIER_LABELS: Record<string, string> = {
  cold: '冷淡', normal: '普通', friendly: '友好', close: '亲密', soulmate: '灵魂伴侣',
}

export function PetGrowthPanel(): React.ReactElement {
  const { growth, upgradeSkill, resetGrowth } = usePetStore()
  const [showAffection, setShowAffection] = useState(false)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const tier = getAffectionTier(growth.affection)

  const handleUpgradeSkill = (skillId: string) => {
    const skill = SKILL_DEFINITIONS.find(s => s.id === skillId)
    const success = upgradeSkill(skillId)
    if (success) {
      setToast(`${skill?.name} 升级成功！`)
    } else {
      setToast('升级失败：技能点不足或等级不够')
    }
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2000)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden text-[10px] text-claude-muted relative">
      {/* Toast */}
      {toast && (
        <div className="absolute top-2 left-3 right-3 z-10 bg-amber-600/90 text-white text-[10px] px-2 py-1 rounded-lg text-center animate-pulse">
          {toast}
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {/* 等级信息 */}
        <div className="bg-claude-surface2 rounded-lg p-2.5 border border-claude-border">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-claude-accent font-bold text-[11px]">
              Lv.{growth.level}
            </span>
            <span className="text-claude-muted text-[9.5px]">
              XP {growth.xp} / {growth.xpToNext}
            </span>
          </div>
          {/* XP 进度条 */}
          <div className="w-full h-1.5 bg-claude-border rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-claude-accent transition-all duration-300"
              style={{ width: `${(growth.xp / growth.xpToNext) * 100}%` }}
            />
          </div>
          {growth.skillPoints > 0 && (
            <div className="mt-1.5 text-[9.5px] text-claude-accent">
              ⚡ 可用技能点 ×{growth.skillPoints}
            </div>
          )}
        </div>

        {/* 好感度 */}
        <div className="bg-claude-surface2 rounded-lg p-2.5 border border-claude-border">
          <div className="flex items-center justify-between">
            <span className="text-claude-muted">好感度</span>
            <button
              onClick={() => setShowAffection(v => !v)}
              className="text-[9px] text-claude-muted/60 hover:text-claude-text"
            >
              {showAffection ? '隐藏' : '显示'}
            </button>
          </div>
          {showAffection && (
            <div className="mt-1.5 space-y-1">
              <div className="text-claude-accent font-semibold">{TIER_LABELS[tier]}</div>
              <div className="w-full h-1.5 bg-claude-border rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-pink-400 transition-all duration-300"
                  style={{ width: `${growth.affection}%` }}
                />
              </div>
              <div className="text-[9px] text-claude-muted/60">{growth.affection} / 100</div>
            </div>
          )}
        </div>

        {/* 技能树 */}
        <div className="bg-claude-surface2 rounded-lg p-2.5 border border-claude-border">
          <div className="text-claude-muted font-semibold mb-2">技能树</div>
          <div className="space-y-1.5">
            {SKILL_DEFINITIONS.map(skill => {
              const current = growth.skills.find(s => s.id === skill.id)
              const isUnlocked = growth.level >= skill.unlockLevel
              const skillLevel = current?.level ?? 0
              const canUpgrade = isUnlocked && skillLevel < skill.maxLevel && growth.skillPoints > 0

              return (
                <div
                  key={skill.id}
                  className={`flex items-center justify-between px-2 py-1.5 rounded border transition-colors ${
                    !isUnlocked
                      ? 'border-claude-border/30 opacity-40'
                      : 'border-claude-border/50'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px]">{skill.icon}</span>
                    <div>
                      <div className={`font-semibold ${!isUnlocked ? 'text-claude-muted/50' : 'text-claude-text'}`}>
                        {skill.name}
                      </div>
                      {!isUnlocked && (
                        <div className="text-[9px] text-claude-muted/50">
                          需要 Lv.{skill.unlockLevel}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* 技能等级点 */}
                    <div className="flex gap-0.5">
                      {Array.from({ length: skill.maxLevel }, (_, i) => i + 1).map(i => (
                        <span
                          key={i}
                          className={`inline-block w-1.5 h-1.5 rounded-full ${
                            i <= skillLevel ? 'bg-claude-accent' : 'bg-claude-border'
                          }`}
                        />
                      ))}
                    </div>
                    {/* 升级按钮 */}
                    {canUpgrade && (
                      <button
                        onClick={() => handleUpgradeSkill(skill.id)}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-claude-accent/30 hover:bg-claude-accent/50 border border-claude-accent/40 text-claude-accent transition-colors"
                      >
                        ↑
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 重置 */}
        <button
          onClick={() => {
            if (confirm('确定要重置宠物成长数据吗？此操作不可撤销。')) {
              resetGrowth()
            }
          }}
          className="w-full text-[9.5px] py-1.5 rounded border border-red-800/40 text-red-400 hover:bg-red-800/20 transition-colors"
        >
          重置成长数据
        </button>
      </div>
    </div>
  )
}
