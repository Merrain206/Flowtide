/**
 * 智能日计划推荐（v0.8 模块三）
 *
 * 基于 28 天精力曲线 + 当日任务清单，推荐「几点开始、排几轮、
 * 什么任务放高能时段」，一键应用到专注配置与任务排序。
 * DeepSeek + Mock 双轨：无历史数据时 Mock 给通用模板。
 * 结果按天缓存到 localStorage，同一天不重复调用。
 */

import { getSessions } from '../storage/db'
import { buildEnergyProfile, type EnergyProfile } from '../agent/EnergyModel'
import { getAPIKey, getProvider } from '../agent/LLMAdapter'
import { focusEngine, taskEngine } from '../../hooks/useEngines'
import { todayKey } from './plan-llm'

const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions'
const DEEPSEEK_MODEL = 'deepseek-v4-flash'
const CACHE_KEY = 'flowtide.dayplan'

/** 一条时段安排：把某个任务放到某个钟点 */
export interface DayPlanSlot {
  /** 起始钟点 0-23 */
  hour: number
  /** 任务标题（对应任务队列中的待办） */
  taskTitle: string
}

export interface DayPlan {
  /** 生成日期键，跨天自动失效 */
  dateKey: string
  /** 建议开始钟点 */
  startHour: number
  /** 建议轮数 */
  rounds: number
  /** 建议单轮专注分钟数 */
  focusMinutes: number
  /** 任务-时段安排（按时间升序） */
  slots: DayPlanSlot[]
  /** 一句话建议 */
  advice: string
  generatedAt: number
}

/** 读取今天缓存的日计划（跨天自动失效） */
export function getCachedDayPlan(): DayPlan | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const plan = JSON.parse(raw) as DayPlan
    if (plan.dateKey !== todayKey()) return null
    return plan
  } catch {
    return null
  }
}

const DAYPLAN_SYSTEM = `你是专注力教练。根据用户的精力画像（按小时的历史专注表现）和今天的任务清单，
推荐今天的专注安排。以 JSON 对象返回：
{
  "startHour": 9,
  "rounds": 4,
  "focusMinutes": 25,
  "slots": [ { "hour": 9, "taskTitle": "任务清单中的原始标题" } ],
  "advice": "一句话建议（30字以内）"
}
硬性要求：
1. startHour 取当前时间之后最近的合适钟点（不早于当前小时）
2. 高认知任务安排在高效时段，低认知任务放低谷或普通时段
3. slots 的 taskTitle 必须原样使用任务清单中的标题，数量不超过任务数
4. rounds 与任务总番茄数匹配，不超过 10；focusMinutes 在 15-60 之间
只返回 JSON，不要任何解释文字。`

/** 生成今日计划（LLM 或 Mock 降级），成功后写入当天缓存 */
export async function generateDayPlan(): Promise<DayPlan> {
  const now = Date.now()
  const sessions = await getSessions(now - 28 * 86_400_000, now).catch(() => [])
  const profile = buildEnergyProfile(sessions)
  const pending = taskEngine.snapshot().tasks.filter((t) => !t.done)

  let plan: DayPlan
  if (getProvider() === 'mock' || !profile.sufficient || !getAPIKey()) {
    plan = mockDayPlan(profile, pending)
  } else {
    plan = await llmDayPlan(profile, pending)
  }

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(plan))
  } catch {
    // localStorage 满时忽略缓存失败
  }
  return plan
}

/**
 * 一键应用：单轮时长写入专注配置，任务队列按时段安排重排
 * （安排中的任务提前，未提及的保持原相对顺序垫后）
 */
export async function applyDayPlan(plan: DayPlan): Promise<void> {
  focusEngine.updateConfig({ focusMinutes: plan.focusMinutes })

  const { tasks } = taskEngine.snapshot()
  const pending = tasks.filter((t) => !t.done)
  const ordered: number[] = []
  for (const slot of plan.slots) {
    const hit = pending.find((t) => t.title === slot.taskTitle && !ordered.includes(t.id!))
    if (hit) ordered.push(hit.id!)
  }
  for (const t of pending) {
    if (!ordered.includes(t.id!)) ordered.push(t.id!)
  }
  // 已完成的排在最后，保持展示区顺序不乱
  for (const t of tasks) {
    if (t.done) ordered.push(t.id!)
  }
  await taskEngine.reorderTasks(ordered)
}

