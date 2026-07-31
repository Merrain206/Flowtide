/**
 * 目标计划引擎类型定义（v0.7）
 *
 * 核心数据结构（PlanRecord/PlanDay/PlanTask）定义在 storage/db.ts，
 * 这里定义引擎与 LLM 生成器专用的输入输出类型。
 */

export type { PlanRecord, PlanDay, PlanTask } from '../storage/db'

/** 计划生成向导的用户输入 */
export interface GeneratePlanInput {
  /** 目标描述，如 "通过大学英语四级" */
  goal: string
  /** 截止时间戳 */
  deadline: number
  /** 每天可投入分钟数 */
  dailyMinutes: number
  /** 用户自评水平，如 "四级 425 边缘" */
  level: string
}

/**
 * LLM 生成的阶段模板 —— 按阶段而非按天返回，
 * 100+ 天的备考计划也只需几百 token；本地再展开成 PlanDay[]。
 */
export interface PlanPhase {
  /** 阶段名，如 "第一阶段·词汇打底" */
  name: string
  /** 该阶段持续天数 */
  days: number
  /** 阶段内每天要做的任务模板 */
  daily: {
    title: string
    cognition: 'high' | 'low'
    pomodoros: number
  }[]
}

/** 计划进度统计（供 PlanCard 展示） */
export interface PlanProgress {
  totalDays: number
  dispatchedDays: number
  totalTasks: number
  doneTasks: number
  /** 0-1 完成率 */
  ratio: number
}

/** 引擎快照 */
export interface PlanSnapshot {
  plans: import('../storage/db').PlanRecord[]
  /** 当前活跃计划（同一时间最多一个） */
  activePlan: import('../storage/db').PlanRecord | null
}

/**
 * 跨天承接提示（v0.9.5）——
 * 新的一天到来、但昨天派发过的阶段还没做完时，先询问用户如何安排，
 * 而不是直接把今天的任务叠加进队列。
 */
export interface DayHandoff {
  /** 上一段已派发阶段名 */
  prevPhase: string
  /** 今天原定阶段名 */
  todayPhase: string
  /** 该计划在队列里未完成的任务数 */
  pendingCount: number
  /** 未完成任务标题（最多取前几条用于展示） */
  pendingTitles: string[]
}
