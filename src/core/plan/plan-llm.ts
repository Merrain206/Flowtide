/**
 * 计划生成器（v0.7）—— 目标 → 分阶段学习计划
 *
 * 复用 ScheduleExtractor 的 LLM 调用模式（DeepSeek + Mock 降级）。
 * LLM 只返回阶段模板（几百 token），本地 expandPhases 展开成逐日计划，
 * 这样 100+ 天的备考计划也不会超 token。
 */

import { getAPIKey, getProvider } from '../agent/LLMAdapter'
import type { GeneratePlanInput, PlanPhase, PlanDay } from './types'

const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions'
const DEEPSEEK_MODEL = 'deepseek-v4-flash'

const PLAN_SYSTEM = `你是学习规划专家。用户会给你一个目标、截止日期、每日可投入时间和当前水平。
请把备考/学习过程划分为 2-4 个阶段，以 JSON 数组返回：
[
  {
    "name": "第一阶段·词汇打底",
    "days": 21,
    "daily": [
      { "title": "任务名（15字以内）", "cognition": "high 或 low", "pomodoros": 1-4 }
    ]
  }
]
硬性要求：
1. 所有阶段 days 之和必须恰好等于用户给出的剩余天数
2. 每个阶段 daily 含 2-4 个任务，全部任务的 pomodoros × 25 分钟总和不超过用户每日可投入时间
3. 高认知任务（学习/真题/写作）标 high，机械任务（背单词/听力磨耳朵）可标 low
4. 阶段命名格式："第N阶段·主题"
只返回 JSON，不要任何解释文字。`

/** 生成阶段模板（LLM 或 Mock 降级） */
export async function generatePlanPhases(input: GeneratePlanInput): Promise<PlanPhase[]> {
  const remainingDays = daysUntil(input.deadline)
  if (remainingDays < 1) throw new Error('截止日期需要晚于今天')

  if (getProvider() === 'mock' || !getAPIKey()) {
    return mockPhases(input, remainingDays)
  }

  const userMsg = [
    `目标：${input.goal}`,
    `剩余天数：${remainingDays} 天（今天算第 1 天）`,
    `每日可投入：${input.dailyMinutes} 分钟`,
    `当前水平：${input.level || '未说明'}`,
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
        { role: 'system', content: PLAN_SYSTEM },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.4,
      max_tokens: 1200,
      stream: false,
    }),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const content: string = data.choices?.[0]?.message?.content ?? '[]'
  const jsonMatch = content.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error('AI 返回格式异常，请重试')

  const phases = JSON.parse(jsonMatch[0]) as PlanPhase[]
  return normalizePhases(phases, remainingDays)
}

const REBALANCE_SYSTEM = `你是学习规划专家。用户执行原计划时出现了积压，需要你重排剩余计划。
请把剩余天数重新划分为 2-4 个阶段，以 JSON 数组返回（格式同下例）：
[
  {
    "name": "第一阶段·节奏回调",
    "days": 5,
    "daily": [
      { "title": "任务名（15字以内）", "cognition": "high 或 low", "pomodoros": 1-4 }
    ]
  }
]
硬性要求：
1. 所有阶段 days 之和必须恰好等于剩余天数
2. 每个阶段 daily 含 2-4 个任务，全部任务的 pomodoros × 25 分钟总和不超过每日可投入时间
3. 优先把积压任务的内容消化进前面的阶段，节奏适当放缓，避免再次积压
4. 阶段命名格式："第N阶段·主题"
只返回 JSON，不要任何解释文字。`

/** 重排剩余计划（模块三）：把积压与完成率交给 LLM，生成明天起的新阶段模板 */
export async function rebalancePlanPhases(ctx: {
  goal: string
  level: string
  dailyMinutes: number
  remainingDays: number
  backlogTitles: string[]
  doneRatio: number
}): Promise<PlanPhase[]> {
  if (ctx.remainingDays < 1) throw new Error('计划已接近尾声，不需要重排了')

  if (getProvider() === 'mock' || !getAPIKey()) {
    return mockRebalancePhases(ctx)
  }

  const userMsg = [
    `目标：${ctx.goal}`,
    `当前水平：${ctx.level || '未说明'}`,
    `剩余天数：${ctx.remainingDays} 天（从明天算起）`,
    `每日可投入：${ctx.dailyMinutes} 分钟`,
    `目前完成率：${Math.round(ctx.doneRatio * 100)}%`,
    `积压未完成的任务：${ctx.backlogTitles.length > 0 ? ctx.backlogTitles.slice(0, 12).join('、') : '无'}`,
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
        { role: 'system', content: REBALANCE_SYSTEM },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.4,
      max_tokens: 1200,
      stream: false,
    }),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const content: string = data.choices?.[0]?.message?.content ?? '[]'
  const jsonMatch = content.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error('AI 返回格式异常，请重试')

  const phases = JSON.parse(jsonMatch[0]) as PlanPhase[]
  return normalizePhases(phases, ctx.remainingDays)
}

/** 把阶段模板展开成逐日计划（从今天开始逐天铺开） */
export function expandPhases(phases: PlanPhase[]): PlanDay[] {
  const days: PlanDay[] = []
  const cursor = new Date()
  for (const phase of phases) {
    for (let i = 0; i < phase.days; i++) {
      days.push({
        date: toDateKey(cursor),
        phase: phase.name,
        tasks: phase.daily.map((t) => ({
          title: t.title,
          cognition: t.cognition === 'low' ? 'low' : 'high',
          pomodoros: clamp(t.pomodoros, 1, 8),
        })),
        dispatched: false,
      })
      cursor.setDate(cursor.getDate() + 1)
    }
  }
  return days
}

