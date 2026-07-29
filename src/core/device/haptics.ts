/**
 * 设备协同 —— 震动反馈（v0.6 MVP，v0.7 原生化）
 *
 * 手环+手机协同架构的第一级：阶段转换时震动提醒。
 *   - 手机浏览器 / PWA：Vibration API 直接生效（Android Chrome 等）
 *   - APK（Capacitor）：WebView 里 navigator.vibrate 无效，改走原生 Haptics 插件
 *   - 桌面浏览器：不支持，静默跳过
 *
 * 不同事件使用不同震动节奏，形成“触觉语言”：
 *   专注开始 = 短促单振；心流到点 = 两短一长；休息开始 = 长振×2
 */

import { Capacitor } from '@capacitor/core'
import { Haptics } from '@capacitor/haptics'

const HAPTICS_KEY = 'flowtide.haptics'

/** 震动节奏表（ms，交替 [振动, 停顿, 振动...]） */
const PATTERNS = {
  focusStarted: [120],                    // 短促单振：出发
  flowStarted: [80, 60, 80, 60, 240],     // 两短一长：到点但不打断
  breakStarted: [300, 150, 300],          // 长振×2：该休息了
  breakEnded: [100, 80, 100],             // 双短振：休息结束
  test: [100, 100, 100, 100, 300],        // 测试节奏
} as const

export type HapticEvent = keyof typeof PATTERNS

/** 当前设备是否支持震动 */
export function isHapticsSupported(): boolean {
  if (Capacitor.isNativePlatform()) return true
  return typeof navigator !== 'undefined' && 'vibrate' in navigator
}

/** 用户是否开启震动提醒（默认开） */
export function isHapticsEnabled(): boolean {
  try {
    return localStorage.getItem(HAPTICS_KEY) !== '0'
  } catch {
    return true
  }
}

export function setHapticsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(HAPTICS_KEY, enabled ? '1' : '0')
  } catch { /* 忽略 */ }
}

/**
 * 触发一次震动（不支持或已关闭时静默跳过）
 * @returns 是否实际触发了震动
 */
export function vibrate(event: HapticEvent): boolean {
  if (!isHapticsSupported() || !isHapticsEnabled()) return false
  if (Capacitor.isNativePlatform()) {
    // WebView 里 navigator.vibrate 是空操作，走原生插件按节奏逐段播放
    void playNativePattern(PATTERNS[event] as unknown as number[])
    return true
  }
  try {
    return navigator.vibrate(PATTERNS[event] as unknown as number[])
  } catch {
    return false
  }
}

/** 用原生 Haptics 模拟 [振、停、振...] 节奏 */
async function playNativePattern(pattern: number[]): Promise<void> {
  try {
    for (let i = 0; i < pattern.length; i++) {
      if (i % 2 === 0) {
        await Haptics.vibrate({ duration: pattern[i] })
        // vibrate 是异步触发，等震动时长走完再停顿
        await sleep(pattern[i])
      } else {
        await sleep(pattern[i])
      }
    }
  } catch { /* 插件不可用时静默跳过 */ }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
