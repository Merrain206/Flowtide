/**
 * 全局单例引擎 + React 桥接 hooks
 *
 * 引擎生命周期与页面一致（而非组件），组件只订阅快照。
 * Agent 规则引擎在此初始化，接管所有联动逻辑。
 */

import { useEffect, useSyncExternalStore } from 'react'
import { FocusEngine } from '../core/focus/FocusEngine'
import type { FocusSnapshot } from '../core/focus/types'
import { SoundscapeMixer } from '../core/audio/SoundscapeMixer'
import type { SoundscapeState } from '../core/audio/types'
import { MusicPlayer } from '../core/music/MusicPlayer'
import type { MusicState } from '../core/music/MusicPlayer'
import { RulesEngine } from '../core/agent/RulesEngine'
import { requestPermission } from '../core/agent/notify'
import { TaskEngine, type TaskSnapshot } from '../core/task/TaskEngine'
import { PlanEngine } from '../core/plan/PlanEngine'
import type { PlanSnapshot } from '../core/plan/types'
import { vibrate } from '../core/device/haptics'
import { acquireWakeLock, releaseWakeLock, armReacquire } from '../core/device/wakelock'
import { initNativeNotify } from '../core/device/native-notify'
import { initLiveTimer } from '../core/device/live-timer'
import { initSoundscapeSchedule } from '../core/audio/schedule'
import { songUrl } from '../core/music/netease-api'

export const focusEngine = new FocusEngine()
export const soundscape = new SoundscapeMixer()
export const musicPlayer = new MusicPlayer()

/** 任务引擎（v0.4） */
export const taskEngine = new TaskEngine()

/** 目标计划引擎（v0.7）：启动时自动派发今天的计划任务 */
export const planEngine = new PlanEngine(taskEngine)

/** Agent 规则引擎 —— 接管所有联动（压音 / 声景切换 / 提示音 / 通知 / 智能建议） */
export const rulesEngine = new RulesEngine(focusEngine, soundscape, musicPlayer, taskEngine)

// 设备震动反馈（v0.6 手环协同 MVP）：阶段转换时震动提醒，不支持的设备静默跳过
focusEngine.onEvent((event) => {
  vibrate(event.type)
})

// 屏幕常亮（v0.6）：专注/休息运行期间防止手机锁屏导致计时器被节流
focusEngine.subscribe((snap) => {
  if (snap.phase !== 'idle') void acquireWakeLock()
  else void releaseWakeLock()
})
armReacquire(() => focusEngine.snapshot().phase !== 'idle')

// 原生通知（v0.7 APK）：专注开始时预约到点通知，锁屏也可靠触发；Web 环境空操作
initNativeNotify(focusEngine)

// 灵动岛实况通知（v0.8）：专注/休息进度同步到状态栏胶囊与锁屏卡片；Web 环境空操作
initLiveTimer(focusEngine)

// 声景定时（v0.8）：跨时段自动切换预设（默认关闭，设置中开启）
initSoundscapeSchedule(soundscape)

// 歌单导入曲目的直链懒解析（v0.8）：播放时现拉，避免直链过期
musicPlayer.setUrlResolver((id) => songUrl(Number(id)))

// ── 专注引擎 ────────────────────────────────────────────

let focusSnap = focusEngine.snapshot()
focusEngine.subscribe((s) => {
  focusSnap = s
})

export function useFocus(): FocusSnapshot {
  return useSyncExternalStore(
    (onChange) => focusEngine.subscribe(onChange),
    () => focusSnap,
  )
}

// ── 声景混音器 ──────────────────────────────────────────

let soundSnap = soundscape.snapshot()
soundscape.subscribe((s) => {
  soundSnap = s
})

export function useSoundscape(): SoundscapeState {
  return useSyncExternalStore(
    (onChange) => soundscape.subscribe(onChange),
    () => soundSnap,
  )
}

// ── 音乐播放器 ──────────────────────────────────────────

let musicSnap = musicPlayer.snapshot()
musicPlayer.subscribe((s) => {
  musicSnap = s
})

export function useMusic(): MusicState {
  return useSyncExternalStore(
    (onChange) => musicPlayer.subscribe(onChange),
    () => musicSnap,
  )
}

// ── 通知权限初始化 ──────────────────────────────────────

export function useNotifyPermission() {
  useEffect(() => {
    // 延迟请求，等用户首次交互后再弹窗
    const timer = setTimeout(() => { void requestPermission() }, 3000)
    return () => clearTimeout(timer)
  }, [])
}

// ── 任务引擎（v0.4） ───────────────────────────────────────

let taskSnap = taskEngine.snapshot()
taskEngine.subscribe((s) => {
  taskSnap = s
})

export function useTasks(): TaskSnapshot {
  return useSyncExternalStore(
    (onChange) => taskEngine.subscribe(onChange),
    () => taskSnap,
  )
}

// ── 计划引擎（v0.7） ──────────────────────────────

let planSnap = planEngine.snapshot()
planEngine.subscribe((s) => {
  planSnap = s
})

export function usePlans(): PlanSnapshot {
  return useSyncExternalStore(
    (onChange) => planEngine.subscribe(onChange),
    () => planSnap,
  )
}

// ── Agent 智能建议（v0.4） ───────────────────────────────

let suggestSnap: string | null = rulesEngine.getSuggest()
rulesEngine.subscribeSuggest((msg) => {
  suggestSnap = msg
})

export function useSuggest(): string | null {
  return useSyncExternalStore(
    (onChange) => rulesEngine.subscribeSuggest(onChange),
    () => suggestSnap,
  )
}