/** 今天的日期键（本地时区 YYYY-MM-DD） */
export function todayKey(): string {
  return toDateKey(new Date())
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function daysUntil(deadline: number): number {
  const today = new Date().setHours(0, 0, 0, 0)
  const end = new Date(deadline).setHours(0, 0, 0, 0)
  return Math.round((end - today) / 86_400_000) + 1  // 含今天与截止日当天
}

/** 校正 LLM 输出：天数总和对齐剩余天数，字段裁剪到合法范围 */
function normalizePhases(phases: PlanPhase[], remainingDays: number): PlanPhase[] {
  const valid = phases
    .filter((p) => p && typeof p.name === 'string' && Array.isArray(p.daily) && p.daily.length > 0)
    .map((p) => ({
      name: p.name.slice(0, 30),
      days: Math.max(1, Math.round(p.days) || 1),
      daily: p.daily.slice(0, 4).map((t) => ({
        title: String(t.title ?? '').slice(0, 20) || '学习任务',
        cognition: (t.cognition === 'low' ? 'low' : 'high') as 'high' | 'low',
        pomodoros: clamp(Math.round(t.pomodoros) || 1, 1, 8),
      })),
    }))
  if (valid.length === 0) throw new Error('AI 返回内容无法解析，请重试')

  // 天数不齐时按比例缩放，误差补到最后一个阶段
  const total = valid.reduce((s, p) => s + p.days, 0)
  if (total !== remainingDays) {
    let used = 0
    for (let i = 0; i < valid.length; i++) {
      if (i === valid.length - 1) {
        valid[i].days = Math.max(1, remainingDays - used)
      } else {
        valid[i].days = Math.max(1, Math.round((valid[i].days / total) * remainingDays))
        used += valid[i].days
      }
    }
  }
  return valid
}

/** Mock 降级：按剩余天数三段式均分的通用模板 */
function mockPhases(input: GeneratePlanInput, remainingDays: number): PlanPhase[] {
  const goal = input.goal.slice(0, 8) || '目标'
  const perDayPomos = Math.max(2, Math.min(6, Math.floor(input.dailyMinutes / 25)))
  const base = Math.max(1, Math.round(remainingDays * 0.4))
  const boost = Math.max(1, Math.round(remainingDays * 0.4))
  const sprint = Math.max(1, remainingDays - base - boost)

  return [
    {
      name: '第一阶段·基础打底',
      days: base,
      daily: [
        { title: `${goal}·基础知识学习`, cognition: 'high', pomodoros: Math.ceil(perDayPomos / 2) },
        { title: `${goal}·记忆巩固练习`, cognition: 'low', pomodoros: Math.floor(perDayPomos / 2) || 1 },
      ],
    },
    {
      name: '第二阶段·强化训练',
      days: boost,
      daily: [
        { title: `${goal}·专项强化练习`, cognition: 'high', pomodoros: Math.ceil(perDayPomos / 2) },
        { title: `${goal}·错题复盘整理`, cognition: 'low', pomodoros: Math.floor(perDayPomos / 2) || 1 },
      ],
    },
    {
      name: '第三阶段·冲刺模拟',
      days: sprint,
      daily: [
        { title: `${goal}·全真模拟演练`, cognition: 'high', pomodoros: Math.ceil(perDayPomos / 2) },
        { title: `${goal}·薄弱点查漏补缺`, cognition: 'high', pomodoros: Math.floor(perDayPomos / 2) || 1 },
      ],
    },
  ]
}

/** Mock 降级重排：先用一段"节奏回调"消化积压，剩余天数继续推进 */
function mockRebalancePhases(ctx: {
  goal: string
  dailyMinutes: number
  remainingDays: number
  backlogTitles: string[]
}): PlanPhase[] {
  const goal = ctx.goal.slice(0, 8) || '目标'
  const perDayPomos = Math.max(2, Math.min(6, Math.floor(ctx.dailyMinutes / 25)))
  // 回调期长度：积压越多回调越长，但不超过剩余天数的一半
  const recover = Math.min(
    Math.max(1, Math.ceil(ctx.backlogTitles.length / 2)),
    Math.max(1, Math.floor(ctx.remainingDays / 2)),
  )
  const rest = ctx.remainingDays - recover

  const phases: PlanPhase[] = [
    {
      name: '第一阶段·节奏回调',
      days: recover,
      daily: [
        { title: `${goal}·补齐积压内容`, cognition: 'high', pomodoros: Math.ceil(perDayPomos / 2) },
        { title: `${goal}·轻量复习巩固`, cognition: 'low', pomodoros: Math.max(1, Math.floor(perDayPomos / 3)) },
      ],
    },
  ]
  if (rest > 0) {
    phases.push({
      name: '第二阶段·稳步推进',
      days: rest,
      daily: [
        { title: `${goal}·核心内容推进`, cognition: 'high', pomodoros: Math.ceil(perDayPomos / 2) },
        { title: `${goal}·练习与复盘`, cognition: 'low', pomodoros: Math.floor(perDayPomos / 2) || 1 },
      ],
    })
  }
  return phases
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}
