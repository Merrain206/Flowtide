/**
 * 标签页标题倒计时（v0.9.4）—— 仅 Web 端
 *
 * 桌面浏览器里切到其他标签页时，标题栏就是唯一的进度入口：
 *   专注中  「▶ 24:35 专注中 · Flowtide」
 *   心流中  「🌊 心流中 · Flowtide」
 *   休息中  「☕ 04:12 休息中 · Flowtide」
 *   暂停    「⏸ 12:03 已暂停 · Flowtide」
 *   待命    恢复原始标题
 *
 * APK 端 WebView 无标签页概念（且已有灵动岛实况通知），空操作。
 */

import { Capacitor } from '@capacitor/core'
import type { FocusEngine } from '../focus/FocusEngine'

function fmt(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** 挂接专注引擎：Web 端把倒计时同步到 document.title */
export function initTabTitle(engine: FocusEngine): void {
  if (Capacitor.isNativePlatform() || typeof document === 'undefined') return

  const baseTitle = document.title
  let lastTitle = baseTitle

  engine.subscribe((snap) => {
    let title = baseTitle
    if (snap.phase !== 'idle') {
      const time = fmt(snap.remainingMs)
      if (snap.paused) title = `⏸ ${time} 已暂停 · Flowtide`
      else if (snap.phase === 'focus') title = `▶ ${time} 专注中 · Flowtide`
      else if (snap.phase === 'flow') title = `🌊 心流中 · Flowtide`
      else title = `☕ ${time} 休息中 · Flowtide`
    }
    // 每秒 tick 都会来快照，标题没变就不动 DOM
    if (title !== lastTitle) {
      lastTitle = title
      document.title = title
    }
  })
}
