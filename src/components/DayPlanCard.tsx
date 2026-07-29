/**
 * 今日计划推荐卡片（v0.8 模块三）—— 任务面板顶部
 *
 * 基于 28 天精力曲线 + 待办清单，AI 推荐今天的开始时间、轮数与任务时段安排。
 * 一键应用：单轮时长写入专注配置，任务队列按推荐顺序重排。
 * 同一天命中 localStorage 缓存，不重复调用 LLM。
 */

import { useState } from 'react'
import { useTasks } from '../hooks/useEngines'
import {
  getCachedDayPlan,
  generateDayPlan,
  applyDayPlan,
  type DayPlan,
} from '../core/plan/day-plan'

export function DayPlanCard() {
  const { tasks } = useTasks()
  const [plan, setPlan] = useState<DayPlan | null>(() => getCachedDayPlan())
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)

  const pendingCount = tasks.filter((t) => !t.done).length

  async function handleGenerate() {
    if (loading) return
    setLoading(true)
    setErr(null)
    setApplied(false)
    try {
      setPlan(await generateDayPlan())
      setExpanded(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '生成失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  async function handleApply() {
    if (!plan) return
    await applyDayPlan(plan)
    setApplied(true)
    setTimeout(() => setApplied(false), 3000)
  }

  // 没有推荐也没有任务时不占空间
  if (!plan && pendingCount === 0) return null

  return (
    <div className="dayplan-card">
      <div className="dayplan-head">
        <span className="dayplan-title">☀️ 今日安排</span>
        {plan ? (
          <button className="btn ghost dayplan-toggle" onClick={() => setExpanded((v) => !v)}>
            {expanded ? '收起 ▲' : '展开 ▼'}
          </button>
        ) : (
          <button className="btn ghost dayplan-toggle" disabled={loading} onClick={() => void handleGenerate()}>
            {loading ? '生成中…' : '✨ AI 推荐'}
          </button>
        )}
      </div>

      {plan && (
        <div className="dayplan-summary">
          <span className="dayplan-chip">🕐 {plan.startHour}:00 开始</span>
          <span className="dayplan-chip">🍅 {plan.rounds} 轮 × {plan.focusMinutes} 分钟</span>
        </div>
      )}

      {plan && expanded && (
        <div className="dayplan-detail">
          {plan.slots.length > 0 && (
            <ul className="dayplan-slots">
              {plan.slots.map((s, i) => (
                <li key={i} className="dayplan-slot">
                  <span className="dayplan-slot-hour">{String(s.hour).padStart(2, '0')}:00</span>
                  <span className="dayplan-slot-task">{s.taskTitle}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="dayplan-advice">{plan.advice}</p>
          <div className="dayplan-actions">
            <button className="btn primary dayplan-btn" onClick={() => void handleApply()}>
              {applied ? '✅ 已应用' : '应用到专注配置'}
            </button>
            <button className="btn ghost dayplan-btn" disabled={loading} onClick={() => void handleGenerate()}>
              {loading ? '生成中…' : '重新生成'}
            </button>
          </div>
        </div>
      )}
      {err && <p className="dayplan-err">{err}</p>}
    </div>
  )
}
