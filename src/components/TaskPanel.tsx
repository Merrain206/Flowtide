/**
 * 任务面板（编号 02）—— 任务清单管理
 *
 * 简洁的任务输入框 + 列表，每个任务卡片：
 *   标题 + 认知标签（高/低）+ 预估番茄数 + 完成勾选
 * 上下箭头排序，专注开始时从队列头部取任务关联到当前 session。
 */

import { useState } from 'react'
import { taskEngine, useTasks } from '../hooks/useEngines'
import type { Task } from '../core/task/TaskEngine'
import { PlanCard } from './PlanCard'
import { DayPlanCard } from './DayPlanCard'

interface Props {
  onOpenExtractor?: () => void
  onOpenPlan?: () => void
}

export function TaskPanel({ onOpenExtractor, onOpenPlan }: Props = {}) {
  const { tasks } = useTasks()
  const [title, setTitle] = useState('')
  const [cognition, setCognition] = useState<'high' | 'low'>('high')
  const [pomodoros, setPomodoros] = useState(1)

  async function handleAdd() {
    const trimmed = title.trim()
    if (!trimmed) return
    await taskEngine.addTask(trimmed, cognition, pomodoros)
    setTitle('')
    setPomodoros(1)
  }

  async function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      await handleAdd()
    }
  }

  async function toggleDone(task: Task) {
    if (task.done) {
      await taskEngine.reopenTask(task.id!)
    } else {
      await taskEngine.completeTask(task.id!)
    }
  }

  function moveUp(idx: number) {
    if (idx === 0) return
    const ids = tasks.map((t) => t.id!)
    ;[ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]]
    void taskEngine.reorderTasks(ids)
  }

  function moveDown(idx: number) {
    if (idx === tasks.length - 1) return
    const ids = tasks.map((t) => t.id!)
    ;[ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]]
    void taskEngine.reorderTasks(ids)
  }

  const pending = tasks.filter((t) => !t.done)
  const done = tasks.filter((t) => t.done)

  return (
    <section className="panel task-panel">
      <header className="panel-head">
        <span className="sec-no">02</span>
        <h2 className="panel-title">任务</h2>
        <span className="task-count">{pending.length} 待办</span>
        {onOpenPlan && (
          <button
            className="btn ghost task-ai-btn"
            onClick={onOpenPlan}
            title="AI 目标计划"
          >
            🎯 计划
          </button>
        )}
        {onOpenExtractor && (
          <button
            className="btn ghost task-ai-btn"
            onClick={onOpenExtractor}
            title="AI 日程提取"
          >
            📅 AI 提取
          </button>
        )}
      </header>

      {/* 活跃计划概览（v0.7） */}
      <PlanCard />

      {/* AI 今日安排推荐（v0.8） */}
      <DayPlanCard />

      {/* 输入区 */}
      <div className="task-input-row">
        <input
          className="text-input task-input"
          placeholder="添加新任务..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className={`cog-chip ${cognition === 'high' ? 'high' : 'low'}`}
          onClick={() => setCognition((c) => (c === 'high' ? 'low' : 'high'))}
          title="切换认知负荷"
        >
          {cognition === 'high' ? '🧠 高' : '🌿 低'}
        </button>
        <div className="pomo-stepper">
          <button
            className="stepper-btn"
            onClick={() => setPomodoros((p) => Math.max(1, p - 1))}
            disabled={pomodoros <= 1}
          >−</button>
          <span className="stepper-val">🍅{pomodoros}</span>
          <button
            className="stepper-btn"
            onClick={() => setPomodoros((p) => Math.min(8, p + 1))}
            disabled={pomodoros >= 8}
          >+</button>
        </div>
        <button className="btn primary add-btn" onClick={handleAdd}>+</button>
      </div>

      {/* 待办列表 */}
      {pending.length === 0 && (
        <div className="empty-state">
          <div className="empty-emoji">📝</div>
          <div className="empty-text">还没有待办任务</div>
          <div className="empty-sub">添加一个，让专注有的放矢</div>
          <button
            className="btn primary"
            style={{ marginTop: 4 }}
            onClick={() => document.querySelector<HTMLInputElement>('.task-input')?.focus()}
          >
            添加任务
          </button>
        </div>
      )}
      <ul className="task-list">
        {pending.map((task, idx) => (
          <li key={task.id} className={`task-item ${task.cognition}`}>
            <button
              className="task-check"
              onClick={() => toggleDone(task)}
              aria-label="完成"
            >
              ○
            </button>
            <div className="task-body">
              <span className="task-title">{task.title}</span>
              <div className="task-meta">
                {task.time && <span className="task-time-tag">🕐 {task.time}</span>}
                <span className={`cog-tag ${task.cognition}`}>
                  {task.cognition === 'high' ? '高认知' : '低认知'}
                </span>
                <span className="pomo-tag">🍅×{task.pomodoros}</span>
              </div>
            </div>
            <div className="task-arrows">
              <button
                className="arrow-btn"
                onClick={() => moveUp(idx)}
                disabled={idx === 0}
                aria-label="上移"
              >↑</button>
              <button
                className="arrow-btn"
                onClick={() => moveDown(idx)}
                disabled={idx === pending.length - 1}
                aria-label="下移"
              >↓</button>
            </div>
            <button
              className="del-btn"
              onClick={() => taskEngine.removeTask(task.id!)}
              aria-label="删除"
            >×</button>
          </li>
        ))}
      </ul>

      {/* 已完成 */}
      {done.length > 0 && (
        <>
          <div className="done-header">已完成 ({done.length})</div>
          <ul className="task-list done-list">
            {done.map((task) => (
              <li key={task.id} className={`task-item done ${task.cognition}`}>
                <button
                  className="task-check done"
                  onClick={() => toggleDone(task)}
                  aria-label="恢复"
                >
                  ✓
                </button>
                <div className="task-body">
                  <span className="task-title">{task.title}</span>
                </div>
                <button
                  className="del-btn"
                  onClick={() => taskEngine.removeTask(task.id!)}
                  aria-label="删除"
                >×</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
