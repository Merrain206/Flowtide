/**
 * 目标计划引擎（v0.7）—— 计划的存取、每日派发与进度统计
 *
 * 单例模式与 TaskEngine 一致（subscribe/snapshot）。
 * 核心职责：每天启动时把 active 计划中"今天"的任务自动注入番茄钟任务队列，
 * 用户只看任务面板即可，无需再手动搬运学习计划。
 */

import {
  type PlanRecord,
  type PlanDay,
  getPlans,
  addPlan as dbAddPlan,
  updatePlan as dbUpdatePlan,
  deletePlan as dbDeletePlan,
} from '../storage/db'
import type { TaskEngine } from '../task/TaskEngine'
import type { PlanSnapshot, PlanProgress, PlanPhase } from './types'
import { todayKey, expandPhases } from './plan-llm'

type PlanListener = (snap: PlanSnapshot) => void

export class PlanEngine {
  private plans: PlanRecord[] = []
  private listeners: Set<PlanListener> = new Set()
  private taskEngine: TaskEngine

  constructor(taskEngine: TaskEngine) {
    this.taskEngine = taskEngine
    void this.init()
  }

  private async init() {
    try {
      this.plans = await getPlans()
    } catch {
      this.plans = []
    }
    this.emit()
    await this.dispatchToday()
  }

  subscribe(fn: PlanListener): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  snapshot(): PlanSnapshot {
    const active = this.plans.find((p) => p.status === 'active') ?? null
    return { plans: [...this.plans], activePlan: active }
  }

  private emit() {
    const snap = this.snapshot()
    this.listeners.forEach((fn) => fn(snap))
  }

  // ── CRUD ──────────────────────────────────────────────

  /** 保存新计划并设为 active（旧 active 计划自动归档），随后立即派发今天 */
  async createPlan(plan: Omit<PlanRecord, 'id' | 'status' | 'createdAt'>): Promise<number> {
    for (const p of this.plans) {
      if (p.status === 'active') {
        p.status = 'archived'
        await dbUpdatePlan(p)
      }
    }
    const record: PlanRecord = { ...plan, status: 'active', createdAt: Date.now() }
    const id = await dbAddPlan(record)
    record.id = id
    this.plans.push(record)
    this.emit()
    await this.dispatchToday()
    return id
  }

  async removePlan(id: number): Promise<void> {
    this.plans = this.plans.filter((p) => p.id !== id)
    await dbDeletePlan(id)
    this.emit()
  }

  async setStatus(id: number, status: PlanRecord['status']): Promise<void> {
    const plan = this.plans.find((p) => p.id === id)
    if (!plan) return
    plan.status = status
    await dbUpdatePlan(plan)
    this.emit()
  }

  // ── 每日派发 ──────────────────────────────────────────

  /**
   * 把 active 计划中今天的任务派发到任务队列（幂等：dispatched 标记防重复）。
   * 启动时与创建计划后调用。派发前先处理顺延（模块三）。
   */
  async dispatchToday(): Promise<void> {
    const active = this.plans.find((p) => p.status === 'active')
    if (!active) return

    const today = todayKey()
    let changed = false

    // 顺延：昨天及更早未派发的天（用户没打开过应用）合并进今天；
    // 积压超过 4 项就不硬塞队列了，留给 AI 重排消化
    const missedDays = active.days.filter((d) => d.date < today && !d.dispatched)
    const missedTasks = missedDays.flatMap((d) => d.tasks)
    if (missedTasks.length > 0 && missedTasks.length <= 4) {
      for (const t of missedTasks) {
        await this.taskEngine.addTask(t.title, t.cognition, t.pomodoros, t.time, active.id)
      }
      for (const d of missedDays) {
        d.dispatched = true
        d.carried = true
      }
      changed = true
    }

    // 今天
    const day = active.days.find((d) => d.date === today)
    if (day && !day.dispatched) {
      for (const t of day.tasks) {
        await this.taskEngine.addTask(t.title, t.cognition, t.pomodoros, t.time, active.id)
      }
      day.dispatched = true
      changed = true
    }

    if (changed) {
      await dbUpdatePlan(active)
      this.emit()
    }
  }

