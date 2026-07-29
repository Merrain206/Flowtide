/**
 * LLM 适配层（v0.5）—— 双轨制之语义理解
 *
 * 统一接口：LLMAdapter.suggest(prompt) -> Promise<string>
 * 两个实现：
 *   - DeepSeekAdapter：调用 DeepSeek API（中文能力强，性价比高）
 *   - MockLLMAdapter：离线/无 API Key 时的规则降级方案
 *
 * API Key 存 localStorage（不持久化到 IDB，安全考量）
 */

import type { SensorReading } from './types'

// ── Agent Prompt 结构 ──────────────────────────────────────

export interface AgentPrompt {
  /** 当前传感器读数 */
  reading: SensorReading
  /** 精力画像摘要 */
  energyProfile: EnergyProfileSummary
  /** 最近 N 条专注记录 */
  recentSessions: SessionSummary[]
  /** 当前任务队列 */
  tasks: TaskSummary[]
}

export interface EnergyProfileSummary {
  sufficient: boolean
  peakHours: number[]
  troughHours: number[]
  totalSessions: number
}

export interface SessionSummary {
  date: string
  focusMin: number
  flowMin: number
}

export interface TaskSummary {
  title: string
  done: boolean
  cognition: 'high' | 'low'
}

// ── 适配器接口 ──────────────────────────────────────────────

export interface LLMAdapter {
  suggest(prompt: AgentPrompt): Promise<string>
}

// ── DeepSeek 适配器 ─────────────────────────────────────────

/** OpenAI 兼容端点 */
const DEEPSEEK_BASE = 'https://api.deepseek.com'
const DEEPSEEK_API = `${DEEPSEEK_BASE}/chat/completions`
const DEEPSEEK_MODEL = 'deepseek-v4-flash'

/** 用户未配置时的内置默认 Key */
const DEFAULT_API_KEY = 'sk-1c8f9ece34324e75a4ce9d8d4124d896'

const SYSTEM_PROMPT = `你是 Flowtide 心流潮汐的 AI 专注助手。
用户正在使用番茄钟进行专注工作。你会收到用户的当前状态（专注阶段、精力画像、最近记录、任务列表）。
请根据上下文给出 1-2 句简短、温暖、实用的建议。语气像一位了解你的搭档，不是机器人。
回复纯文本，不要 JSON，不要用 markdown 格式。控制在 40 字以内。`

export class DeepSeekAdapter implements LLMAdapter {
  async suggest(prompt: AgentPrompt): Promise<string> {
    const apiKey = getAPIKey() || DEFAULT_API_KEY

    const userMsg = buildUserMessage(prompt)
    try {
      const res = await fetch(DEEPSEEK_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMsg },
          ],
          temperature: 0.7,
          max_tokens: 120,
          stream: false,
        }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const reply: string = data.choices?.[0]?.message?.content ?? ''
      return reply.trim() || '暂无建议，继续加油！'
    } catch (err) {
      return `LLM 请求失败：${err instanceof Error ? err.message : '未知错误'}`
    }
  }
}

// ── Mock 适配器（规则降级）───────────────────────────────────

export class MockLLMAdapter implements LLMAdapter {
  async suggest(prompt: AgentPrompt): Promise<string> {
    const { reading, energyProfile, recentSessions } = prompt
    const hour = reading.currentHour ?? new Date().getHours()
    const isPeak = energyProfile.peakHours.includes(hour)
    const isTrough = energyProfile.troughHours.includes(hour)

    // 基于规则生成有意义的建议
    if (reading.phase === 'focus') {
      if (isTrough) return '低谷时段，可以试试 15 分钟短专注，降低心理门槛'
      if (isPeak) return '精力高峰期，适合处理高认知任务'
      return '专注中，保持节奏，别给自己太大压力'
    }

    if (reading.phase === 'flow') {
      return '进入心流了！不打扰你，专注到自然结束就好'
    }

    if (reading.phase === 'shortBreak' || reading.phase === 'longBreak') {
      const recentFlow = recentSessions[0]?.flowMin ?? 0
      if (recentFlow > 5) return `上轮心流延长了 ${recentFlow} 分钟，状态很好！休息后继续`
      if ((reading.consecutiveSessions ?? 0) >= 3) return '连续好几轮了，好好利用这次休息充电'
      return '休息一下，站起来走动走动'
    }

    return '准备好了就开始下一轮专注吧'
  }
}

// ── 工具函数 ────────────────────────────────────────────────

function buildUserMessage(p: AgentPrompt): string {
  const phaseLabel: Record<string, string> = {
    focus: '专注中', flow: '心流延长', shortBreak: '短休息', longBreak: '长休息', idle: '待机',
  }
  const lines = [
    `当前阶段：${phaseLabel[p.reading.phase] ?? p.reading.phase}`,
    `当前时间：${new Date().getHours()} 时`,
    p.reading.currentTask ? `当前任务：${p.reading.currentTask.title}（${p.reading.currentTask.cognition === 'high' ? '高认知' : '低认知'}）` : '无关联任务',
    `精力画像：${p.energyProfile.sufficient ? `已采集 ${p.energyProfile.totalSessions} 轮，高峰 ${p.energyProfile.peakHours.join(',')} 时，低谷 ${p.energyProfile.troughHours.join(',')} 时` : '数据不足'}`,
    `最近专注：${p.recentSessions.length ? p.recentSessions.map(s => `${s.date} ${s.focusMin}min+${s.flowMin}flow`).join('; ') : '无记录'}`,
    `待办任务：${p.tasks.filter(t => !t.done).map(t => t.title).slice(0, 3).join(', ') || '无'}`,
  ]
  return lines.join('\n')
}

// ── API Key 管理（localStorage）──────────────────────────────

const API_KEY_STORAGE = 'flowtide:deepseek:apiKey'
const PROVIDER_STORAGE = 'flowtide:llm:provider'
const ENABLED_STORAGE = 'flowtide:llm:enabled'

/** 获取 API Key，优先使用用户自定义，回退到内置默认值 */
export function getAPIKey(): string {
  try { return localStorage.getItem(API_KEY_STORAGE) ?? '' } catch { return '' }
}

/** 获取实际生效的 Key（用户自定义 > 内置默认） */
export function getEffectiveAPIKey(): string {
  return getAPIKey() || DEFAULT_API_KEY
}

export function setAPIKey(key: string): void {
  try { localStorage.setItem(API_KEY_STORAGE, key) } catch { /* noop */ }
}

export type LLMProvider = 'deepseek' | 'mock'

export function getProvider(): LLMProvider {
  try {
    const v = localStorage.getItem(PROVIDER_STORAGE)
    return v === 'deepseek' ? 'deepseek' : 'mock'
  } catch { return 'mock' }
}

export function setProvider(p: LLMProvider): void {
  try { localStorage.setItem(PROVIDER_STORAGE, p) } catch { /* noop */ }
}

export function isLLMEnabled(): boolean {
  try { return localStorage.getItem(ENABLED_STORAGE) === 'true' } catch { return false }
}

export function setLLMEnabled(v: boolean): void {
  try { localStorage.setItem(ENABLED_STORAGE, String(v)) } catch { /* noop */ }
}

/** 根据当前配置创建适配器实例 */
export function createLLMAdapter(): LLMAdapter {
  const provider = getProvider()
  if (provider === 'deepseek') return new DeepSeekAdapter()
  return new MockLLMAdapter()
}
