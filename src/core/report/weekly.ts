/**
 * AI 每周复盘（v0.7 模块四，v0.8 升级）—— 近 7 天数据聚合 + LLM 叙事
 *
 * 聚合总专注时长、轮次、心流占比、精力时段与计划完成率，
 * v0.8 增加上周环比趋势与任务分布，交给 LLM 生成趋势洞察 + 下周建议
 * （Mock 降级为模板句填数据）。
 * 结果按周缓存到 localStorage，同一周不重复调用。
 */

import { getSessions } from '../storage/db'
import { buildEnergyProfile } from '../agent/EnergyModel'
import { energyCache } from '../agent/RulesEngine'
import { getAPIKey, getProvider } from '../agent/LLMAdapter'
import { planEngine, taskEngine } from '../../hooks/useEngines'

const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions'
const DEEPSEEK_MODEL = 'deepseek-v4-flash'
const CACHE_KEY = 'flowtide.weekly.report'

export interface WeeklyStats {
  /** 近 7 天总专注时长（含心流）ms */
  focusMs: number
  /** 专注轮次 */
  cycles: number
  /** 心流占比 0-1 */
  flowRatio: number
  /** 高效时段（0-23，可能为空） */
  peakHours: number[]
  /** 活跃计划完成率 0-1，无计划为 null */
  planRatio: number | null
  /** 活跃计划目标名 */
  planGoal: string | null
  /** 上一个 7 天的总专注时长 ms（v0.8 环比趋势） */
  prevFocusMs: number
  /** 上一个 7 天的专注轮次 */
  prevCycles: number
  /** 任务队列：已完成数 */
  taskDone: number
  /** 任务队列：待办数 */
  taskPending: number
  /** 已完成任务中高认知数 */
  taskHighDone: number
}

export interface WeeklyReport {
  /** 周键（本周一的 YYYY-MM-DD），同周命中缓存 */
  weekKey: string
  narrative: string
  stats: WeeklyStats
  generatedAt: number
}

/** 本周一的日期键，作为周缓存键 */
export function currentWeekKey(): string {
  const d = new Date()
  const offset = (d.getDay() + 6) % 7 // 周一 = 0
  d.setDate(d.getDate() - offset)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** 读取本周缓存的周报（跨周自动失效） */
export function getCachedWeeklyReport(): WeeklyReport | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const report = JSON.parse(raw) as WeeklyReport
    if (report.weekKey !== currentWeekKey()) return null
    return report
  } catch {
    return null
  }
}

/** 聚合近 7 天数据（含上周环比与任务分布，v0.8） */
export async function aggregateWeek(): Promise<WeeklyStats> {
  const now = Date.now()
  const sessions = await getSessions(now - 7 * 86_400_000, now).catch(() => [])
  const prevSessions = await getSessions(now - 14 * 86_400_000, now - 7 * 86_400_000).catch(() => [])

  let focusMs = 0
  let flowMs = 0
  for (const s of sessions) {
    focusMs += s.focusMs + s.flowMs
    flowMs += s.flowMs
  }
  let prevFocusMs = 0
  for (const s of prevSessions) prevFocusMs += s.focusMs + s.flowMs

  // 任务分布：当前队列的完成/待办与高认知占比
  const tasks = taskEngine.snapshot().tasks
  const doneTasks = tasks.filter((t) => t.done)

  // 精力画像优先用 RulesEngine 的 30 天缓存，未就绪则用本周数据现算
  const profile = energyCache ?? buildEnergyProfile(sessions)
  const active = planEngine.snapshot().activePlan
  const planRatio = active ? planEngine.getProgress(active.id!).ratio : null

  return {
    focusMs,
    cycles: sessions.length,
    flowRatio: focusMs > 0 ? flowMs / focusMs : 0,
    peakHours: profile.sufficient ? profile.peakHours : [],
    planRatio,
    planGoal: active?.goal ?? null,
    prevFocusMs,
    prevCycles: prevSessions.length,
    taskDone: doneTasks.length,
    taskPending: tasks.length - doneTasks.length,
    taskHighDone: doneTasks.filter((t) => t.cognition === 'high').length,
  }
}

