/**
 * Prompt 构建器（v0.5）
 *
 * 纯函数：将 SensorReading + 精力画像 + 最近记录 + 任务列表
 * 组装为 AgentPrompt，供 LLMAdapter.suggest() 消费。
 */

import type { SensorReading } from './types'
import type { SessionRecord } from '../focus/types'
import type { EnergyProfile } from './EnergyModel'
import type { Task } from '../task/TaskEngine'
import type {
  AgentPrompt,
  EnergyProfileSummary,
  SessionSummary,
  TaskSummary,
} from './LLMAdapter'

/** 将完整上下文组装为 AgentPrompt */
export function buildAgentPrompt(
  reading: SensorReading,
  profile: EnergyProfile | null,
  sessions: SessionRecord[],
  tasks: Task[],
): AgentPrompt {
  return {
    reading,
    energyProfile: summarizeProfile(profile),
    recentSessions: sessions.slice(-5).map(summarizeSession),
    tasks: tasks.slice(0, 5).map(summarizeTask),
  }
}

// ── 内部转换函数 ────────────────────────────────────────────

function summarizeProfile(p: EnergyProfile | null): EnergyProfileSummary {
  if (!p || !p.sufficient) {
    return { sufficient: false, peakHours: [], troughHours: [], totalSessions: 0 }
  }
  return {
    sufficient: true,
    peakHours: p.peakHours,
    troughHours: p.troughHours,
    totalSessions: p.countByHour.reduce((a, b) => a + b, 0),
  }
}

function summarizeSession(s: SessionRecord): SessionSummary {
  return {
    date: new Date(s.startedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
    focusMin: Math.round(s.focusMs / 60_000),
    flowMin: Math.round(s.flowMs / 60_000),
  }
}

function summarizeTask(t: Task): TaskSummary {
  return { title: t.title, done: t.done, cognition: t.cognition }
}
