/**
 * 开发者工具（v0.6）—— 快速测试 & 数据种子
 *
 * 提供一键生成模拟数据的能力，方便开发调试和演示：
 *   - 种子 28 天专注记录（热力图 + 复盘看板）
 *   - 一键完成当前专注轮次
 *   - 种子任务列表
 *   - 触发 LLM 建议测试
 *   - 清除所有数据
 */

import { addSession } from '../storage/db'
import type { SessionRecord } from '../focus/types'
import { focusEngine } from '../../hooks/useEngines'

// ── 种子 28 天专注记录 ─────────────────────────────────────

/** 生成随机整数 [min, max] */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** 生成过去 N 天的模拟专注记录 */
export async function seed28DaysData(): Promise<number> {
  const now = Date.now()
  const DAY = 86_400_000
  const FOCUS_MIN = 25 * 60_000
  let count = 0

  for (let d = 27; d >= 0; d--) {
    const dayStart = now - d * DAY
    // 每天 2~6 轮专注（周末少一些）
    const isWeekend = new Date(dayStart).getDay() === 0 || new Date(dayStart).getDay() === 6
    const sessions = isWeekend ? randInt(1, 3) : randInt(2, 6)

    for (let s = 0; s < sessions; s++) {
      // 模拟在 9~18 点之间随机开始
      const hour = randInt(9, 18)
      const minuteOffset = randInt(0, 59)
      const startTs = new Date(dayStart).setHours(hour, minuteOffset, 0, 0)
      const focusMs = FOCUS_MIN
      // 30% 概率触发心流延长（3~12 分钟）
      const flowMs = Math.random() < 0.3 ? randInt(3, 12) * 60_000 : 0
      const endTs = startTs + focusMs + flowMs

      const record: SessionRecord = {
        startedAt: startTs,
        endedAt: endTs,
        focusMs,
        flowMs,
        taskTitle: Math.random() < 0.4 ? ['写周报', '编程练习', '阅读论文', '整理笔记'][randInt(0, 3)] : undefined,
      }

      await addSession(record)
      count++
    }
  }

  return count
}

// ── 一键完成当前专注 ────────────────────────────────────────

/** 立即结束当前专注并进入休息 */
export function fastForwardFocus(): boolean {
  const snap = focusEngine.snapshot()
  if (snap.phase !== 'focus' && snap.phase !== 'flow') return false
  focusEngine.advance()
  return true
}

// ── 种子任务列表 ──────────────────────────────────────────

import { taskEngine } from '../../hooks/useEngines'

const SAMPLE_TASKS = [
  { title: '完成 v0.6 开发文档', cognition: 'high' as const, pomodoros: 3 },
  { title: 'Review PR #42', cognition: 'high' as const, pomodoros: 2 },
  { title: '整理桌面和文件', cognition: 'low' as const, pomodoros: 1 },
  { title: '回复客户邮件', cognition: 'low' as const, pomodoros: 1 },
  { title: '学习 TypeScript 6 新特性', cognition: 'high' as const, pomodoros: 2 },
  { title: '准备周会 PPT', cognition: 'high' as const, pomodoros: 2 },
  { title: '散步 15 分钟', cognition: 'low' as const, pomodoros: 1 },
]

export async function seedSampleTasks(): Promise<number> {
  let count = 0
  for (const t of SAMPLE_TASKS) {
    await taskEngine.addTask(t.title, t.cognition, t.pomodoros)
    count++
  }
  return count
}

// ── 种子目标计划（v0.7）────────────────────────────

import { planEngine } from '../../hooks/useEngines'
import { expandPhases, toDateKey } from '../plan/plan-llm'
import type { PlanPhase } from '../plan/types'
import type { PlanDay } from '../storage/db'

