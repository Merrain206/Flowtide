/**
 * Flowtide 专注引擎 —— 类型定义
 *
 * 番茄钟被建模为状态机而非固定计时器：
 *   idle → focus → flow(心流柔性延长) → shortBreak/longBreak → idle
 */

/** 专注阶段 */
export type FocusPhase = 'idle' | 'focus' | 'flow' | 'shortBreak' | 'longBreak'

/** 引擎配置 */
export interface FocusConfig {
  /** 单次专注时长（分钟） */
  focusMinutes: number
  /** 短休息基础时长（分钟） */
  shortBreakMinutes: number
  /** 长休息时长（分钟） */
  longBreakMinutes: number
  /** 每几轮专注后进入长休息 */
  cyclesPerLongBreak: number
  /** 心流延长上限（分钟）—— 到点不打断，柔性延长至多这么久 */
  maxFlowMinutes: number
}

export const DEFAULT_CONFIG: FocusConfig = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesPerLongBreak: 4,
  maxFlowMinutes: 15,
}

/** 单次完成的专注记录（本地持久化） */
export interface SessionRecord {
  /** 结束时间戳 */
  endedAt: number
  /** 计划内专注时长 ms */
  focusMs: number
  /** 心流延长时长 ms */
  flowMs: number
}

/** 当日统计 */
export interface TodayStats {
  /** 今日累计专注 ms（含心流延长） */
  focusMs: number
  /** 今日完成轮次 */
  cycles: number
}

/** 引擎对外快照，UI 每个 tick 收到一份 */
export interface FocusSnapshot {
  phase: FocusPhase
  paused: boolean
  /** 当前阶段剩余 ms（flow 阶段 = 距延长上限的剩余） */
  remainingMs: number
  /** 当前阶段总时长 ms */
  totalMs: number
  /** 本次运行已完成的专注轮次 */
  cycleCount: number
  /** 当前心流已延长 ms */
  flowMs: number
  /** 即将到来的休息时长 ms（自适应计算结果） */
  nextBreakMs: number
  today: TodayStats
  config: FocusConfig
}

/** 阶段转换事件，用于触发提示音等副作用 */
export type FocusEvent =
  | { type: 'flowStarted' }      // 专注到点，进入心流保护
  | { type: 'breakStarted' }     // 进入休息
  | { type: 'breakEnded' }       // 休息结束，回到待命
  | { type: 'focusStarted' }     // 开始专注

export type FocusListener = (snapshot: FocusSnapshot) => void
export type FocusEventListener = (event: FocusEvent) => void
