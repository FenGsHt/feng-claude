/**
 * [2026-05-12] 21 点 Blackjack — 宠物小游戏
 * 改编自 blackjack.html，侧边栏内嵌面板。
 * 使用内置 VT323 字体，无遮罩，点击其他地方收起。
 * 主题跟随：所有颜色通过 var(--claude-*) CSS 变量获取，适配 dark/light/fallout/claude-code。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { usePetStore, getAffectionTier } from '../../store/petStore'
import { useGlobalTokenStore, computeCost } from '../../store/globalTokenStore'

/* ── Types ──────────────────────────────────────────────────────── */
interface Card { rank: string; suit: string }
type Phase = 'betting' | 'insurance' | 'player' | 'dealer' | 'result'

const SUITS = ['♠', '♥', '♦', '♣']
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

function cardValue(c: Card): number {
  if (c.rank === 'A') return 11
  if (['J', 'Q', 'K'].includes(c.rank)) return 10
  return parseInt(c.rank)
}

function calcScore(hand: Card[]): number {
  let s = hand.reduce((a, c) => a + cardValue(c), 0)
  let a = hand.filter(c => c.rank === 'A').length
  while (s > 21 && a > 0) { s -= 10; a-- }
  return s
}

function isSoft(hand: Card[]): boolean {
  let s = 0, a = 0
  for (const c of hand) {
    if (c.rank === 'A') { s += 11; a++ } else if (['J', 'Q', 'K'].includes(c.rank)) { s += 10 } else { s += parseInt(c.rank) }
  }
  while (s > 21 && a > 0) { s -= 10; a-- }
  return a > 0
}

function isRed(c: Card): boolean { return c.suit === '♥' || c.suit === '♦' }