const WEEKLY_SYSTEM = `你是专注力教练。根据用户过去 7 天的专注数据（含与上周的对比），写一段中文复盘叙事。
要求：180 字以内，第二人称，先点出趋势（较上周提升/回落/持平），再肯定一个亮点、指出一个可改进点，
最后给一句下周的具体建议。语气温和克制，不要用感叹号堆砌，不要列条目，只返回叙事正文。`

/** 生成本周复盘叙事（LLM 或 Mock 降级），成功后写入周缓存 */
export async function generateWeeklyReport(): Promise<WeeklyReport> {
  const stats = await aggregateWeek()

  let narrative: string
  if (getProvider() === 'mock' || !getAPIKey()) {
    narrative = mockNarrative(stats)
  } else {
    narrative = await llmNarrative(stats)
  }

  const report: WeeklyReport = {
    weekKey: currentWeekKey(),
    narrative,
    stats,
    generatedAt: Date.now(),
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(report))
  } catch {
    // localStorage 满时忽略缓存失败
  }
  return report
}

async function llmNarrative(stats: WeeklyStats): Promise<string> {
  const userMsg = [
    `总专注时长：${fmtHM(stats.focusMs)}（上周：${fmtHM(stats.prevFocusMs)}）`,
    `专注轮次：${stats.cycles} 轮（上周：${stats.prevCycles} 轮）`,
    `心流占比：${Math.round(stats.flowRatio * 100)}%`,
    `高效时段：${stats.peakHours.length > 0 ? stats.peakHours.map((h) => `${h}点`).join('、') : '数据不足'}`,
    `任务分布：已完成 ${stats.taskDone} 项（其中高认知 ${stats.taskHighDone} 项），待办 ${stats.taskPending} 项`,
    stats.planGoal
      ? `目标计划「${stats.planGoal}」完成率：${Math.round((stats.planRatio ?? 0) * 100)}%`
      : '当前没有进行中的目标计划',
  ].join('\n')

  const res = await fetch(DEEPSEEK_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAPIKey()}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: WEEKLY_SYSTEM },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.6,
      max_tokens: 400,
      stream: false,
    }),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const content: string = data.choices?.[0]?.message?.content?.trim() ?? ''
  if (!content) throw new Error('AI 返回内容为空，请重试')
  return content.slice(0, 240)
}

/** Mock 降级：模板句填数据，保证离线可用 */
function mockNarrative(stats: WeeklyStats): string {
  if (stats.cycles === 0) {
    return '这一周还没有专注记录。万事开头难，下周先从每天一轮 25 分钟开始，让节奏慢慢建立起来。'
  }
  const parts = [
    `这一周你完成了 ${stats.cycles} 轮专注，累计 ${fmtHM(stats.focusMs)}。`,
  ]
  // 环比趋势（v0.8）：上周有数据才比
  if (stats.prevFocusMs > 0) {
    const delta = (stats.focusMs - stats.prevFocusMs) / stats.prevFocusMs
    if (delta >= 0.15) parts.push(`比上周多了约 ${Math.round(delta * 100)}%，节奏在往上走。`)
    else if (delta <= -0.15) parts.push(`比上周少了约 ${Math.round(-delta * 100)}%，偶尔回落很正常，不必苛责自己。`)
    else parts.push('和上周基本持平，稳定本身就是积累。')
  }
  parts.push(
    stats.flowRatio >= 0.15
      ? `心流占比达到 ${Math.round(stats.flowRatio * 100)}%，说明你经常进入深度状态，值得保持。`
      : `心流占比 ${Math.round(stats.flowRatio * 100)}%，试着在到点后多停留一会儿，深度会自然生长。`,
  )
  if (stats.taskDone > 0) {
    parts.push(`任务上完成了 ${stats.taskDone} 项（高认知 ${stats.taskHighDone} 项），还有 ${stats.taskPending} 项待办。`)
  }
  if (stats.peakHours.length > 0) {
    parts.push(`你的高效时段集中在 ${stats.peakHours.map((h) => `${h}点`).join('、')}，下周把最难的任务安排在这些时间。`)
  }
  if (stats.planGoal && stats.planRatio !== null) {
    parts.push(`目标「${stats.planGoal}」完成率 ${Math.round(stats.planRatio * 100)}%，${stats.planRatio >= 0.7 ? '进度稳健，继续推进。' : '略有落后，可以考虑让 AI 重排一下节奏。'}`)
  }
  return parts.join('')
}

function fmtHM(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} 分钟`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`
}
