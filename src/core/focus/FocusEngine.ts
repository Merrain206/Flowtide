/**
 * Flowtide 专注引擎 —— 自适应番茄钟状态机
 *
 * 设计原则：
 * 1. 纯 TS、零框架依赖，未来可原样迁入 Tauri / Worker；
 * 2. 心流保护：专注到点后不强制打断，进入 flow 阶段柔性延长，
 *    由用户主动"落地休息"，或到达延长上限后自动进入休息；
 * 3. 自适应休息：休息时长 = 基础休息 + 心流延长的补偿（延长越久休息越长）；
 * 4. 基于时间戳而非 setInterval 计数，切后台/休眠后依然准确。
 */

import type {
  FocusConfig,
  FocusEvent,
  FocusEventListener,
  FocusListener,
  FocusPhase,
  FocusSnapshot,
  SessionRecord,
  TodayStats,
} from './types'
import { DEFAULT_CONFIG } from './types'

const MIN = 60_000
const STORAGE_KEY = 'flowtide.sessions.v1'
const CONFIG_KEY = 'flowtide.config.v1'

export class FocusEngine {
  private config: FocusConfig
  private phase: FocusPhase = 'idle'
  private paused = false
  /** 当前阶段开始时间戳 */
  private phaseStartedAt = 0
  /** 当前阶段总时长 ms */
  private phaseTotalMs = 0
  /** 暂停时累计的偏移 */
  private pausedAt = 0
  private cycleCount = 0
  /** 本轮进入 flow 的时间戳（0 = 未进入） */
  private flowStartedAt = 0
  /** 本轮锁定的休息时长（进入休息时计算） */
  private nextBreakMs = 0

