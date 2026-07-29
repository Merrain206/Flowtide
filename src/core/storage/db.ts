/**
 * Flowtide 数据层 —— IndexedDB 薄封装
 *
 * 从 localStorage 迁移到 IDB，支持按时间范围查询与聚合统计，
 * 为精力曲线模型（v0.4）提供数据基础设施。
 *
 * ObjectStore: sessions
 *   keyPath: endedAt
 *   index:   byDate (日期字符串，如 "Mon Jul 28 2025")
 *
 * ObjectStore: tasks (v0.4)
 *   keyPath: id (autoIncrement)
 *
 * ObjectStore: plans (v0.7)
 *   keyPath: id (autoIncrement)
 */

import type { DailyAgg, SessionRecord } from '../focus/types'

const DB_NAME = 'flowtide'
const DB_VERSION = 3
const STORE = 'sessions'
const TASK_STORE = 'tasks'
const PLAN_STORE = 'plans'
const LS_KEY = 'flowtide.sessions.v1'

let dbPromise: Promise<IDBDatabase> | null = null

/** 打开数据库（单例），首次打开时自动迁移 localStorage 旧数据 */
export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'endedAt' })
        store.createIndex('byDate', 'byDate', { unique: false })
      }
      // v0.4: tasks ObjectStore
      if (!db.objectStoreNames.contains(TASK_STORE)) {
        db.createObjectStore(TASK_STORE, { keyPath: 'id', autoIncrement: true })
      }
      // v0.7: plans ObjectStore
      if (!db.objectStoreNames.contains(PLAN_STORE)) {
        db.createObjectStore(PLAN_STORE, { keyPath: 'id', autoIncrement: true })
      }
    }

    req.onsuccess = () => {
      const db = req.result
      void migrateLocalStorage(db)
      resolve(db)
    }

    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

// ── 读写 API ──────────────────────────────────────────────

/** 写入一条专注记录 */
export async function addSession(record: SessionRecord): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    // byDate 索引字段：日期字符串
    const enriched = { ...record, byDate: toDateStr(record.endedAt) }
    store.put(enriched)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** 按时间范围获取所有记录 */
export async function getSessions(from: number, to: number): Promise<SessionRecord[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const range = IDBKeyRange.bound(from, to)
    const req = store.getAll(range)
    req.onsuccess = () => resolve(req.result as SessionRecord[])
    req.onerror = () => reject(req.error)
  })
}

/** 获取某一天的聚合数据 */
export async function getDailyAgg(date: string): Promise<DailyAgg> {
  const dayStart = new Date(date).setHours(0, 0, 0, 0)
  const dayEnd = dayStart + 86_400_000
  const sessions = await getSessions(dayStart, dayEnd)
  return aggregate(sessions, date)
}

/** 获取多天范围的聚合数据（按天分组） */
export async function getRangeAgg(from: number, to: number): Promise<DailyAgg[]> {
  const sessions = await getSessions(from, to)
  const groups = new Map<string, SessionRecord[]>()

  for (const s of sessions) {
    const key = toDateStr(s.endedAt)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(s)
  }

  // 按日期升序排列
  const sorted = [...groups.entries()].sort(
    (a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime(),
  )

  return sorted.map(([date, recs]) => aggregate(recs, date))
}

// ── 任务读写 API ──────────────────────────────────────────

/** 任务类型 */
export interface TaskRecord {
  id?: number
  title: string
  cognition: 'high' | 'low'
  pomodoros: number
  done: boolean
  /** 现实时间提示（如 "9:00-9:30"，来自 AI 日程提取，v0.6） */
  time?: string
  /** 来源计划 id（v0.7 目标计划引擎派发的任务） */
  planId?: number
}

/** 获取所有任务 */
export async function getTasks(): Promise<TaskRecord[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TASK_STORE, 'readonly')
    const store = tx.objectStore(TASK_STORE)
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result as TaskRecord[])
    req.onerror = () => reject(req.error)
  })
}

/** 新增任务，返回 id */
export async function addTask(task: TaskRecord): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TASK_STORE, 'readwrite')
    const store = tx.objectStore(TASK_STORE)
    const req = store.add(task)
    tx.oncomplete = () => resolve(req.result as number)
    tx.onerror = () => reject(tx.error)
  })
}

