/**
 * 计划卡片（v0.7）—— 任务面板顶部的活跃计划概览
 *
 * 有 active 计划时常驻：目标名、总进度条、今日阶段与任务数；
 * 展开可看全部阶段，支持归档（不再每日派发）。
 * 积压/进度落后时弹出重排建议横幅，AI 生成新阶段预览确认后生效（模块三）。
 */

import { useState } from 'react'
import { planEngine, usePlans, useTasks } from '../hooks/useEngines'
import { todayKey, rebalancePlanPhases } from '../core/plan/plan-llm'
import type { PlanPhase } from '../core/plan/types'

export function PlanCard() {
  const { activePlan } = usePlans()
  useTasks()  // 订阅任务变化以刷新完成进度
  const [expanded, setExpanded] = useState(false)
  // 重排流程状态（模块三）
  const [rebalanceDismissed, setRebalanceDismissed] = useState(false)
  const [rebalancing, setRebalancing] = useState(false)
  const [proposal, setProposal] = useState<PlanPhase[] | null>(null)
  const [rebalanceErr, setRebalanceErr] = useState<string | null>(null)
  const [rebalanceDone, setRebalanceDone] = useState(false)

  if (!activePlan) return null

  const progress = planEngine.getProgress(activePlan.id!)
  const today = todayKey()
  const todayDay = activePlan.days.find((d) => d.date === today)
  const dayIndex = activePlan.days.findIndex((d) => d.date === today)
  const pct = Math.round(progress.ratio * 100)

  // 阶段汇总（连续同名合并）
  const phaseSummary: { name: string; days: number }[] = []
  for (const d of activePlan.days) {
    const last = phaseSummary[phaseSummary.length - 1]
    if (last && last.name === d.phase) last.days++
    else phaseSummary.push({ name: d.phase, days: 1 })
  }

  const suggestRebalance = !rebalanceDismissed && !proposal && !rebalanceDone && planEngine.needsRebalance()

  async function handleRebalance() {
    const ctx = planEngine.getRebalanceContext()
    if (!ctx || rebalancing) return
    setRebalancing(true)
    setRebalanceErr(null)
    try {
      const phases = await rebalancePlanPhases({
        goal: ctx.plan.goal,
        level: ctx.plan.level,
        dailyMinutes: ctx.plan.dailyMinutes,
        remainingDays: ctx.remainingDays,
        backlogTitles: ctx.backlogTitles,
        doneRatio: ctx.doneRatio,
      })
      setProposal(phases)
    } catch (err) {
      setRebalanceErr(err instanceof Error ? err.message : '重排失败，请重试')
    } finally {
      setRebalancing(false)
    }
  }

  async function handleApply() {
    if (!proposal) return
    await planEngine.applyRebalance(proposal)
    setProposal(null)
    setRebalanceDone(true)
  }

  return (
    <div className="plan-card">
      <div className="plan-card-head">
        <span className="plan-card-goal">🎯 {activePlan.goal}</span>
        <button
          className="btn ghost plan-card-toggle"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? '收起 ▲' : '查看计划 ▼'}
        </button>
      </div>

      <div className="plan-progress-track">
        <div className="plan-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="plan-card-meta">
        <span>{pct}% · 已完成 {progress.doneTasks}/{progress.totalTasks} 项</span>
        {todayDay ? (
          <span className="plan-card-today">
            第 {dayIndex + 1}/{progress.totalDays} 天 · {todayDay.phase}
          </span>
        ) : (
          <span className="plan-card-today">今日不在计划区间</span>
        )}
      </div>

      {/* 重排建议横幅（模块三） */}
      {suggestRebalance && (
        <div className="plan-rebalance-banner">
          <span>⚡ 任务有积压，建议让 AI 重排剩余计划</span>
          <div className="plan-rebalance-actions">
            <button className="btn primary plan-rebalance-btn" disabled={rebalancing} onClick={() => void handleRebalance()}>
              {rebalancing ? '生成中…' : '重排'}
            </button>
            <button className="btn ghost plan-rebalance-btn" onClick={() => setRebalanceDismissed(true)}>忽略</button>
          </div>
        </div>
      )}
      {rebalanceErr && <div className="plan-rebalance-err">{rebalanceErr}</div>}

      {/* 重排预览确认（确认后才替换明天起的计划） */}
      {proposal && (
        <div className="plan-rebalance-preview">
          <div className="plan-rebalance-title">重排后的剩余计划（明天起生效）：</div>
          <ul className="plan-phase-summary">
            {proposal.map((p, i) => (
              <li key={i} className="plan-phase-row">
                <span>{p.name} · {p.daily.map((t) => t.title).join(' / ')}</span>
                <span className="plan-phase-days">{p.days} 天</span>
              </li>
            ))}
          </ul>
          <div className="plan-rebalance-actions">
            <button className="btn primary plan-rebalance-btn" onClick={() => void handleApply()}>✅ 应用重排</button>
            <button className="btn ghost plan-rebalance-btn" onClick={() => setProposal(null)}>取消</button>
          </div>
        </div>
      )}

      {/* 重排完成提示 */}
      {rebalanceDone && (
        <div className="plan-rebalance-done">
          <span>✨ 计划已重排，明天起按新节奏推进</span>
          <button className="recovery-close" onClick={() => setRebalanceDone(false)} aria-label="关闭">×</button>
        </div>
      )}

      {expanded && (
        <div className="plan-card-detail">
          <ul className="plan-phase-summary">
            {phaseSummary.map((p, i) => (
              <li key={i} className={`plan-phase-row ${todayDay?.phase === p.name ? 'current' : ''}`}>
                <span>{p.name}</span>
                <span className="plan-phase-days">{p.days} 天</span>
              </li>
            ))}
          </ul>
          <button
            className="btn ghost plan-archive-btn"
            onClick={() => {
              if (confirm('归档后不再每天自动派发任务，确定吗？')) {
                void planEngine.setStatus(activePlan.id!, 'archived')
              }
            }}
          >
            归档此计划
          </button>
        </div>
      )}
    </div>
  )
}