// ── LLM 分支 ────────────────────────────────────────────────

interface TaskLike { title: string; cognition: 'high' | 'low'; pomodoros: number }

async function llmDayPlan(profile: EnergyProfile, pending: TaskLike[]): Promise<DayPlan> {
  const hourLines = profile.avgFocusByHour
    .map((min, h) => (profile.countByHour[h] > 0 ? `${h}点：平均 ${Math.round(min)} 分钟` : null))
    .filter(Boolean)
    .join('；')
  const userMsg = [
    `当前时间：${new Date().getHours()} 点`,
    `高效时段：${profile.peakHours.length > 0 ? profile.peakHours.map((h) => `${h}点`).join('、') : '无'}`,
    `低谷时段：${profile.troughHours.length > 0 ? profile.troughHours.map((h) => `${h}点`).join('、') : '无'}`,
    `各时段表现：${hourLines || '无'}`,
    `今日待办：${pending.length > 0
      ? pending.map((t) => `「${t.title}」（${t.cognition === 'high' ? '高认知' : '低认知'}，${t.pomodoros} 番茄）`).join('、')
      : '无（给出通用节奏建议即可）'}`,
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
        { role: 'system', content: DAYPLAN_SYSTEM },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.4,
      max_tokens: 600,
      stream: false,
    }),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const content: string = data.choices?.[0]?.message?.content ?? '{}'
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI 返回格式异常，请重试')

  const raw = JSON.parse(jsonMatch[0]) as Partial<DayPlan>
  return normalizeDayPlan(raw, pending)
}

/** 校正 LLM 输出到合法范围 */
function normalizeDayPlan(raw: Partial<DayPlan>, pending: TaskLike[]): DayPlan {
  const nowHour = new Date().getHours()
  const startHour = clamp(Math.round(raw.startHour ?? nowHour + 1), nowHour, 23)
  const titles = new Set(pending.map((t) => t.title))
  const slots = (Array.isArray(raw.slots) ? raw.slots : [])
    .filter((s) => s && typeof s.taskTitle === 'string' && titles.has(s.taskTitle))
    .map((s) => ({ hour: clamp(Math.round(s.hour) || startHour, 0, 23), taskTitle: s.taskTitle }))
    .sort((a, b) => a.hour - b.hour)
    .slice(0, 8)

  return {
    dateKey: todayKey(),
    startHour,
    rounds: clamp(Math.round(raw.rounds ?? 4) || 4, 1, 10),
    focusMinutes: clamp(Math.round(raw.focusMinutes ?? 25) || 25, 15, 60),
    slots,
    advice: String(raw.advice ?? '').slice(0, 60) || '按自己的节奏来，完成比完美重要。',
    generatedAt: Date.now(),
  }
}

// ── Mock 分支（无历史数据 / 离线）───────────────────────────

function mockDayPlan(profile: EnergyProfile, pending: TaskLike[]): DayPlan {
  const nowHour = new Date().getHours()
  // 优先取当前之后最近的高峰时段，否则下一个整点
  const nextPeak = profile.peakHours.find((h) => h >= nowHour)
  const startHour = clamp(nextPeak ?? nowHour + 1, nowHour, 22)

  const totalPomos = pending.reduce((s, t) => s + t.pomodoros, 0)
  const rounds = clamp(totalPomos || 4, 2, 8)

  // 高认知任务排前（对应高能起点），低认知垫后
  const sorted = [...pending].sort((a, b) => (a.cognition === b.cognition ? 0 : a.cognition === 'high' ? -1 : 1))
  let cursor = startHour
  const slots: DayPlanSlot[] = sorted.slice(0, 6).map((t) => {
    const slot = { hour: Math.min(cursor, 23), taskTitle: t.title }
    cursor += Math.max(1, Math.ceil(t.pomodoros / 2))
    return slot
  })

  const advice = profile.sufficient
    ? `${startHour}点是你的状态好时段，先啃最难的任务。`
    : '还没积累够精力数据，先按常规节奏跑，一周后推荐会更准。'

  return {
    dateKey: todayKey(),
    startHour,
    rounds,
    focusMinutes: 25,
    slots,
    advice,
    generatedAt: Date.now(),
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}