/** 更新任务 */
export async function updateTask(task: TaskRecord): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TASK_STORE, 'readwrite')
    const store = tx.objectStore(TASK_STORE)
    store.put(task)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** 删除任务 */
export async function deleteTask(id: number): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TASK_STORE, 'readwrite')
    const store = tx.objectStore(TASK_STORE)
    store.delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** 批量替换所有任务（用于排序） */
export async function replaceAllTasks(tasks: TaskRecord[]): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TASK_STORE, 'readwrite')
    const store = tx.objectStore(TASK_STORE)
    store.clear()
    for (const t of tasks) store.put(t)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ── 计划读写 API（v0.7 目标计划引擎）──────────────────────

/** 计划中某一天的单个任务 */
export interface PlanTask {
  title: string
  cognition: 'high' | 'low'
  pomodoros: number
  time?: string
}

/** 计划中的一天 */
export interface PlanDay {
  /** YYYY-MM-DD */
  date: string
  /** 所属阶段名，如 "第一阶段·词汇打底" */
  phase: string
  tasks: PlanTask[]
  /** 是否已派发到任务队列 */
  dispatched: boolean
  /** 未完成任务被顺延合并过（v0.7 模块三） */
  carried?: boolean
}

/** 目标计划 */
export interface PlanRecord {
  id?: number
  /** 目标描述，如 "通过大学英语四级" */
  goal: string
  /** 截止时间戳 */
  deadline: number
  /** 每天可投入分钟数 */
  dailyMinutes: number
  /** 用户自评水平 */
  level: string
  status: 'active' | 'done' | 'archived'
  createdAt: number
  /** 上次 LLM 重排时间（v0.7 模块三） */
  rebalancedAt?: number
  days: PlanDay[]
}

/** 获取所有计划 */
export async function getPlans(): Promise<PlanRecord[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PLAN_STORE, 'readonly')
    const req = tx.objectStore(PLAN_STORE).getAll()
    req.onsuccess = () => resolve(req.result as PlanRecord[])
    req.onerror = () => reject(req.error)
  })
}

/** 新增计划，返回 id */
export async function addPlan(plan: PlanRecord): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PLAN_STORE, 'readwrite')
    const req = tx.objectStore(PLAN_STORE).add(plan)
    tx.oncomplete = () => resolve(req.result as number)
    tx.onerror = () => reject(tx.error)
  })
}

/** 更新计划 */
export async function updatePlan(plan: PlanRecord): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PLAN_STORE, 'readwrite')
    tx.objectStore(PLAN_STORE).put(plan)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** 删除计划 */
export async function deletePlan(id: number): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PLAN_STORE, 'readwrite')
    tx.objectStore(PLAN_STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ── 辅助函数 ──────────────────────────────────────────────

function aggregate(sessions: SessionRecord[], date: string): DailyAgg {
  let focusMs = 0
  let flowMs = 0
  for (const s of sessions) {
    focusMs += s.focusMs
    flowMs += s.flowMs
  }
  const total = focusMs + flowMs
  return {
    date,
    focusMs,
    flowMs,
    cycles: sessions.length,
    flowRatio: total > 0 ? flowMs / total : 0,
  }
}

function toDateStr(ts: number): string {
  return new Date(ts).toDateString()
}

/** 从 localStorage 迁移旧数据到 IDB（一次性操作） */
async function migrateLocalStorage(db: IDBDatabase): Promise<void> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return
    const old = JSON.parse(raw) as Array<Partial<SessionRecord> & { endedAt: number; focusMs: number; flowMs: number }>
    if (!Array.isArray(old) || old.length === 0) return

    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)

    for (const record of old) {
      // 旧数据没有 startedAt，估算一个
      const startedAt = record.startedAt ?? (record.endedAt - record.focusMs - record.flowMs)
      const enriched = {
        ...record,
        startedAt,
        byDate: toDateStr(record.endedAt),
      }
      store.put(enriched)
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => {
        // 迁移成功后删除旧 key
        localStorage.removeItem(LS_KEY)
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // 迁移失败不影响正常使用，旧数据保留在 localStorage
  }
}
