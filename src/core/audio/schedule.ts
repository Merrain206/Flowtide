/**
 * 声景定时（v0.8）—— 按时段自动切换声景预设
 *
 * 四个时段映射到现有 PRESETS，利用 SoundscapeMixer.applyPreset
 * 的平滑重建实现无感过渡：
 *   06-12 上午 → deepFocus（高效时段，雨声遮蔽）
 *   12-18 下午 → lightWork（咖啡馆氛围，抵抗午后倦怠）
 *   18-22 晚间 → rest（轻柔溪流，帮助收心）
 *   22-06 深夜 → deepFocus（深夜雨声，白噪助眠式专注）
 *
 * 设计约束：
 * - 默认关闭，设置中开启（localStorage 持久化）
 * - 仅在声景播放中才切换（不会突然出声）
 * - 只在「时段边界跨越」时应用一次，不与手动/Agent 的
 *   phaseSoundscape 规则抢预设（用户切走后本时段内不再覆盖）
 */

import type { SoundscapeMixer } from './SoundscapeMixer'
import { PRESETS, type SoundscapePreset } from './types'

const ENABLE_KEY = 'flowtide.soundscape.schedule.v1'
/** 检查间隔：每分钟一次，开销可忽略 */
const CHECK_INTERVAL_MS = 60_000

/** 时段 → 预设名映射（起始小时升序，最后一段跨零点） */
const SLOTS: { fromHour: number; preset: string; label: string }[] = [
  { fromHour: 6, preset: 'deepFocus', label: '上午' },
  { fromHour: 12, preset: 'lightWork', label: '下午' },
  { fromHour: 18, preset: 'rest', label: '晚间' },
  { fromHour: 22, preset: 'deepFocus', label: '深夜' },
]

/** 取某小时所属的时段（22-06 跨零点归深夜段） */
export function slotForHour(hour: number): { fromHour: number; preset: string; label: string } {
  let matched = SLOTS[SLOTS.length - 1]
  for (const slot of SLOTS) {
    if (hour >= slot.fromHour) matched = slot
  }
  return matched
}

export function isScheduleEnabled(): boolean {
  return localStorage.getItem(ENABLE_KEY) === '1'
}

export function setScheduleEnabled(enabled: boolean) {
  if (enabled) localStorage.setItem(ENABLE_KEY, '1')
  else localStorage.removeItem(ENABLE_KEY)
}

/** 当前时段对应的预设描述（设置面板展示用） */
export function currentSlotLabel(): string {
  const slot = slotForHour(new Date().getHours())
  const preset = PRESETS.find((p) => p.name === slot.preset)
  return `${slot.label} → ${preset?.label ?? slot.preset}`
}

/**
 * 挂接定时检查：跨越时段边界且声景播放中时自动应用预设。
 * 返回清理函数（页面级单例通常不需要调用）。
 */
export function initSoundscapeSchedule(mixer: SoundscapeMixer): () => void {
  // 启动时记录当前时段，只有跨段才触发，避免开关一开就抢用户的手动选择
  let lastSlotFrom = slotForHour(new Date().getHours()).fromHour

  const check = () => {
    const slot = slotForHour(new Date().getHours())
    if (slot.fromHour === lastSlotFrom) return
    lastSlotFrom = slot.fromHour
    if (!isScheduleEnabled()) return
    const snap = mixer.snapshot()
    if (!snap.playing) return
    if (snap.preset === slot.preset) return
    const preset: SoundscapePreset | undefined = PRESETS.find((p) => p.name === slot.preset)
    if (preset) mixer.applyPreset(preset)
  }

  const timer = setInterval(check, CHECK_INTERVAL_MS)
  return () => clearInterval(timer)
}
