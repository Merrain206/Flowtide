/**
 * 全量数据备份（v0.8 模块四）
 *
 * 导出：IndexedDB 所有 store（sessions/tasks/plans）+ localStorage 配置
 *       → 单个带版本号 JSON。Web 端文件下载，APK 端走系统分享面板。
 * 导入：版本校验 + 覆盖恢复（调用方需在覆盖前向用户确认）。
 *
 * 安全约定：不备份网易云登录 cookie（重新扫码即可），
 * 数据格式为后续多端同步（WebDAV/云盘）预留，本版不做同步协议。
 */

import { Capacitor } from '@capacitor/core'
import { openDB } from '../storage/db'

/** 备份格式版本：结构不兼容时递增 */
const FORMAT_VERSION = 1
/** 兜底可读的最老版本 */
const MIN_VERSION = 1

/** 参与备份的 IDB store（与 db.ts 保持一致） */
const IDB_STORES = ['sessions', 'tasks', 'plans'] as const

/** localStorage 中排除的键：安全敏感（网易云 cookie）与 API Key */
const LS_EXCLUDE = [
  'flowtide.netease.cookie.v1',
  'flowtide:deepseek:apiKey',
]

/** localStorage 中纳入备份的键前缀（本应用所有配置均以 flowtide 开头） */
const LS_PREFIX = 'flowtide'

export interface BackupPayload {
  app: 'flowtide'
  formatVersion: number
  exportedAt: number
  idb: Record<string, unknown[]>
  localStorage: Record<string, string>
}

export interface BackupSummary {
  sessions: number
  tasks: number
  plans: number
  configs: number
  exportedAt: number
}

// ── 导出 ────────────────────────────────────────────────

/** 生成全量备份 JSON 字符串 */
export async function createBackup(): Promise<string> {
  const db = await openDB()

  const idb: Record<string, unknown[]> = {}
  for (const name of IDB_STORES) {
    idb[name] = await new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction(name, 'readonly')
      const req = tx.objectStore(name).getAll()
      req.onsuccess = () => resolve(req.result as unknown[])
      req.onerror = () => reject(req.error)
    })
  }

  const ls: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith(LS_PREFIX) || LS_EXCLUDE.includes(key)) continue
    const val = localStorage.getItem(key)
    if (val !== null) ls[key] = val
  }

  const payload: BackupPayload = {
    app: 'flowtide',
    formatVersion: FORMAT_VERSION,
    exportedAt: Date.now(),
    idb,
    localStorage: ls,
  }
  return JSON.stringify(payload)
}

/**
 * 导出并交付备份文件：
 * Web 端触发浏览器下载；APK 端写入缓存目录后拉起系统分享面板。
 */
export async function exportBackupFile(): Promise<void> {
  const json = await createBackup()
  const filename = `flowtide-backup-${new Date().toISOString().slice(0, 10)}.json`

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const result = await Filesystem.writeFile({
      path: filename,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    })
    await Share.share({
      title: 'Flowtide 数据备份',
      files: [result.uri],
    })
    return
  }

  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── 导入 ────────────────────────────────────────────────

/** 解析并校验备份文件，返回摘要供覆盖前确认；格式不合法时抛错 */
export function parseBackup(json: string): { payload: BackupPayload; summary: BackupSummary } {
  const payload = JSON.parse(json) as Partial<BackupPayload>
  if (payload.app !== 'flowtide' || typeof payload.formatVersion !== 'number') {
    throw new Error('不是有效的 Flowtide 备份文件')
  }
  if (payload.formatVersion < MIN_VERSION || payload.formatVersion > FORMAT_VERSION) {
    throw new Error(`备份格式版本 ${payload.formatVersion} 与当前应用不兼容`)
  }
  const idb = payload.idb ?? {}
  const summary: BackupSummary = {
    sessions: Array.isArray(idb.sessions) ? idb.sessions.length : 0,
    tasks: Array.isArray(idb.tasks) ? idb.tasks.length : 0,
    plans: Array.isArray(idb.plans) ? idb.plans.length : 0,
    configs: Object.keys(payload.localStorage ?? {}).length,
    exportedAt: payload.exportedAt ?? 0,
  }
  return { payload: payload as BackupPayload, summary }
}

/**
 * 覆盖恢复：清空各 store 后写入备份数据，localStorage 同名键覆盖。
 * 调用方必须先经用户确认。恢复完成后建议整页刷新以重建引擎状态。
 */
export async function restoreBackup(payload: BackupPayload): Promise<void> {
  const db = await openDB()

  for (const name of IDB_STORES) {
    const rows = Array.isArray(payload.idb[name]) ? payload.idb[name] : []
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(name, 'readwrite')
      const store = tx.objectStore(name)
      store.clear()
      for (const row of rows) store.put(row)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  for (const [key, val] of Object.entries(payload.localStorage)) {
    // 双保险：即使旧版本备份混入排除键也不写回
    if (LS_EXCLUDE.includes(key)) continue
    try {
      localStorage.setItem(key, val)
    } catch {
      // 配额满时跳过该键，IDB 数据已恢复为主
    }
  }
}
