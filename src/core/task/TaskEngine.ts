/**
 * 任务引擎 —— 纯 TS 状态机，管理任务队列
 *
 * 任务清单是 Agent 语义理解的输入端：
 *   cognition 字段标记任务认知负荷（高=写方案/编程，低=回邮件/整理），
 *   Agent 据此推荐声景和时段。
 *
 * 持久化到 IDB tasks store，subscribe/snapshot 模式与 FocusEngine 一致。
 */

import {
  type TaskRecord,
  getTasks,
  addTask as dbAddTask,
  updateTask as dbUpdateTask,
  deleteTask as dbDeleteTask,
  replaceAllTasks as dbReplaceAll,
} from '../storage/db'

export type Task = TaskRecord

export interface TaskSnapshot {
  tasks: Task[]
  /** 队列头部未完成的任务（专注时关联） */
  currentTask: Task | null
}

type TaskListener = (snap: TaskSnapshot) => void

export class TaskEngine {
  private tasks: Task[] = []
  private listeners: Set<TaskListener> = new Set()

  constructor() {
    void this.loadFromDB()
  }

  /** 从 IDB 加载所有任务 */
  private async loadFromDB() {
    try {
      this.tasks = await getTasks()
    } catch {
      this.tasks = []
    }
    this.emit()
  }

  subscribe(fn: TaskListener): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  snapshot(): TaskSnapshot {
    const current = this.tasks.find((t) => !t.done) ?? null
    return { tasks: [...this.tasks], currentTask: current }
  }

  private emit() {
    const snap = this.snapshot()
    this.listeners.forEach((fn) => fn(snap))
  }

  // ── CRUD ──────────────────────────────────────────────

  async addTask(title: string, cognition: 'high' | 'low' = 'high', pomodoros = 1, time?: string, planId?: number): Promise<void> {
    const task: Task = { title, cognition, pomodoros, done: false, ...(time ? { time } : {}), ...(planId != null ? { planId } : {}) }
    const id = await dbAddTask(task)
    task.id = id
    this.tasks.push(task)
    this.emit()
  }

  async completeTask(id: number): Promise<void> {
    const task = this.tasks.find((t) => t.id === id)
    if (!task) return
    task.done = true
    await dbUpdateTask(task)
    this.emit()
  }

  async removeTask(id: number): Promise<void> {
    this.tasks = this.tasks.filter((t) => t.id !== id)
    await dbDeleteTask(id)
    this.emit()
  }

  async reorderTasks(orderedIds: number[]): Promise<void> {
    const map = new Map(this.tasks.map((t) => [t.id, t]))
    const reordered: Task[] = []
    for (const id of orderedIds) {
      const t = map.get(id)
      if (t) reordered.push(t)
    }
    // 加上未在 orderedIds 中出现的（安全兜底）
    for (const t of this.tasks) {
      if (!orderedIds.includes(t.id!)) reordered.push(t)
    }
    this.tasks = reordered
    await dbReplaceAll(this.tasks)
    this.emit()
  }

  /** 将指定任务标记为未完成（恢复） */
  async reopenTask(id: number): Promise<void> {
    const task = this.tasks.find((t) => t.id === id)
    if (!task) return
    task.done = false
    await dbUpdateTask(task)
    this.emit()
  }

  /** 获取队列头部未完成任务（供专注引擎关联） */
  peekCurrent(): Task | null {
    return this.tasks.find((t) => !t.done) ?? null
  }
}
