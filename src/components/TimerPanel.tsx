/**
 * 番茄钟面板 —— 环形进度 + 阶段控制
 */

import { focusEngine, useFocus } from '../hooks/useEngines'
import type { FocusPhase } from '../core/focus/types'

const PHASE_META: Record<FocusPhase, { label: string; hint: string; color: string }> = {
  idle: { label: '待命', hint: '准备好了就开始一轮专注', color: 'var(--c-idle)' },
  focus: { label: '专注中', hint: '沉浸在当下的任务里', color: 'var(--c-focus)' },
  flow: { label: '心流延长', hint: '到点了，但不打断你 · 随时可以落地休息', color: 'var(--c-flow)' },
  shortBreak: { label: '短休息', hint: '站起来走走，看看远处', color: 'var(--c-break)' },
  longBreak: { label: '长休息', hint: '好好休整，为下一程蓄力', color: 'var(--c-break)' },
}

function fmt(ms: number): string {
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function fmtHours(ms: number): string {
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes} 分钟`
  return `${(minutes / 60).toFixed(1)} 小时`
}

const RING_R = 118
const RING_C = 2 * Math.PI * RING_R

export function TimerPanel() {
  const snap = useFocus()
  const meta = PHASE_META[snap.phase]
  const inBreak = snap.phase === 'shortBreak' || snap.phase === 'longBreak'
  const running = snap.phase !== 'idle'

  // flow 阶段进度环反向填充（展示已延长量），其余阶段展示剩余比例
  const progress = snap.totalMs > 0 ? snap.remainingMs / snap.totalMs : 0
  const dash = snap.phase === 'flow'
    ? RING_C * (1 - progress)
    : RING_C * progress

  return (
    <section className="panel timer-panel">
      <header className="panel-head">
        <span className="phase-badge" style={{ background: meta.color }}>{meta.label}</span>
        <span className="phase-hint">{meta.hint}</span>
      </header>

      <div className="ring-wrap">
        <svg viewBox="0 0 260 260" className="ring">
          <circle cx="130" cy="130" r={RING_R} className="ring-track" />
          <circle
            cx="130" cy="130" r={RING_R}
            className="ring-progress"
            style={{
              stroke: meta.color,
              strokeDasharray: RING_C,
              strokeDashoffset: RING_C - dash,
            }}
          />
        </svg>
        <div className="ring-center">
          <div className="time-display">
            {snap.phase === 'flow' ? `+${fmt(snap.flowMs)}` : fmt(running ? snap.remainingMs : snap.config.focusMinutes * 60000)}
          </div>
          {snap.phase === 'flow' && (
            <div className="time-sub">落地后休息 {fmt(snap.nextBreakMs)}</div>
          )}
          {snap.paused && <div className="time-sub">已暂停</div>}
        </div>
      </div>

      <div className="controls">
        {!running && (
          <button className="btn primary" onClick={() => focusEngine.startFocus()}>
            开始专注
          </button>
        )}
        {snap.phase === 'flow' && (
          <button className="btn primary" onClick={() => focusEngine.advance()}>
            落地休息
          </button>
        )}
        {inBreak && (
          <button className="btn" onClick={() => focusEngine.advance()}>
            跳过休息
          </button>
        )}
        {running && !snap.paused && (
          <button className="btn" onClick={() => focusEngine.pause()}>暂停</button>
        )}
        {running && snap.paused && (
          <button className="btn primary" onClick={() => focusEngine.resume()}>继续</button>
        )}
        {running && (
          <button className="btn ghost" onClick={() => focusEngine.abandon()}>放弃本轮</button>
        )}
      </div>

      <footer className="stats-row">
        <div className="stat">
          <span className="stat-value">{snap.today.cycles}</span>
          <span className="stat-label">今日轮次</span>
        </div>
        <div className="stat">
          <span className="stat-value">{fmtHours(snap.today.focusMs)}</span>
          <span className="stat-label">今日专注</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {snap.cycleCount % snap.config.cyclesPerLongBreak}/{snap.config.cyclesPerLongBreak}
          </span>
          <span className="stat-label">距长休息</span>
        </div>
      </footer>
    </section>
  )
}
