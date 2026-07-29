/**
 * 精力曲线模型 —— 按时段聚合历史专注完成率
 *
 * 输入：SessionRecord[]（从 IDB 按 startedAt 查询近 30 天）
 * 输出：EnergyProfile { peakHours, troughHours, avgFocusByHour }
 *
 * 算法：按小时桶聚合 30 天数据，计算每小时的 totalFocusMs / totalSessions，
 *       高于均值 1.2x 的标记为 peak，低于 0.8x 的标记为 trough。
 *
 * 纯计算，无副作用，可被 Agent 和 UI 共用。
 */

import type { SessionRecord } from '../focus/types'

/** 精力画像 */
export interface EnergyProfile {
  /** 高效时段（0-23） */
  peakHours: number[]
  /** 低谷时段（0-23） */
  troughHours: number[]
  /** 每小时平均专注分钟数（长度 24） */
  avgFocusByHour: number[]
  /** 每小时专注记录条数（长度 24） */
  countByHour: number[]
  /** 是否有足够数据（至少 7 天有记录） */
  sufficient: boolean
}

const EMPTY_PROFILE: EnergyProfile = {
  peakHours: [],
  troughHours: [],
  avgFocusByHour: new Array(24).fill(0),
  countByHour: new Array(24).fill(0),
  sufficient: false,
}

/** 从专注记录构建精力画像 */
export function buildEnergyProfile(sessions: SessionRecord[]): EnergyProfile {
  if (sessions.length < 3) return EMPTY_PROFILE

  // 24 小时桶聚合
  const totalMsByHour = new Array<number>(24).fill(0)
  const countByHour = new Array<number>(24).fill(0)

  for (const s of sessions) {
    const hour = new Date(s.startedAt).getHours()
    totalMsByHour[hour] += s.focusMs + s.flowMs
    countByHour[hour] += 1
  }

  // 计算每小时平均专注分钟数
  const avgFocusByHour = totalMsByHour.map((ms, h) =>
    countByHour[h] > 0 ? ms / countByHour[h] / 60000 : 0,
  )

  // 计算有数据小时的均值
  const hoursWithData = avgFocusByHour.filter((v) => v > 0)
  if (hoursWithData.length < 2) return { ...EMPTY_PROFILE, avgFocusByHour, countByHour, sufficient: false }

  const mean = hoursWithData.reduce((a, b) => a + b, 0) / hoursWithData.length

  const peakHours: number[] = []
  const troughHours: number[] = []

  for (let h = 0; h < 24; h++) {
    if (countByHour[h] === 0) continue
    if (avgFocusByHour[h] >= mean * 1.2) peakHours.push(h)
    else if (avgFocusByHour[h] <= mean * 0.8) troughHours.push(h)
  }

  // 至少 7 天有记录才算 sufficient
  const daysWithRecords = new Set(
    sessions.map((s) => new Date(s.startedAt).toDateString()),
  ).size

  return {
    peakHours,
    troughHours,
    avgFocusByHour,
    countByHour,
    sufficient: daysWithRecords >= 7,
  }
}

/** 判断当前小时是否为低谷时段 */
export function isTroughHour(profile: EnergyProfile, hour: number): boolean {
  return profile.troughHours.includes(hour)
}

/** 判断当前小时是否为高峰时段 */
export function isPeakHour(profile: EnergyProfile, hour: number): boolean {
  return profile.peakHours.includes(hour)
}
