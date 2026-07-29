/**
 * Agent 编排层 —— 类型定义
 *
 * 架构蓝图中的 Sense -> Plan -> Act 三层：
 *   SensorReading  = Sense（从各引擎采集的快照）
 *   Rule           = Plan  （纯函数：reading + prev -> actions）
 *   AgentAction    = Act   （对引擎施加的副作用指令）
 */

import type { FocusPhase } from '../focus/types'

/** 传感器读数 —— 每个 tick 从各引擎采集一次 */
export interface SensorReading {
  /** 专注引擎当前阶段 */
  phase: FocusPhase
  /** 音乐面板的“专注联动”是否开启 */
  duckEnabled: boolean
  /** 声景是否正在播放 */
  soundscapePlaying: boolean
  /** 当前关联的任务（v0.4） */
  currentTask?: { title: string; cognition: 'high' | 'low' }
  /** 当前专注引擎的小时数（精力曲线用） */
  currentHour?: number
  /** 连续未跳过休息的轮次数 */
  consecutiveSessions?: number
}

/** Agent 可执行的原子动作 */
export type AgentAction =
  | { type: 'applyPreset'; name: string }
  | { type: 'setDuck'; ducked: boolean }
  | { type: 'playChime'; style: 'gentle' | 'normal' }
  | { type: 'notify'; title: string; body: string }
  | { type: 'suggest'; message: string }
  | { type: 'scheduleTask'; taskId: number; suggestedHour: number }
  | { type: 'setSoothe'; on: boolean }

/** 一条规则：接收当前 + 上一次读数，返回要执行的动作列表 */
export type Rule = (reading: SensorReading, prev: SensorReading) => AgentAction[]

/** 规则注册条目 */
export interface RuleEntry {
  name: string
  enabled: boolean
  rule: Rule
}
