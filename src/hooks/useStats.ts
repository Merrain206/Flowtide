/**
 * 专注复盘看板数据 hook
 *
 * 从 IndexedDB 获取最近 28 天的聚合数据，
 * 提供周趋势、热力图、心流占比、连续天数等统计指标。
 */

import { useEffect, useState } from 'react'
import { getRangeAgg, getSessions } from '../core/storage/db'
import type { DailyAgg } from '../core/focus/types'
import { buildEnergyProfile, type EnergyProfile } from '../core/agent/EnergyModel'

export interface WeeklyStats {
  /** 最近 7 天每日聚合数据 */
  days: DailyAgg[]
  /** 本周总专注 ms（含心流） */
  totalMs: number
  /** 本周心流占比 0..1 */
  flowRatio: number
  /** 连续有专注记录的天数（从今天倒推） */
  streak: number
  /** 最近 28 天热力图数据 */
  heatmap: DailyAgg[]
}

const EMPTY: WeeklyStats = {
  days: [],
  totalMs: 0,
  flowRatio: 0,
  streak: 0,
  heatmap: [],
}

export function useWeeklyStats(): WeeklyStats {
  const [stats, setStats] = useState<WeeklyStats>(EMPTY)

  useEffect(() => {
    let cancelled = false
    void load().then((s) => {
      if (!cancelled) setStats(s)
    })
    return () => { cancelled = true }
  }, [])

  return stats
}

async function load(): Promise<WeeklyStats> {
  try {
    const now = Date.now()
    const dayMs = 86_400_000

    // 最近 28 天
    const from28 = new Date(now - 27 * dayMs).setHours(0, 0, 0, 0)
    const all28 = await getRangeAgg(from28, now)

    // 最近 7 天
    const days7 = all28.slice(-7)

    // 周统计
    let totalFocus = 0
    let totalFlow = 0
    for (const d of days7) {
      totalFocus += d.focusMs
      totalFlow += d.flowMs
    }
    const totalMs = totalFocus + totalFlow
    const flowRatio = totalMs > 0 ? totalFlow / totalMs : 0

    // 连续天数：从今天倒推，找到第一个没有记录的天
    const dateSet = new Set(all28.map((d) => d.date))
    let streak = 0
    for (let i = 0; i < 28; i++) {
      const d = new Date(now - i * dayMs).toDateString()
      if (dateSet.has(d)) streak++
      else break
    }

    // 补齐 7 天空白天（确保 UI 始终显示 7 列）
    const filled7 = fillDays(days7, 7)
    const filled28 = fillDays(all28, 28)

    return {
      days: filled7,
      totalMs,
      flowRatio,
      streak,
      heatmap: filled28,
    }
  } catch {
    return EMPTY
  }
}

/** 补齐缺失的天（用空 DailyAgg 填充） */
function fillDays(data: DailyAgg[], count: number): DailyAgg[] {
  const map = new Map(data.map((d) => [d.date, d]))
  const result: DailyAgg[] = []
  const now = Date.now()
  const dayMs = 86_400_000

  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(now - i * dayMs).toDateString()
    result.push(
      map.get(date) ?? { date, focusMs: 0, flowMs: 0, cycles: 0, flowRatio: 0 },
    )
  }
  return result
}

// ── 精力曲线 hook（v0.4） ──────────────────────────────

const EMPTY_PROFILE: EnergyProfile = {
  peakHours: [],
  troughHours: [],
  avgFocusByHour: new Array(24).fill(0),
  countByHour: new Array(24).fill(0),
  sufficient: false,
}

export function useEnergyProfile(): EnergyProfile {
  const [profile, setProfile] = useState<EnergyProfile>(EMPTY_PROFILE)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const now = Date.now()
        const from30 = now - 30 * 86_400_000
        const sessions = await getSessions(from30, now)
        const p = buildEnergyProfile(sessions)
        if (!cancelled) setProfile(p)
      } catch {
        // 静默失败
      }
    })()
    return () => { cancelled = true }
  }, [])

  return profile
}
