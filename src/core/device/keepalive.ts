/**
 * APK 后台保活桥（v0.9 模块六）
 *
 * 国产 ROM 默认限制后台：App 被杀后到点通知 / 灵动岛实况会失效。
 * 本模块封装原生跳转，引导用户完成两步设置：
 *   1. 允许后台运行（忽略电池优化白名单）
 *   2. 开启自启动（各厂商自启动管理页，MIUI 为主，其余回退应用详情页）
 *
 * Web 环境完全空操作。原生方法挂在 LiveTimer 插件上（同一原生类）。
 */

import { Capacitor, registerPlugin } from '@capacitor/core'

interface KeepAliveNative {
  checkBatteryOptimization(): Promise<{ ignoring: boolean }>
  openBatterySettings(): Promise<void>
  openAutoStartSettings(): Promise<void>
  openAppSettings(): Promise<void>
}

const KeepAlive = registerPlugin<KeepAliveNative>('LiveTimer')

/** 首次启动保活引导一次性标记 */
const GUIDE_KEY = 'flowtide.keepalive.guided.v1'

/** 是否运行在原生容器内（APK） */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

/**
 * 是否已加入电池优化白名单（允许后台运行）。
 * Web 端无此概念，返回 true（视作无需引导）。
 */
export async function isIgnoringBattery(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true
  try {
    const { ignoring } = await KeepAlive.checkBatteryOptimization()
    return ignoring
  } catch {
    return true
  }
}

/** 跳转「忽略电池优化」授权（弹系统白名单确认框） */
export async function requestIgnoreBattery(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await KeepAlive.openBatterySettings()
  } catch { /* 忽略 */ }
}

/** 跳转自启动管理页（MIUI 优先，逐级回退应用详情页） */
export async function openAutoStart(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await KeepAlive.openAutoStartSettings()
  } catch { /* 忽略 */ }
}

/** 跳转本应用系统详情页（系统权限管理入口） */
export async function openAppSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await KeepAlive.openAppSettings()
  } catch { /* 忽略 */ }
}

/**
 * 首次启动是否需要弹保活引导：
 * 仅原生环境 + 未标记已引导 + 尚未加入白名单时为 true。
 */
export async function needsKeepAliveGuide(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    if (localStorage.getItem(GUIDE_KEY) === '1') return false
  } catch { /* 忽略 */ }
  return !(await isIgnoringBattery())
}

/** 标记已完成保活引导（点「我已设置」后调用，不再自动弹出） */
export function markGuided(): void {
  try {
    localStorage.setItem(GUIDE_KEY, '1')
  } catch { /* 忽略 */ }
}
