/**
 * 应用内检查更新（v0.9 模块五）
 *
 * 从自建下载页拉取 latest.json，与本机 versionCode 比对：
 *   - APK 端：@capacitor/app 读取当前 build（versionCode），有新版则提示
 *   - Web 端：无版本概念，降级为「始终无更新」（仅展示下载页版本号）
 *
 * 全程只走 merrain.cn 域名，绝不出现任何服务器 IP。
 * latest.json 以 no-store 拉取，避免 CDN 缓存导致漏掉新版。
 */

import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'

/** 当前应用版本号（页面展示用；与 build.gradle / package.json 保持一致） */
export const APP_VERSION = '0.9.1'

/** 下载页与版本清单地址（固定域名，不可配置） */
const LATEST_URL = 'https://merrain.cn/download/flowtide/latest.json'
export const DOWNLOAD_PAGE = 'https://merrain.cn/download/flowtide'

const AUTO_KEY = 'flowtide.update.auto.v1'
const LAST_CHECK_KEY = 'flowtide.update.lastcheck.v1'

export interface UpdateInfo {
  /** 是否有可安装的新版本（仅 APK 端可能为 true） */
  hasUpdate: boolean
  /** 最新版本名（如 "0.9"） */
  versionName: string
  /** APK 直链（merrain.cn 域名） */
  url: string
  /** 更新说明 */
  notes: string
}

interface LatestJson {
  versionCode: number
  versionName: string
  url: string
  notes?: string
}

/** 是否开启启动自动检查（默认开） */
export function isAutoCheckEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) !== '0'
  } catch {
    return true
  }
}

export function setAutoCheckEnabled(on: boolean): void {
  try {
    localStorage.setItem(AUTO_KEY, on ? '1' : '0')
  } catch { /* 忽略 */ }
}

/** 读取本机 versionCode（Web 端返回 0） */
async function currentVersionCode(): Promise<number> {
  if (!Capacitor.isNativePlatform()) return 0
  try {
    const info = await App.getInfo()
    return parseInt(info.build, 10) || 0
  } catch {
    return 0
  }
}

/**
 * 手动检查更新。返回 null 表示网络失败/清单不可达。
 * hasUpdate 仅在 APK 端且 latest.versionCode 大于本机时为 true。
 */
export async function checkUpdate(): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(LATEST_URL, { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as LatestJson
    const current = await currentVersionCode()
    return {
      hasUpdate: Capacitor.isNativePlatform() && data.versionCode > current,
      versionName: data.versionName,
      url: data.url,
      notes: data.notes ?? '',
    }
  } catch {
    return null
  }
}

/**
 * 启动时每日一次自动检查：命中新版返回 UpdateInfo，否则返回 null。
 * 关闭自动检查、当日已查过、无更新时均返回 null（静默）。
 */
export async function autoCheckDaily(): Promise<UpdateInfo | null> {
  if (!isAutoCheckEnabled()) return null
  const today = new Date().toDateString()
  try {
    if (localStorage.getItem(LAST_CHECK_KEY) === today) return null
  } catch { /* 忽略 */ }
  const info = await checkUpdate()
  try {
    localStorage.setItem(LAST_CHECK_KEY, today)
  } catch { /* 忽略 */ }
  return info?.hasUpdate ? info : null
}
