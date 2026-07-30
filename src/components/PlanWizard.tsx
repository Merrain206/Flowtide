/**
 * 目标计划向导（v0.7）—— 目标 → AI 分阶段计划 → 一键入库
 *
 * 四项输入（目标/截止日期/每日投入/水平自评）→ AI 生成阶段模板 →
 * 按阶段预览（可调整每天的任务模板）→ 确认后展开成逐日计划保存，
 * 今天的任务立即派发进番茄钟队列。
 * v0.9.3：由暗色侧边抽屉改为居中浮动窗口（亮色）。
 */

import { useState } from 'react'
import { planEngine } from '../hooks/useEngines'
import { generatePlanPhases, expandPhases, toDateKey } from '../core/plan/plan-llm'
import type { GeneratePlanInput, PlanPhase } from '../core/plan/types'

interface Props {
  open: boolean
  onClose: () => void
}

const MINUTE_OPTIONS = [30, 60, 90, 120, 180, 240]

export function PlanWizard({ open, onClose }: Props) {
  const [goal, setGoal] = useState('')
  const [deadline, setDeadline] = useState('')
  const [dailyMinutes, setDailyMinutes] = useState(90)
  const [level, setLevel] = useState('')

  const [phases, setPhases] = useState<PlanPhase[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const canGenerate = goal.trim().length > 0 && deadline.length > 0

  async function handleGenerate() {
    if (!canGenerate) return
    setLoading(true)
    setError('')
    try {
      const input: GeneratePlanInput = {
        goal: goal.trim(),
        deadline: new Date(deadline).getTime(),
        dailyMinutes,
        level: level.trim(),
      }
      const result = await generatePlanPhases(input)
      setPhases(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    const days = expandPhases(phases)
    await planEngine.createPlan({
      goal: goal.trim(),
      deadline: new Date(deadline).getTime(),
      dailyMinutes,
      level: level.trim(),
      days,
    })
    setSaved(true)
    setTimeout(() => { onClose(); resetState() }, 1200)
  }

  function resetState() {
    setGoal('')
    setDeadline('')
    setDailyMinutes(90)
    setLevel('')
    setPhases([])
    setError('')
    setSaved(false)
  }

  // ── 阶段模板微调 ────────────────────────────────────────

  function adjustPomodoros(pi: number, ti: number, delta: number) {
    setPhases((prev) => prev.map((p, i) => i !== pi ? p : {
      ...p,
      daily: p.daily.map((t, j) => j !== ti ? t : {
        ...t, pomodoros: Math.max(1, Math.min(8, t.pomodoros + delta)),
      }),
    }))
  }

  function toggleCognition(pi: number, ti: number) {
    setPhases((prev) => prev.map((p, i) => i !== pi ? p : {
      ...p,
      daily: p.daily.map((t, j) => j !== ti ? t : {
        ...t, cognition: t.cognition === 'high' ? 'low' : 'high',
      }),
    }))
  }

  function removeTask(pi: number, ti: number) {
    setPhases((prev) => prev.map((p, i) => i !== pi ? p : {
      ...p, daily: p.daily.filter((_, j) => j !== ti),
    }).filter((p) => p.daily.length > 0))
  }

  if (!open) return null

  const totalDays = phases.reduce((s, p) => s + p.days, 0)
  const minDate = toDateKey(new Date(Date.now() + 86_400_000))  // 最早明天

  return (
    <div className="float-overlay" onClick={(e) => { if (e.target === e.currentTarget) { onClose(); resetState() } }}>
      <div className="float-window plan-wizard">
        <header className="float-head">
          <h3 className="float-title">🎯 目标计划</h3>
          <button className="btn ghost" onClick={() => { onClose(); resetState() }}>✕</button>
        </header>

        <div className="float-body">
        {/* 输入表单 */}
        {!phases.length && !loading && !saved && (
          <div className="plan-form">
            <p className="extract-hint">
              说出你的目标，AI 帮你拆成分阶段学习计划，每天的任务自动出现在番茄钟队列。
            </p>
            <label className="plan-field">
              <span className="plan-label">① 目标</span>
              <input
                className="text-input"
                placeholder="例如：通过大学英语四级"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
              />
            </label>
            <label className="plan-field">
              <span className="plan-label">② 截止日期</span>
              <input
                className="text-input"
                type="date"
                min={minDate}
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </label>
            <label className="plan-field">
              <span className="plan-label">③ 每天可投入</span>
              <div className="plan-minute-opts">
                {MINUTE_OPTIONS.map((m) => (
                  <button
                    key={m}
                    className={`btn ${dailyMinutes === m ? 'primary' : 'ghost'} plan-minute-btn`}
                    onClick={() => setDailyMinutes(m)}
                  >
                    {m >= 60 ? `${m / 60} 小时` : `${m} 分钟`}
                  </button>
                ))}
              </div>
            </label>
            <label className="plan-field">
              <span className="plan-label">④ 当前水平（选填）</span>
              <input
                className="text-input"
                placeholder="例如：四级 425 边缘，词汇量 3000"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              />
            </label>
            {error && <p className="extract-error">{error}</p>}
            <button
              className="btn primary extract-btn"
              onClick={handleGenerate}
              disabled={!canGenerate}
            >
              🤖 AI 生成计划
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="extract-loading">
            <span className="extract-spinner">⟳</span>
            正在规划你的 {goal.trim().slice(0, 12)}…
          </div>
        )}

        {/* 阶段预览 */}
        {phases.length > 0 && !saved && (
          <>
            <p className="extract-result-hint">
              共 <strong>{totalDays}</strong> 天、{phases.length} 个阶段。每个阶段的"每日任务"可微调，确认后每天自动派发：
            </p>
            <div className="plan-phase-list">
              {phases.map((phase, pi) => (
                <section key={pi} className="plan-phase">
                  <header className="plan-phase-head">
                    <span className="plan-phase-name">{phase.name}</span>
                    <span className="plan-phase-days">{phase.days} 天</span>
                  </header>
                  <ul className="extract-task-list">
                    {phase.daily.map((t, ti) => (
                      <li key={ti} className="extract-task-item selected">
                        <div className="extract-task-body">
                          <span className="task-title">{t.title}</span>
                        </div>
                        <button
                          className={`cog-chip ${t.cognition}`}
                          onClick={() => toggleCognition(pi, ti)}
                          title="切换认知负荷"
                        >
                          {t.cognition === 'high' ? '🧠 高' : '🌿 低'}
                        </button>
                        <div className="pomo-stepper">
                          <button className="stepper-btn" onClick={() => adjustPomodoros(pi, ti, -1)} disabled={t.pomodoros <= 1}>−</button>
                          <span className="stepper-val">🍅{t.pomodoros}</span>
                          <button className="stepper-btn" onClick={() => adjustPomodoros(pi, ti, 1)} disabled={t.pomodoros >= 8}>+</button>
                        </div>
                        <button className="del-btn" onClick={() => removeTask(pi, ti)} aria-label="删除">×</button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <div className="extract-footer">
              <button className="btn ghost" onClick={() => setPhases([])}>← 重新生成</button>
              <button className="btn primary" onClick={handleSave}>
                启用计划 →
              </button>
            </div>
          </>
        )}

        {/* 成功 */}
        {saved && (
          <div className="extract-success">
            ✅ 计划已启用！今天的任务已加入番茄钟队列
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
