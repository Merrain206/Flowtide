/**
 * 全局单例引擎 + React 桥接 hooks
 *
 * 引擎生命周期与页面一致（而非组件），组件只订阅快照。
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import { FocusEngine } from '../core/focus/FocusEngine'
import type { FocusEvent, FocusSnapshot } from '../core/focus/types'
import { SoundscapeMixer } from '../core/audio/SoundscapeMixer'
import type { SoundscapeState } from '../core/audio/types'

export const focusEngine = new FocusEngine()
export const soundscape = new SoundscapeMixer()

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

// ── 阶段联动副作用 ──────────────────────────────────────
// v0.1 内置最小的"环境管家"雏形：阶段切换时播放提示音。
// v0.2 将扩展为自动切换声景预设 / 系统勿扰。

export function useFocusEffects() {
  const [lastEvent, setLastEvent] = useState<FocusEvent | null>(null)

  useEffect(() => {
    return focusEngine.onEvent((event) => {
      setLastEvent(event)
      playChime(event.type === 'flowStarted' ? 'gentle' : 'normal')
    })
  }, [])

  return lastEvent
}

/** 用独立的短促 AudioContext 播提示音，不干扰声景混音图 */
function playChime(style: 'gentle' | 'normal') {
  try {
    const ctx = new AudioContext()
    const now = ctx.currentTime
    const freqs = style === 'gentle' ? [523.25, 659.25] : [659.25, 783.99] // C5+E5 / E5+G5
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, now + i * 0.18)
      gain.gain.linearRampToValueAtTime(0.12, now + i * 0.18 + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.9)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + i * 0.18)
      osc.stop(now + i * 0.18 + 1)
    })
    setTimeout(() => ctx.close(), 1600)
  } catch {
    // 无手势解锁时静默失败即可
  }
}
