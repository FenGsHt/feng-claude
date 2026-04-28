/**
 * PetGrowthPanel — 宠物成长面板，展示等级、XP、好感度、技能树
 */
import React, { useState } from 'react'
import { usePetStore, getAffectionTier } from '../../store/petStore'
import { SKILL_DEFINITIONS } from '../../lib/petSkills'

const TIER_LABELS: Record<string, string> = {
  cold: '冷淡', normal: '普通', friendly: '友好', close: '亲密', soulmate: '灵魂伴侣',
}

export function PetGrowthPanel(): React.ReactElement {
  const { growth, upgradeSkill, resetGrowth } = usePetStore()
  const [showAffection, setShowAffection] = useState(false)

  const tier = getAffectionTier(growth.affection)

  return (
    <div className="flex flex-col h-full overflow-hidden text-[10px] text-slate-300">
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {/* 等级信息 */}
        <div className="bg-slate-800/60 rounded-lg p-2.5 border border-slate-700/50">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-amber-400 font-bold text-[11px]">
              Lv.{growth.level}
            </span>
            {growth.level < 30 && (
              <span className="text-slate-400 text-[9.5px]">
                XP {growth.xp} / {growth.xpToNext}
              </span>
            )}
          </div>
          {/* XP 进度条 */}
          {growth.level < 30 && (
            <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-500 transition-all duration-300"
                style={{ width: `${(growth.xp / growth.xpToNext) * 100}%` }}
              />
            </div>
          )}
          {growth.level >= 30 && (
            <div className="text-[9.5px] text-amber-400">已满级！</div>
          )}
          {growth.skillPoints > 0 && (
            <div className="mt-1.5 text-[9.5px] text-amber-300">
              ⚡ 可用技能点 ×{growth.skillPoints}
            </div>
          )}
        </div>

        {/* 好感度 */}
        <div className="bg-slate-800/60 rounded-lg p-2.5 border border-slate-700/50">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">好感度</span>
            <button
              onClick={() => setShowAffection(v => !v)}
              className="text-[9px] text-slate-500 hover:text-slate-300"
            >
              {showAffection ? '隐藏' : '显示'}
            </button>
          </div>
          {showAffection && (
            <div className="mt-1.5 space-y-1">
              <div className="text-amber-400 font-semibold">{TIER_LABELS[tier]}</div>
              <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-pink-400 transition-all duration-300"
                  style={{ width: `${growth.affection}%` }}
                />
              </div>
              <div className="text-[9px] text-slate-500">{growth.affection} / 100</div>
            </div>
          )}
        </div>

        {/* 技能树 */}
        <div className="bg-slate-800/60 rounded-lg p-2.5 border border-slate-700/50">
          <div className="text-slate-400 font-semibold mb-2">技能树</div>
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
                      ? 'border-slate-700/30 opacity-40'
                      : 'border-slate-700/50'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px]">{skill.icon}</span>
                    <div>
                      <div className={`font-semibold ${!isUnlocked ? 'text-slate-500' : 'text-slate-200'}`}>
                        {skill.name}
                      </div>
                      {!isUnlocked && (
                        <div className="text-[9px] text-slate-500">
                          需要 Lv.{skill.unlockLevel}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* 技能等级点 */}
                    <div className="flex gap-0.5">
                      {[1, 2, 3].map(i => (
                        <span
                          key={i}
                          className={`inline-block w-1.5 h-1.5 rounded-full ${
                            i <= skillLevel ? 'bg-amber-400' : 'bg-slate-600'
                          }`}
                        />
                      ))}
                    </div>
                    {/* 升级按钮 */}
                    {canUpgrade && (
                      <button
                        onClick={() => upgradeSkill(skill.id)}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-amber-600/30 hover:bg-amber-600/50 border border-amber-600/40 text-amber-300 transition-colors"
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
