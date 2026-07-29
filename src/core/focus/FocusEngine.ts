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
import { addSession, getSessions } from '../storage/db'

const MIN = 60_000
const CONFIG_KEY = 'flowtide.config.v1'
const RUNTIME_KEY = 'flowtide.focus.runtime'
/** 超过此时长的残留运行态直接丢弃（隔夜打开不再恢复） */
const RUNTIME_MAX_AGE = 12 * 3600_000

/** 运行态快照（v0.7 会话恢复）：关页/杀后台后重开可续跑或自动结算 */
interface RuntimeState {
  phase: FocusPhase
  phaseStartedAt: number
  phaseTotalMs: number
  paused: boolean
  pausedAt: number
  cycleCount: number
  flowStartedAt: number
  focusStartedAt: number
  nextBreakMs: number
  savedAt: number
}

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

  /** 今日缓存（启动时从 IDB 加载，每次新增 session 同步更新） */
  private todayCache: SessionRecord[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private listeners = new Set<FocusListener>()
  private eventListeners = new Set<FocusEventListener>()
  /** 当前专注轮次开始时间戳（用于写入 SessionRecord.startedAt） */
  private focusStartedAt = 0
  /** 恢复提示（v0.7）：UI 取走一次后清空 */
  private recoveryNotice: string | null = null

  constructor() {
    this.config = loadConfig()
    this.nextBreakMs = this.config.shortBreakMinutes * MIN
    this.restoreRuntime()
    this.initFromDB()
  }

  /** 异步初始化：从 IDB 加载今日数据到缓存 */
  private async initFromDB() {
    try {
      const dayStart = new Date().setHours(0, 0, 0, 0)
      this.todayCache = await getSessions(dayStart, Date.now())
      this.notify()
    } catch {
      // IDB 不可用时降级为空缓存
    }
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

  /** 取走一次恢复提示（TimerPanel 挂载时调用，取后自动清空） */
  consumeRecoveryNotice(): string | null {
    const msg = this.recoveryNotice
    this.recoveryNotice = null
    return msg
  }

  // ── 用户操作 ──────────────────────────────────────────

  /** 开始一轮专注 */
  startFocus() {
    if (this.phase === 'focus' || this.phase === 'flow') return
    this.focusStartedAt = Date.now()
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
      startedAt: this.focusStartedAt,
      endedAt: Date.now(),
      focusMs: this.config.focusMinutes * MIN,
      flowMs,
    }
    // 同步更新今日缓存
    this.todayCache.push(record)
    // 异步写入 IDB
    void addSession(record)

    this.cycleCount += 1
    this.nextBreakMs = this.upcomingBreakMs(flowMs)
    const isLong = this.cycleCount % this.config.cyclesPerLongBreak === 0
    this.enterPhase(isLong ? 'longBreak' : 'shortBreak', this.nextBreakMs)
    this.emit({ type: 'breakStarted', record })
  }

  /**
   * 自适应休息时长：基础休息 + 心流补偿。
   * 心流每延长 5 分钟，休息追加 1 分钟（v0.4 将由精力曲线模型接管）。
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
    let focusMs = 0
    let cycles = 0
    for (const s of this.todayCache) {
      focusMs += s.focusMs + s.flowMs
      cycles += 1
    }
    return { focusMs, cycles }
  }

  private ensureTimer() {
    if (!this.timer) this.timer = setInterval(this.tick, 1000)
  }

  private notify() {
    const snap = this.snapshot()
    this.listeners.forEach((fn) => fn(snap))
    this.persistRuntime()
  }

  private emit(event: FocusEvent) {
    this.eventListeners.forEach((fn) => fn(event))
  }

  // ── 运行态持久化与恢复（v0.7）────────────────────

  /** 每次快照变化时同步写入；回到 idle 即清除 */
  private persistRuntime() {
    try {
      if (this.phase === 'idle') {
        localStorage.removeItem(RUNTIME_KEY)
        return
      }
      const rt: RuntimeState = {
        phase: this.phase,
        phaseStartedAt: this.phaseStartedAt,
        phaseTotalMs: this.phaseTotalMs,
        paused: this.paused,
        pausedAt: this.pausedAt,
        cycleCount: this.cycleCount,
        flowStartedAt: this.flowStartedAt,
        focusStartedAt: this.focusStartedAt,
        nextBreakMs: this.nextBreakMs,
        savedAt: Date.now(),
      }
      localStorage.setItem(RUNTIME_KEY, JSON.stringify(rt))
    } catch { /* 存不了不影响计时 */ }
  }

  /**
   * 启动时检测残留运行态：
   *   未到点 → 无缝续跑；已到点 → 按“到点时刻”正常结算；
   *   超过 12 小时的残留直接丢弃。
   */
  private restoreRuntime() {
    let rt: RuntimeState | null = null
    try {
      const raw = localStorage.getItem(RUNTIME_KEY)
      rt = raw ? (JSON.parse(raw) as RuntimeState) : null
      localStorage.removeItem(RUNTIME_KEY)
    } catch { return }
    if (!rt || rt.phase === 'idle') return

    const now = Date.now()
    const awayMs = now - rt.savedAt
    if (awayMs > RUNTIME_MAX_AGE || awayMs < 0) return

    this.cycleCount = rt.cycleCount
    this.focusStartedAt = rt.focusStartedAt
    this.nextBreakMs = rt.nextBreakMs

    // 暂停中离开：时间本来就冻结，原样恢复
    if (rt.paused) {
      this.phase = rt.phase
      this.phaseStartedAt = rt.phaseStartedAt
      this.phaseTotalMs = rt.phaseTotalMs
      this.paused = true
      this.pausedAt = rt.pausedAt
      this.flowStartedAt = rt.flowStartedAt
      this.ensureTimer()
      this.recoveryNotice = '已恢复暂停中的番茄钟，点继续接着走'
      return
    }

    const elapsed = now - rt.phaseStartedAt

    // 未到点：无缝续跑（基于时间戳计时，离开的时间自然计入）
    if (elapsed < rt.phaseTotalMs) {
      this.phase = rt.phase
      this.phaseStartedAt = rt.phaseStartedAt
      this.phaseTotalMs = rt.phaseTotalMs
      this.flowStartedAt = rt.flowStartedAt
      this.ensureTimer()
      if (awayMs > 10_000) {
        this.recoveryNotice = `已恢复上次进度（离开 ${fmtAway(awayMs)} 已计入）`
      }
      return
    }

    // 已到点：按到点时刻结算
    if (rt.phase === 'focus' || rt.phase === 'flow') {
      // 专注到点时刻；flow 期间离开则按最后在线时刻落地（离开的时间不算心流）
      const focusEndAt = rt.phase === 'focus' ? rt.phaseStartedAt + rt.phaseTotalMs : rt.savedAt
      const flowMs = rt.phase === 'flow' && rt.flowStartedAt ? rt.savedAt - rt.flowStartedAt : 0
      const record: SessionRecord = {
        startedAt: rt.focusStartedAt,
        endedAt: focusEndAt,
        focusMs: rt.phase === 'focus' ? rt.phaseTotalMs : this.config.focusMinutes * MIN,
        flowMs,
      }
      // 写入后刷新今日缓存（initFromDB 会重新拉取，避免双计）
      void addSession(record).then(() => this.initFromDB())

      this.cycleCount += 1
      const isLong = this.cycleCount % this.config.cyclesPerLongBreak === 0
      const breakMs = (isLong ? this.config.longBreakMinutes : this.config.shortBreakMinutes) * MIN
        + Math.round(flowMs / 5)
      const breakElapsed = now - focusEndAt

      if (breakElapsed < breakMs) {
        // 休息进行中
        this.phase = isLong ? 'longBreak' : 'shortBreak'
        this.phaseStartedAt = focusEndAt
        this.phaseTotalMs = breakMs
        this.nextBreakMs = breakMs
        this.ensureTimer()
        this.recoveryNotice = '离开期间专注已到点入账 ✅ 现在是休息时间'
      } else {
        // 休息也过完了 → 回 idle
        this.nextBreakMs = this.config.shortBreakMinutes * MIN
        this.recoveryNotice = '离开时的专注已自动结算入账 ✅'
      }
    } else {
      // 休息到点 → 回 idle
      this.recoveryNotice = '休息已结束，可以开始新一轮专注'
    }
  }
}

/** 离开时长口语化 */
function fmtAway(ms: number): string {
  const min = Math.round(ms / MIN)
  if (min < 1) return '不到 1 分钟'
  if (min < 60) return `${min} 分钟`
  return `${Math.floor(min / 60)} 小时 ${min % 60} 分钟`
}

// ── 本地持久化（config 仍用 localStorage，sessions 已迁移到 IDB）──

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