  private sessions: SessionRecord[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private listeners = new Set<FocusListener>()
  private eventListeners = new Set<FocusEventListener>()

  constructor() {
    this.config = loadConfig()
    this.sessions = loadSessions()
    this.nextBreakMs = this.config.shortBreakMinutes * MIN
  }

  // ── 订阅 ──────────────────────────────────────────────

  subscribe(fn: FocusListener): () => void {
    this.listeners.add(fn)
    fn(this.snapshot())
    return () => this.listeners.delete(fn)
  }

  onEvent(fn: FocusEventListener): () => void {
    this.eventListeners.add(fn)
    return () => this.eventListeners.delete(fn)
  }

  // ── 用户操作 ──────────────────────────────────────────

  /** 开始一轮专注 */
  startFocus() {
    if (this.phase === 'focus' || this.phase === 'flow') return
    this.enterPhase('focus', this.config.focusMinutes * MIN)
    this.emit({ type: 'focusStarted' })
  }

  /** flow 阶段用户主动落地，或休息阶段跳过 */
  advance() {
    if (this.phase === 'flow') {
      this.finishFocusAndRest()
    } else if (this.phase === 'shortBreak' || this.phase === 'longBreak') {
      this.enterIdle()
      this.emit({ type: 'breakEnded' })
    }
  }

  pause() {
    if (this.paused || this.phase === 'idle') return
    this.paused = true
    this.pausedAt = Date.now()
    this.notify()
  }

  resume() {
    if (!this.paused) return
    const pausedMs = Date.now() - this.pausedAt
    this.phaseStartedAt += pausedMs
    if (this.flowStartedAt) this.flowStartedAt += pausedMs
    this.paused = false
    this.notify()
  }

  /** 放弃当前轮（不计入统计） */
  abandon() {
    this.enterIdle()
  }

  updateConfig(patch: Partial<FocusConfig>) {
    this.config = { ...this.config, ...patch }
    saveConfig(this.config)
    if (this.phase === 'idle') this.nextBreakMs = this.config.shortBreakMinutes * MIN
    this.notify()
  }

  // ── 内部状态机 ────────────────────────────────────────

  private enterPhase(phase: FocusPhase, totalMs: number) {
    this.phase = phase
    this.phaseStartedAt = Date.now()
    this.phaseTotalMs = totalMs
    this.paused = false
    if (phase !== 'flow') this.flowStartedAt = 0
    this.ensureTimer()
    this.notify()
  }

  private enterIdle() {
    this.phase = 'idle'
    this.paused = false
    this.flowStartedAt = 0
    this.nextBreakMs = this.upcomingBreakMs(0)
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.notify()
  }

  /** 每秒 tick：检查阶段是否到点 */
  private tick = () => {
    if (this.paused || this.phase === 'idle') return
    const elapsed = Date.now() - this.phaseStartedAt
    if (elapsed < this.phaseTotalMs) {
      this.notify()
      return
    }
    // 阶段到点
    if (this.phase === 'focus') {
      // 心流保护：不打断，柔性延长
      this.enterPhase('flow', this.config.maxFlowMinutes * MIN)
      this.flowStartedAt = this.phaseStartedAt
      this.emit({ type: 'flowStarted' })
    } else if (this.phase === 'flow') {
      // 达到延长上限，自动落地休息
      this.finishFocusAndRest()
    } else {
      // 休息结束
      this.enterIdle()
      this.emit({ type: 'breakEnded' })
    }
  }

  /** 结算本轮专注 → 进入自适应休息 */
  private finishFocusAndRest() {
    const flowMs = this.flowStartedAt ? Date.now() - this.flowStartedAt : 0
    const record: SessionRecord = {
      endedAt: Date.now(),
      focusMs: this.config.focusMinutes * MIN,
      flowMs,
    }
    this.sessions.push(record)
    saveSessions(this.sessions)

    this.cycleCount += 1
    this.nextBreakMs = this.upcomingBreakMs(flowMs)
    const isLong = this.cycleCount % this.config.cyclesPerLongBreak === 0
    this.enterPhase(isLong ? 'longBreak' : 'shortBreak', this.nextBreakMs)
    this.emit({ type: 'breakStarted' })
  }

  /**
   * 自适应休息时长：基础休息 + 心流补偿。
   * 心流每延长 5 分钟，休息追加 1 分钟（v0.2 将由精力曲线模型接管）。
   */
  private upcomingBreakMs(flowMs: number): number {
    const isLong = (this.cycleCount + (this.phase === 'flow' ? 1 : 0)) %
      this.config.cyclesPerLongBreak === 0 && this.cycleCount > 0
    const base = (isLong ? this.config.longBreakMinutes : this.config.shortBreakMinutes) * MIN
    return base + Math.round(flowMs / 5)
  }

  // ── 快照与通知 ────────────────────────────────────────

  snapshot(): FocusSnapshot {
    const elapsed = this.phase === 'idle'
      ? 0
      : (this.paused ? this.pausedAt : Date.now()) - this.phaseStartedAt
    const flowMs = this.phase === 'flow' && this.flowStartedAt
      ? (this.paused ? this.pausedAt : Date.now()) - this.flowStartedAt
      : 0
    return {
      phase: this.phase,
      paused: this.paused,
      remainingMs: Math.max(0, this.phaseTotalMs - elapsed),
      totalMs: this.phaseTotalMs,
      cycleCount: this.cycleCount,
      flowMs,
      nextBreakMs: this.phase === 'flow' ? this.upcomingBreakMs(flowMs) : this.nextBreakMs,
      today: this.todayStats(),
      config: this.config,
    }
  }

  private todayStats(): TodayStats {
    const dayStart = new Date().setHours(0, 0, 0, 0)
    let focusMs = 0
    let cycles = 0
    for (const s of this.sessions) {
      if (s.endedAt >= dayStart) {
        focusMs += s.focusMs + s.flowMs
        cycles += 1
      }
    }
    return { focusMs, cycles }
  }

  private ensureTimer() {
    if (!this.timer) this.timer = setInterval(this.tick, 1000)
  }

  private notify() {
    const snap = this.snapshot()
    this.listeners.forEach((fn) => fn(snap))
  }

  private emit(event: FocusEvent) {
    this.eventListeners.forEach((fn) => fn(event))
  }
}

// ── 本地持久化（local-first：数据只存本地） ──────────────

function loadSessions(): SessionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SessionRecord[]) : []
  } catch {
    return []
  }
}

function saveSessions(sessions: SessionRecord[]) {
  // 只保留最近 30 天，避免无限增长
  const cutoff = Date.now() - 30 * 24 * 60 * MIN
  const trimmed = sessions.filter((s) => s.endedAt >= cutoff)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
}

function loadConfig(): FocusConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    return raw ? { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<FocusConfig>) } : DEFAULT_CONFIG
  } catch {
    return DEFAULT_CONFIG
  }
}

function saveConfig(config: FocusConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}