  // ── 自适应重排（模块三）──────────────────────────

  /** 积压任务数 = 队列里未完成的计划任务 + 从未派发的历史天任务 */
  getBacklogCount(): number {
    const active = this.plans.find((p) => p.status === 'active')
    if (!active) return 0
    const today = todayKey()
    const undispatched = active.days
      .filter((d) => d.date < today && !d.dispatched)
      .reduce((s, d) => s + d.tasks.length, 0)
    const pending = this.taskEngine.snapshot().tasks
      .filter((t) => t.planId === active.id && !t.done).length
    return undispatched + pending
  }

  /**
   * 是否建议重排：积压 ≥ 6 项，或距上次重排 ≥ 7 天且完成率 < 70%（已跑起来才算）
   */
  needsRebalance(): boolean {
    const active = this.plans.find((p) => p.status === 'active')
    if (!active) return false
    if (this.getBacklogCount() >= 6) return true
    const last = active.rebalancedAt ?? active.createdAt
    const progress = this.getProgress(active.id!)
    return Date.now() - last >= 7 * 86_400_000
      && progress.dispatchedDays >= 3
      && progress.ratio < 0.7
  }

  /** 重排上下文：供 plan-llm 生成提示词 */
  getRebalanceContext(): { plan: PlanRecord; remainingDays: number; backlogTitles: string[]; doneRatio: number } | null {
    const active = this.plans.find((p) => p.status === 'active')
    if (!active) return null
    const today = todayKey()
    // 重排范围 = 明天起的剩余天数（今天已派发的不动）
    const remainingDays = active.days.filter((d) => d.date > today).length
    const backlogTitles = [
      ...active.days.filter((d) => d.date < today && !d.dispatched).flatMap((d) => d.tasks.map((t) => t.title)),
      ...this.taskEngine.snapshot().tasks
        .filter((t) => t.planId === active.id && !t.done)
        .map((t) => t.title),
    ]
    const progress = this.getProgress(active.id!)
    return { plan: active, remainingDays, backlogTitles, doneRatio: progress.ratio }
  }

  /**
   * 应用重排结果：今天（含）之前的天保留原样，明天起替换为新阶段展开；
   * 未派发的历史天标记已派发（积压已融入新计划，不再重复追）
   */
  async applyRebalance(phases: PlanPhase[]): Promise<void> {
    const active = this.plans.find((p) => p.status === 'active')
    if (!active) return
    const today = todayKey()

    const kept = active.days.filter((d) => d.date <= today)
    for (const d of kept) {
      if (!d.dispatched) {
        d.dispatched = true
        d.carried = true
      }
    }

    // 从明天开始展开新阶段
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const newDays = expandPhasesFrom(phases, tomorrow)

    active.days = [...kept, ...newDays]
    active.rebalancedAt = Date.now()
    await dbUpdatePlan(active)
    this.emit()
  }

  // ── 进度统计 ──────────────────────────────────────────

  getProgress(planId: number): PlanProgress {
    const plan = this.plans.find((p) => p.id === planId)
    if (!plan) return { totalDays: 0, dispatchedDays: 0, totalTasks: 0, doneTasks: 0, ratio: 0 }

    const totalDays = plan.days.length
    const dispatchedDays = plan.days.filter((d) => d.dispatched).length
    const totalTasks = plan.days.reduce((s, d) => s + d.tasks.length, 0)
    // 已完成 = 任务队列中该计划的 done 任务数（用户删除的不计，容忍轻微低估）
    const doneTasks = this.taskEngine.snapshot().tasks
      .filter((t) => t.planId === planId && t.done).length

    return {
      totalDays,
      dispatchedDays,
      totalTasks,
      doneTasks,
      ratio: totalTasks > 0 ? doneTasks / totalTasks : 0,
    }
  }
}

/** 从指定日期开始展开阶段模板（重排用，区别于 expandPhases 的“从今天”） */
function expandPhasesFrom(phases: PlanPhase[], start: Date): PlanDay[] {
  const shifted = expandPhases(phases)
  const base = new Date(start)
  return shifted.map((d, i) => {
    const cursor = new Date(base)
    cursor.setDate(base.getDate() + i)
    return { ...d, date: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}` }
  })
}
