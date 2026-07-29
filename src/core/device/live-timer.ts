/**
 * 灵动岛实况通知桥（v0.8 模块一）
 *
 * 订阅 FocusEngine，把专注/心流/休息进度实时同步到系统实况通知：
 *   - Android 16+：状态栏倒计时胶囊 + 锁屏实况卡片（Live Updates）
 *   - 旧系统：常驻通知 + 系统 chronometer 倒计时
 *
 * 刷新策略：仅在「阶段/暂停态/剩余分钟数」变化时 notify（分钟粒度），
 * 展开态的秒级跳动由系统 chronometer 负责，不产生逐秒 IPC。
 * Web 环境完全空操作。
 */

import { Capacitor, registerPlugin } from '@capacitor/core'
import type { FocusEngine } from '../focus/FocusEngine'

interface LiveTimerNative {
  start(opts: {
    title: string
    text: string
    chip: string
    endAt: number
    totalMs: number
    paused: boolean
  }): Promise<void>
  stop(): Promise<void>
  isPromotedSupported(): Promise<{ supported: boolean }>
  syncStats(opts: { cycles: number; minutes: number }): Promise<void>
}

const LiveTimer = registerPlugin<LiveTimerNative>('LiveTimer')

const LIVE_KEY = 'flowtide.livetimer'

/** 阶段 → 实况标题 */
const PHASE_TITLE: Record<string, string> = {
  focus: '专注中 🎯',
  flow: '心流中 🌊',
  shortBreak: '休息中 ☕',
  longBreak: '长休息 🌿',
}

/** 用户是否开启实况通知（默认开） */
export function isLiveTimerEnabled(): boolean {
  try {
    return localStorage.getItem(LIVE_KEY) !== '0'
  } catch {
    return true
  }
}

export function setLiveTimerEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(LIVE_KEY, enabled ? '1' : '0')
  } catch { /* 忽略 */ }
  if (!enabled) void LiveTimer.stop().catch(() => {})
}

/** 系统是否支持 Live Updates 促升（设置页提示用；旧系统返回 false） */
export async function checkPromotedSupport(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { supported } = await LiveTimer.isPromotedSupported()
    return supported
  } catch {
    return false
  }
}

/**
 * 挂接专注引擎。仅原生环境生效。
 */
export function initLiveTimer(engine: FocusEngine): void {
  if (!Capacitor.isNativePlatform()) return

  let lastKey = ''
  let lastStats = ''

  engine.subscribe((snap) => {
    // 今日统计同步给桌面小组件（变化时才跨桥）
    const minutes = Math.round(snap.today.focusMs / 60000)
    const statsKey = `${snap.today.cycles}:${minutes}`
    if (statsKey !== lastStats) {
      lastStats = statsKey
      void LiveTimer.syncStats({ cycles: snap.today.cycles, minutes }).catch(() => {})
    }

    if (!isLiveTimerEnabled()) return

    if (snap.phase === 'idle') {
      if (lastKey !== 'idle') {
        lastKey = 'idle'
        void LiveTimer.stop().catch(() => {})
      }
      return
    }

    const minute = Math.max(1, Math.ceil(snap.remainingMs / 60000))
    const key = `${snap.phase}:${snap.paused}:${minute}`
    if (key === lastKey) return
    lastKey = key

    void LiveTimer.start({
      title: PHASE_TITLE[snap.phase] ?? '进行中',
      text: snap.paused ? '已暂停 · 回 App 继续' : `剩余约 ${minute} 分钟`,
      chip: snap.paused ? '⏸ 暂停' : `${minute}分`,
      endAt: Date.now() + snap.remainingMs,
      totalMs: snap.totalMs,
      paused: snap.paused,
    }).catch(() => {})
  })
}