/** 种子一个 14 天四级备考计划（Mock 模板，不走 LLM），今天的任务立即派发 */
export async function seedSamplePlan(): Promise<number> {
  const phases: PlanPhase[] = [
    {
      name: '第一阶段·词汇听力打底',
      days: 6,
      daily: [
        { title: '背四级核心词 50 个', cognition: 'low', pomodoros: 1 },
        { title: '精听一篇听力真题', cognition: 'high', pomodoros: 2 },
      ],
    },
    {
      name: '第二阶段·阅读写作强化',
      days: 5,
      daily: [
        { title: '精读两篇阅读真题', cognition: 'high', pomodoros: 2 },
        { title: '背诵一篇作文模板', cognition: 'low', pomodoros: 1 },
      ],
    },
    {
      name: '第三阶段·全真模拟冲刺',
      days: 3,
      daily: [
        { title: '限时全真模拟一套', cognition: 'high', pomodoros: 4 },
        { title: '错题复盘与查漏', cognition: 'high', pomodoros: 1 },
      ],
    },
  ]
  const days = expandPhases(phases)
  await planEngine.createPlan({
    goal: '通过大学英语四级（示例）',
    deadline: Date.now() + 13 * 86_400_000,
    dailyMinutes: 90,
    level: '四级 425 边缘',
    days,
  })
  return days.length
}

/** 种子一个"积压场景"计划：3 天前开始、前 3 天从未派发（6 项积压），用于触发重排建议 */
export async function seedBacklogPlan(): Promise<number> {
  const days: PlanDay[] = []
  const cursor = new Date()
  cursor.setDate(cursor.getDate() - 3)
  for (let i = 0; i < 12; i++) {
    days.push({
      date: toDateKey(cursor),
      phase: i < 6 ? '第一阶段·词汇听力打底' : '第二阶段·阅读写作强化',
      tasks: [
        { title: `背核心词 D${i + 1}`, cognition: 'low', pomodoros: 1 },
        { title: `精听真题 D${i + 1}`, cognition: 'high', pomodoros: 2 },
      ],
      dispatched: false,
    })
    cursor.setDate(cursor.getDate() + 1)
  }
  await planEngine.createPlan({
    goal: '四级积压测试计划（示例）',
    deadline: Date.now() + 8 * 86_400_000,
    dailyMinutes: 90,
    level: '四级 425 边缘',
    days,
  })
  return planEngine.getBacklogCount()
}

// ── 清除所有数据 ──────────────────────────────────────────

import { openDB } from '../storage/db'

export async function clearAllData(): Promise<void> {
  const db = await openDB()
  const tx1 = db.transaction('sessions', 'readwrite')
  tx1.objectStore('sessions').clear()
  await new Promise<void>((r) => { tx1.oncomplete = () => r() })

  const tx2 = db.transaction('tasks', 'readwrite')
  tx2.objectStore('tasks').clear()
  await new Promise<void>((r) => { tx2.oncomplete = () => r() })

  // v0.7: 计划一并清除
  const tx3 = db.transaction('plans', 'readwrite')
  tx3.objectStore('plans').clear()
  await new Promise<void>((r) => { tx3.oncomplete = () => r() })
}

// ── 强制触发 LLM 建议 ────────────────────────────────────

import { rulesEngine } from '../../hooks/useEngines'
import { createLLMAdapter, isLLMEnabled } from '../agent/LLMAdapter'
import { buildAgentPrompt } from '../agent/prompt-builder'
import { getSessions } from '../storage/db'
import { energyCache } from '../agent/RulesEngine'

export async function forceLLMSuggest(): Promise<string> {
  if (!isLLMEnabled()) {
    return '⚠️ LLM 未启用，请先在设置中打开'
  }
  const adapter = createLLMAdapter()
  const now = Date.now()
  const sessions = await getSessions(now - 7 * 86_400_000, now).catch(() => [])
  const tasks = taskEngine.snapshot().tasks
  const reading = {
    phase: focusEngine.snapshot().phase,
    duckEnabled: true,
    soundscapePlaying: false,
    currentHour: new Date().getHours(),
    consecutiveSessions: rulesEngine.getConsecutiveSessions(),
  }
  const prompt = buildAgentPrompt(reading, energyCache, sessions, tasks)
  const msg = await adapter.suggest(prompt)
  // 通过 rulesEngine 设置 suggest（如果有公开方法的话）
  return msg
}