function createDeck(): Card[] {
  const d: Card[] = []
  for (const s of SUITS) for (const r of RANKS) d.push({ rank: r, suit: s })
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

function deepGs(s: GameState): GameState {
  return {
    ...s,
    dealerHand: [...s.dealerHand],
    playerHands: s.playerHands.map(h => [...h]),
    deck: [...s.deck],
  }
}

/* ── Game state ─────────────────────────────────────────────────── */
interface GameState {
  deck: Card[]
  dealerHand: Card[]
  playerHands: Card[][]
  activeHandIdx: number
  phase: Phase
  currentBet: number
  insuranceBet: number
  message: string
  msgType: 'win' | 'lose' | 'push' | ''
  payoutMsg: string
  payoutType: 'win' | 'lose' | ''
  wins: number
  losses: number
  draws: number
  gameOver: boolean
}

function freshState(): GameState {
  return {
    deck: [], dealerHand: [], playerHands: [[]], activeHandIdx: 0,
    phase: 'betting', currentBet: 0, insuranceBet: 0,
    message: '请先下注', msgType: '', payoutMsg: '', payoutType: '',
    wins: 0, losses: 0, draws: 0, gameOver: false,
  }
}

/* ── Chip button ─────────────────────────────────────────────────── */
function ChipBtn({ value, color, disabled, onClick }: {
  value: number; color: string; disabled: boolean; onClick: () => void
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 text-[9px] font-bold text-white shadow active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-30 ${color}`}
    >
      {value}
    </button>
  )
}

/* ── Card display ────────────────────────────────────────────────── */
function CardView({ card, faceDown }: { card: Card; faceDown?: boolean }): React.ReactElement {
  if (faceDown) {
    return (
      <div className="flex h-[54px] w-[38px] items-center justify-center rounded border"
        style={{
          borderColor: 'var(--claude-border)',
          background: 'var(--claude-accent-bg)',
          backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)',
        }}
      />
    )
  }
  return (
    <div
      className={`flex h-[54px] w-[38px] flex-col items-center justify-center rounded border shadow ${isRed(card) ? 'text-red-500' : ''}`}
      style={{
        background: 'var(--claude-surface)',
        borderColor: 'var(--claude-border)',
        color: isRed(card) ? undefined : 'var(--claude-text)',
      }}
    >
      <span className="text-[11px] font-bold">{card.rank}</span>
      <span className="text-[13px] leading-none">{card.suit}</span>
    </div>
  )
}

/** 返回结算结果：赔付金额、胜负统计、消息 */
interface Settlement {
  payout: number
  wins: number; losses: number; draws: number
  message: string; msgType: 'win' | 'lose' | 'push' | ''
  payoutMsg: string; payoutType: 'win' | 'lose' | ''
}

function resolveEnd(s: GameState, dealerHand: Card[], reason: string): Settlement {
  const dScore = calcScore(dealerHand)
  let payout = 0
  let wins = s.wins, losses = s.losses, draws = s.draws
  let message = ''
  let msgType: 'win' | 'lose' | 'push' | '' = ''
  let payoutMsg = ''
  let payoutType: 'win' | 'lose' | '' = ''

  if (s.insuranceBet > 0) {
    if (dScore === 21 && dealerHand.length === 2) {
      payout += s.insuranceBet * 3; payoutMsg = `保险 +${s.insuranceBet * 2}`; payoutType = 'win'
    } else { payoutMsg = `保险 -${s.insuranceBet}`; payoutType = 'lose' }
  }

  if (reason === 'dealer-bj-peek') {
    for (const hand of s.playerHands) {
      if (calcScore(hand) === 21 && hand.length === 2) {
        payout += s.currentBet / s.playerHands.length; draws++
      } else { losses++ }
    }
    message = '庄家 BLACKJACK！'; msgType = 'lose'
    if (!s.insuranceBet) { payoutMsg = `-${s.currentBet}`; payoutType = 'lose' }
  }

  if (reason === 'player-bj') {
    payout = Math.floor(s.currentBet * 2.5); wins++
    message = 'BLACKJACK! 你赢了！'; msgType = 'win'
    payoutMsg = `+${Math.floor(s.currentBet * 1.5)}`; payoutType = 'win'
  }

  if (reason === 'normal') {
    const handBet = s.currentBet / s.playerHands.length
    let tw = 0, tl = 0, td = 0
    for (const hand of s.playerHands) {
      const pScore = calcScore(hand)
      if (pScore > 21) { tl++ }
      else if (dScore > 21) { tw++; payout += handBet * 2 }
      else if (pScore > dScore) { tw++; payout += handBet * 2 }
      else if (pScore < dScore) { tl++ }
      else { td++; payout += handBet }
    }
    wins += tw; losses += tl; draws += td

    if (s.playerHands.length > 1) {
      message = `${tw}胜${tl}负${td}平`; msgType = tw > tl ? 'win' : tw < tl ? 'lose' : 'push'
    } else {
      const pScore = calcScore(s.playerHands[0])
      const r = pScore > 21 ? 'lose' : dScore > 21 ? 'win' : pScore > dScore ? 'win' : pScore < dScore ? 'lose' : 'push'
      if (r === 'lose') { message = `${pScore} vs ${dScore} 庄家赢了`; msgType = 'lose'; payoutMsg = `-${handBet}`; payoutType = 'lose' }
      else if (r === 'win') { message = `${pScore} vs ${dScore} 你赢了！`; msgType = 'win'; payoutMsg = `+${handBet}`; payoutType = 'win' }
      else { message = `${pScore} vs ${dScore} 平局！`; msgType = 'push'; payoutMsg = '退还赌注' }
    }
  }

  return { payout, wins, losses, draws, message, msgType, payoutMsg, payoutType }
}

/* ── Main Component ─────────────────────────────────────────────── */
export function BlackjackGame({
  onClose,
  onMinimize,
  sessionKey,
}: {
  onClose: () => void
  onMinimize: () => void
  sessionKey: number
}): React.ReactElement {
  const { gameCoins, setGameCoins, addGameCoins, sessionPnl, setSessionPnl,
          recordGameDecision, takeGameDecisions, config, growth, setSpeech, setMood,
        } = usePetStore()
  const [gs, setGs] = useState<GameState>(() => freshState())
  const [showAi, setShowAi] = useState(false)
  const dealerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // Track opening balance and token cost for correct PnL across panel reopen
  const openBalanceRef = useRef(gameCoins)
  const openCostRef = useRef(0)

  // Reset baseline when session key changes (game restored from minimize)
  useEffect(() => {
    openBalanceRef.current = gameCoins
    openCostRef.current = computeCost(useGlobalTokenStore.getState().total, useGlobalTokenStore.getState().pricing)
  }, [sessionKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Click outside to minimize
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        handleMinimize()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Track opening cost for sync catch-up on close
  useEffect(() => {
    openCostRef.current = computeCost(useGlobalTokenStore.getState().total, useGlobalTokenStore.getState().pricing)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Place bet ────────────────────────────────────────────────── */
  const placeBet = useCallback((amount: number) => {
    setGs(s => {
      if (s.phase !== 'betting') return s
      return { ...s, currentBet: Math.min(s.currentBet + amount, gameCoins) }
    })
  }, [gameCoins])

  /* ── Deal (reset decisions for new round) ─────────────────────── */
  const deal = useCallback(() => {
    takeGameDecisions()
    setGs(s => {
      if (s.currentBet === 0 || s.phase !== 'betting') return s
      const deck = createDeck()
      const dealerHand: Card[] = [deck.pop()!, deck.pop()!]
      const playerHands: Card[][] = [[deck.pop()!, deck.pop()!]]
      // Deduct bet from gameCoins immediately
      setGameCoins(gameCoins - s.currentBet)

      recordGameDecision(`下注 $${s.currentBet}`)

      if (dealerHand[0].rank === 'A') {
        return { ...s, deck, dealerHand, playerHands, activeHandIdx: 0, phase: 'insurance', insuranceBet: 0, message: '庄家明牌是 A，买保险？' }
      }
      if (['10', 'J', 'Q', 'K'].includes(dealerHand[0].rank) && calcScore(dealerHand) === 21) {
        const r = resolveEnd(s, dealerHand, 'dealer-bj-peek')
        setGameCoins(gameCoins + r.payout)
        const next: GameState = { ...s, deck, dealerHand, playerHands, activeHandIdx: 0, ...r }
        return { ...next, phase: 'result' as Phase, gameOver: gameCoins + r.payout <= 0 }
      }
      if (calcScore(playerHands[0]) === 21) {
        const r = resolveEnd(s, playerHands[0], 'player-bj')
        setGameCoins(gameCoins + r.payout)
        const next: GameState = { ...s, deck, dealerHand, playerHands, activeHandIdx: 0, ...r }
        return { ...next, phase: 'result' as Phase }
      }
      return { ...s, deck, dealerHand, playerHands, activeHandIdx: 0, phase: 'player' as Phase, insuranceBet: 0, message: '要牌 / 停牌 / 加倍 / 分牌' }
    })
  }, [gameCoins, recordGameDecision, takeGameDecisions, setGameCoins])

  /* ── Insurance ────────────────────────────────────────────────── */
  const takeInsurance = useCallback((yes: boolean) => {
    setGs(s => {
      if (s.phase !== 'insurance') return s
      let insuranceBet = 0
      if (yes) { insuranceBet = Math.floor(s.currentBet / 2); setGameCoins(usePetStore.getState().gameCoins - insuranceBet) }
      recordGameDecision(yes ? `买保险 $${Math.floor(s.currentBet / 2)}` : '不买保险')

      if (['10', 'J', 'Q', 'K'].includes(s.dealerHand[0].rank) && calcScore(s.dealerHand) === 21) {
        const r = resolveEnd(s, s.dealerHand, 'dealer-bj-peek')
        setGameCoins(usePetStore.getState().gameCoins + r.payout)
        const next: GameState = { ...s, insuranceBet, ...r }
        return { ...next, phase: 'result' as Phase, gameOver: usePetStore.getState().gameCoins + r.payout <= 0 }
      }
      if (calcScore(s.playerHands[0]) === 21) {
        const r = resolveEnd(s, s.playerHands[0], 'player-bj')
        setGameCoins(usePetStore.getState().gameCoins + r.payout)
        const next: GameState = { ...s, insuranceBet, ...r }
        return { ...next, phase: 'result' as Phase }
      }
      return { ...s, insuranceBet, phase: 'player' as Phase, message: '要牌 / 停牌 / 加倍 / 分牌' }
    })
  }, [recordGameDecision, setGameCoins])

  /* ── Player actions ───────────────────────────────────────────── */
  const hit = useCallback(() => {
    setGs(s => {
      if (s.phase !== 'player') return s
      const ns = deepGs(s)
      const hand = ns.playerHands[ns.activeHandIdx]
      const scoreBefore = calcScore(hand)
      hand.push(ns.deck.pop()!)
      const score = calcScore(hand)
      recordGameDecision(`要牌 ${scoreBefore}→${score}`)
      if (score >= 21) return advanceHand(ns)
      return ns
    })
  }, [recordGameDecision])

  const stand = useCallback(() => {
    setGs(s => {
      if (s.phase !== 'player') return s
      const hand = s.playerHands[s.activeHandIdx]
      recordGameDecision(`停牌 ${calcScore(hand)}点`)
      return advanceHand(s)
    })
  }, [recordGameDecision])

  const doubleDown = useCallback(() => {
    setGs(s => {
      if (s.phase !== 'player') return s
      const hand = s.playerHands[s.activeHandIdx]
      if (hand.length !== 2 || gameCoins < s.currentBet) return s
      const ns = deepGs(s)
      const h = ns.playerHands[ns.activeHandIdx]
      h.push(ns.deck.pop()!)
      setGameCoins(gameCoins - ns.currentBet)
      ns.currentBet *= 2
      recordGameDecision(`加倍 $${s.currentBet}`)
      if (calcScore(h) >= 21) return advanceHand(ns)
      return ns
    })
  }, [gameCoins, recordGameDecision, setGameCoins])

  const splitHand = useCallback(() => {
    setGs(s => {
      if (s.phase !== 'player') return s
      const hand = s.playerHands[s.activeHandIdx]
      if (hand.length !== 2 || cardValue(hand[0]) !== cardValue(hand[1])) return s
      if (s.playerHands.length >= 4 || gameCoins < s.currentBet) return s
      const ns = deepGs(s)
      setGameCoins(gameCoins - ns.currentBet)
      const h = ns.playerHands[ns.activeHandIdx]
      ns.playerHands[ns.activeHandIdx] = [h[0], ns.deck.pop()!]
      ns.playerHands.splice(ns.activeHandIdx + 1, 0, [h[1], ns.deck.pop()!])
      recordGameDecision(`分牌`)
      const score = calcScore(ns.playerHands[ns.activeHandIdx])
      if (score >= 21) return advanceHand(ns)
      return ns
    })
  }, [gameCoins, recordGameDecision, setGameCoins])

  /* ── Advance hand ─────────────────────────────────────────────── */
  function advanceHand(s: GameState): GameState {
    const next = s.activeHandIdx + 1
    if (next >= s.playerHands.length) return startDealer(s)
    if (calcScore(s.playerHands[next]) === 21) return advanceHand({ ...s, activeHandIdx: next })
    return { ...s, activeHandIdx: next, message: s.playerHands.length > 1 ? `手牌 ${next + 1}` : '' }
  }

  function startDealer(s: GameState): GameState {
    return { ...s, phase: 'dealer', message: '' }
  }

  /* ── Dealer play (H17) via timer ──────────────────────────────── */
  useEffect(() => {
    if (gs.phase !== 'dealer') return

    const tick = () => {
      setGs(s => {
        if (s.phase !== 'dealer') return s
        const dScore = calcScore(s.dealerHand)
        const soft = isSoft(s.dealerHand)
        if (dScore < 17 || (dScore === 17 && soft)) {
          const ns = deepGs(s)
          ns.dealerHand.push(ns.deck.pop()!)
          return ns
        }
        // Settle
        const r = resolveEnd(s, s.dealerHand, 'normal')
        setGameCoins(usePetStore.getState().gameCoins + r.payout)
        return { ...s, ...r, phase: 'result' as Phase, gameOver: usePetStore.getState().gameCoins + r.payout <= 0 }
      })
    }

    tick()
    dealerTimerRef.current = setTimeout(() => {
      const checkMore = () => {
        setGs(s => {
          if (s.phase !== 'dealer') return s
          const dScore = calcScore(s.dealerHand)
          const soft = isSoft(s.dealerHand)
          if (dScore < 17 || (dScore === 17 && soft)) {
            const ns = deepGs(s)
            ns.dealerHand.push(ns.deck.pop()!)
            dealerTimerRef.current = setTimeout(checkMore, 500)
            return ns
          }
          // Settle
          const r = resolveEnd(s, s.dealerHand, 'normal')
          setGameCoins(usePetStore.getState().gameCoins + r.payout)
          return { ...s, ...r, phase: 'result' as Phase, gameOver: usePetStore.getState().gameCoins + r.payout <= 0 }
        })
      }
      checkMore()
    }, 500)

    return () => { if (dealerTimerRef.current) clearTimeout(dealerTimerRef.current) }
  }, [gs.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Reset ────────────────────────────────────────────────────── */
  const resetGame = useCallback(() => {
    setGs(freshState())
  }, [])

  /* ── 宠物游戏点评（调用大模型 API）─────────────────────────────── */
  const triggerPetComment = useCallback(async (outcome: 'win' | 'lose' | 'push', decisions: string[], pnlDelta: number) => {
    const tier = getAffectionTier(growth.affection)
    const probability = tier === 'soulmate' ? 0.8 : tier === 'close' ? 0.6 : tier === 'friendly' ? 0.4 : tier === 'normal' ? 0.25 : 0.1
    if (Math.random() > probability) return
    try {
      const result = await window.electronAPI.pet.gameComment({
        petConfig: { name: config.name, personality: config.personality, type: config.type },
        growth: { level: growth.level, affection: growth.affection, skills: growth.skills },
        decisions: decisions.slice(-5),
        outcome,
        pnlDelta,
      })
      if (result.text) {
        setSpeech(result.text)
        setMood('excited')
        setTimeout(() => setMood('idle'), 5000)
      }
    } catch {
      // API 调用失败时静默降级，不影响游戏体验
    }
  }, [config, growth, setSpeech, setMood])

  /* ── Settle & close (unified) ─────────────────────────────────── */
  const settleAndClose = useCallback(() => {
    if (dealerTimerRef.current) clearTimeout(dealerTimerRef.current)

    // [1] Calculate game result PnL BEFORE any token sync
    const gameDelta = gameCoins - openBalanceRef.current

    // [2] Sync missed tokens → coins (does NOT affect PnL)
    const currentCost = computeCost(useGlobalTokenStore.getState().total, useGlobalTokenStore.getState().pricing)
    const missedDelta = currentCost - openCostRef.current
    if (missedDelta > 0) {
      addGameCoins(Math.round(missedDelta * 100) / 100)
    }

    // [3] Accumulate only game result into PnL
    setSessionPnl(sessionPnl + gameDelta)

    // [4] Pet comment based on game result only
    const decisions = takeGameDecisions()
    const outcome = gameDelta > 0 ? 'win' : gameDelta < 0 ? 'lose' : 'push'
    triggerPetComment(outcome, decisions, gameDelta)
  }, [gameCoins, sessionPnl, addGameCoins, setSessionPnl, takeGameDecisions, triggerPetComment])

  /* ── Minimize (hide panel, keep state alive) ──────────────────── */
  const handleMinimize = useCallback(() => {
    settleAndClose()
    onMinimize()
  }, [settleAndClose, onMinimize])

  /* ── Close (fully destroy) ────────────────────────────────────── */
  const handleClose = useCallback(() => {
    settleAndClose()
    if ((window as any).__gameIsOpenRef) {
      (window as any).__gameIsOpenRef.current = false
    }
    onClose()
  }, [settleAndClose, onClose])

  /* ── Render ───────────────────────────────────────────────────── */
  const isPlayer = gs.phase === 'player'
  const activeHand = gs.playerHands[gs.activeHandIdx] ?? []
  const showDealerAll = gs.phase === 'dealer' || gs.phase === 'result'
  const dScore = calcScore(gs.dealerHand)
  const dScoreStr = showDealerAll ? `${dScore}` : (gs.dealerHand.length > 0 ? `${cardValue(gs.dealerHand[0])} + ?` : '')
  const dSoft = showDealerAll && isSoft(gs.dealerHand) ? ' 软' : ''
  const aScore = calcScore(activeHand)
  const aSoft = isSoft(activeHand) ? ' 软' : ''
  const canDbl = isPlayer && activeHand.length === 2 && gameCoins >= gs.currentBet
  const canSplt = isPlayer && activeHand.length === 2 && cardValue(activeHand[0]) === cardValue(activeHand[1]) && gs.playerHands.length < 4 && gameCoins >= gs.currentBet
  const canDeal = gs.phase === 'betting' || gs.phase === 'result'
  const accuracy = gs.wins + gs.losses + gs.draws > 0 ? Math.round(gs.wins / (gs.wins + gs.losses + gs.draws) * 100) : 0
  // Current session PnL (resets on game close) + cumulative total
  const sessionPnlDelta = gameCoins - openBalanceRef.current
  const totalPnl = sessionPnl + sessionPnlDelta
  const pnlColor = totalPnl > 0 ? 'var(--theme-success-text, #2ecc71)' : totalPnl < 0 ? 'var(--theme-danger-text, #e94560)' : 'var(--claude-muted)'

  return (
    <div
      ref={panelRef}
      className="shrink-0 overflow-hidden rounded-t-xl border"
      style={{
        background: 'var(--claude-surface)',
        borderColor: 'var(--claude-border)',
        boxShadow: '0 -4px 20px var(--claude-shadow, rgba(0,0,0,0.3))',
      }}
    >
      {/* Title bar */}
      <div className="flex items-center justify-between px-3 py-1.5"
        style={{ borderBottom: '1px solid var(--claude-border)' }}
      >
        <span className="text-sm font-bold tracking-wider"
          style={{ fontFamily: 'VT323, monospace', color: 'var(--claude-accent)' }}>
          ♠ 21 ♥ 点 ♦ ♣
        </span>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold"
            style={{ fontFamily: 'VT323, monospace', color: 'var(--theme-success-text, #2ecc71)' }}>
            {Math.floor(gameCoins).toLocaleString()}
          </span>
          <span className="text-[11px] font-bold" style={{ color: pnlColor, fontFamily: 'VT323, monospace' }}>
            {totalPnl > 0 ? `+${Math.floor(totalPnl)}` : Math.floor(totalPnl)}
          </span>
          <button onClick={handleClose}
            className="rounded px-1.5 py-0.5 text-xs transition hover:bg-white/10"
            style={{ color: 'var(--claude-muted)' }}
            title="关闭游戏（卸载）">
            ✕
          </button>
        </div>
      </div>

      <div className="px-3 py-2.5">
        {/* Bet chips */}
        {(gs.phase === 'betting' || gs.phase === 'result') && !gs.gameOver && (
          <div className="mb-2 flex items-center justify-center gap-1.5">
            <span className="text-[9px]" style={{ color: 'var(--claude-muted)' }}>下注</span>
            <ChipBtn value={5} color="bg-red-500" disabled={5 > gameCoins} onClick={() => placeBet(5)} />
            <ChipBtn value={25} color="bg-green-500" disabled={25 > gameCoins} onClick={() => placeBet(25)} />
            <ChipBtn value={100} color="bg-blue-500" disabled={100 > gameCoins} onClick={() => placeBet(100)} />
            <ChipBtn value={500} color="bg-purple-500" disabled={500 > gameCoins} onClick={() => placeBet(500)} />
            <span className="ml-1 min-w-[48px] text-center text-base font-bold"
              style={{ fontFamily: 'VT323, monospace', color: 'var(--claude-accent)' }}>
              {gs.currentBet > 0 ? `$${gs.currentBet}` : '$0'}
            </span>
            <button onClick={gs.phase === 'result' ? resetGame : deal} disabled={gs.phase === 'betting' && gs.currentBet === 0}
              className="ml-1 rounded px-3 py-1 text-[10px] font-bold text-white transition disabled:opacity-40"
              style={{
                fontFamily: 'VT323, monospace',
                background: 'var(--claude-accent-bg, #e94560)',
                boxShadow: '0 2px 0 color-mix(in srgb, var(--claude-accent-bg) 80%, black)',
              }}>
              {gs.phase === 'result' ? '再来一局' : '发牌'}
            </button>
          </div>
        )}

        {/* Insurance */}
        {gs.phase === 'insurance' && (
          <div className="mb-2 flex items-center justify-center gap-2 rounded border-2 border-dashed px-3 py-1.5 text-[10px]"
            style={{
              background: 'var(--theme-danger-bg, rgba(233,69,96,0.1))',
              borderColor: 'var(--theme-danger-border, rgba(233,69,96,0.4))',
              color: 'var(--theme-danger-text, #e94560)',
            }}>
            <span>庄家明牌是 A，买保险？</span>
            <button onClick={() => takeInsurance(true)} disabled={Math.floor(gs.currentBet / 2) > gameCoins}
              className="rounded px-2 py-0.5 text-[9px] font-bold text-white disabled:opacity-40"
              style={{
                fontFamily: 'VT323, monospace',
                background: 'var(--theme-accent-bg, #f5c542)',
                color: 'var(--theme-accent-text, #fff)',
              }}>${Math.floor(gs.currentBet / 2)}</button>
            <button onClick={() => takeInsurance(false)}
              className="rounded px-2 py-0.5 text-[9px] font-bold transition"
              style={{
                fontFamily: 'VT323, monospace',
                background: 'var(--claude-surface2)',
                border: '1px solid var(--claude-border)',
                color: 'var(--claude-text)',
              }}>不买</button>
          </div>
        )}

        {/* Dealer hand */}
        <div className="mb-2 rounded border p-2"
          style={{
            background: 'var(--claude-surface2)',
            borderColor: 'var(--claude-border)',
          }}>
          <div className="mb-1 flex justify-between text-[9px]" style={{ color: 'var(--claude-muted)' }}>
            <span>庄家</span>
            <span style={{ color: 'var(--claude-text)' }}>{dScoreStr}{dSoft}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {gs.dealerHand.map((c, i) => (
              <CardView key={i} card={c} faceDown={!showDealerAll && i === 1} />
            ))}
          </div>
        </div>

        {/* Player hand */}
        <div className="mb-2 rounded border p-2"
          style={{
            background: 'var(--claude-surface2)',
            borderColor: 'var(--claude-border)',
          }}>
          <div className="mb-1 flex justify-between text-[9px]" style={{ color: 'var(--claude-muted)' }}>
            <span>{gs.playerHands.length > 1 ? `手牌 ${gs.activeHandIdx + 1}` : '玩家'}</span>
            <span style={{ color: 'var(--claude-text)' }}>{aScore}{aSoft}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {activeHand.map((c, i) => <CardView key={i} card={c} />)}
          </div>
        </div>

        {/* Message */}
        <div
          className="text-center text-sm font-bold"
          style={{
            fontFamily: 'VT323, monospace',
            minHeight: 20,
            color: gs.msgType === 'win' ? 'var(--theme-success-text, #2ecc71)'
              : gs.msgType === 'lose' ? 'var(--theme-danger-text, #e94560)'
              : 'var(--claude-accent)',
          }}
        >
          {gs.message || (gs.phase === 'dealer' ? '庄家发牌中...' : '')}
        </div>
        {gs.payoutMsg && (
          <div
            className="text-center text-[10px]"
            style={{
              fontFamily: 'VT323, monospace',
              color: gs.payoutType === 'win' ? 'var(--theme-success-text, #2ecc71)'
                : gs.payoutType === 'lose' ? 'var(--theme-danger-text, #e94560)'
                : 'var(--claude-muted)',
            }}
          >
            {gs.payoutMsg}
          </div>
        )}

        {/* Action buttons */}
        {canDeal && gs.phase !== 'betting' && (
          <div className="mt-1.5 flex justify-center">
            <button onClick={resetGame}
              className="rounded px-4 py-1 text-[10px] font-bold text-white transition"
              style={{
                fontFamily: 'VT323, monospace',
                background: '#e94560',
                boxShadow: '0 2px 0 #b8334a',
              }}>
              再来一局
            </button>
          </div>
        )}
        {isPlayer && (
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
            <button onClick={hit}
              className="rounded px-3 py-1 text-[10px] font-bold text-white transition"
              style={{
                fontFamily: 'VT323, monospace',
                background: '#2ecc71',
                boxShadow: '0 2px 0 #27ae60',
              }}>要牌 Hit</button>
            <button onClick={stand}
              className="rounded px-3 py-1 text-[10px] font-bold text-white transition"
              style={{
                fontFamily: 'VT323, monospace',
                background: '#f39c12',
                boxShadow: '0 2px 0 #d68910',
              }}>停牌 Stand</button>
            {canDbl && (
              <button onClick={doubleDown}
                className="rounded px-3 py-1 text-[10px] font-bold text-white transition"
                style={{
                  fontFamily: 'VT323, monospace',
                  background: '#9b59b6',
                  boxShadow: '0 2px 0 #7d3c98',
                }}>加倍 Double</button>
            )}
            {canSplt && (
              <button onClick={splitHand}
                className="rounded px-3 py-1 text-[10px] font-bold text-white transition"
                style={{
                  fontFamily: 'VT323, monospace',
                  background: '#e67e22',
                  boxShadow: '0 2px 0 #c0650f',
                }}>分牌 Split</button>
            )}
          </div>
        )}

        {/* Game over */}
        {gs.gameOver && (
          <div className="mt-2 rounded border px-3 py-2 text-center"
            style={{
              borderColor: 'var(--theme-danger-border, rgba(233,69,96,0.4))',
              background: 'var(--theme-danger-bg, rgba(233,69,96,0.1))',
            }}>
            <p className="text-sm font-bold"
              style={{ fontFamily: 'VT323, monospace', color: 'var(--theme-danger-text, #e94560)' }}>GAME OVER</p>
            <button onClick={resetGame}
              className="mt-1 rounded px-4 py-1 text-[10px] font-bold text-white"
              style={{ fontFamily: 'VT323, monospace', background: 'var(--theme-danger-text, #e94560)' }}>
              重新开始
            </button>
          </div>
        )}

        {/* Scoreboard + AI */}
        <div className="mt-2 flex items-center justify-between text-[9px]" style={{ color: 'var(--claude-muted)' }}>
          <div className="flex gap-3">
            <span>胜 <span style={{ color: 'var(--claude-accent)' }}>{gs.wins}</span></span>
            <span>负 <span style={{ color: 'var(--claude-accent)' }}>{gs.losses}</span></span>
            <span>平 <span style={{ color: 'var(--claude-accent)' }}>{gs.draws}</span></span>
          </div>
          <button onClick={() => setShowAi(!showAi)}
            className="transition"
            style={{ color: 'var(--claude-muted)' }}
            onMouseEnter={e => { (e.target as HTMLElement).style.color = 'var(--claude-accent)' }}
            onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--claude-muted)' }}>
            AI 分析
          </button>
        </div>

        {/* AI panel */}
        {showAi && (
          <div className="mt-2 rounded border p-2"
            style={{
              background: 'var(--claude-surface2)',
              borderColor: 'var(--claude-border)',
            }}>
            <div className="mb-1 flex items-center gap-2 text-[9px]" style={{ color: 'var(--claude-muted)' }}>
              <span>胜率</span>
              <div className="h-2 flex-1 rounded border" style={{ borderColor: 'var(--claude-border)', background: 'var(--claude-surface)' }}>
                <div className="h-full rounded bg-[#2ecc71] transition-all" style={{ width: `${accuracy}%` }} />
              </div>
              <span className="w-8 text-right" style={{ color: 'var(--claude-text)' }}>{accuracy}%</span>
            </div>
            <p className="text-center text-[8px]" style={{ color: 'var(--claude-muted)' }}>共 {gs.wins + gs.losses + gs.draws} 局</p>
          </div>
        )}
      </div>
    </div>
  )
}
