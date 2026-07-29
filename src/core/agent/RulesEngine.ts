/**
 * Agent 编排层 —— 规则引擎
 *
 * 架构蓝图中的"双轨制"之规则兜底：
 *   Sense  —— 每个 tick 从各引擎采集 SensorReading
 *   Plan   —— 跑所有 enabled 的 Rule，收集 AgentAction[]
 *   Act    —— 统一执行动作（applyPreset / setDuck / playChime / notify）
 *
 * 所有规则都是纯函数 (reading, prev) -> actions[]，
 * 引擎只负责采集 + 执行，方便后续替换或增加 LLM 决策层。
 */

import type { FocusEngine } from '../focus/FocusEngine'
import type { FocusEvent } from '../focus/types'
import type { SoundscapeMixer } from '../audio/SoundscapeMixer'
import { PRESETS } from '../audio/types'
import type { MusicPlayer } from '../music/MusicPlayer'
import type { AgentAction, Rule, RuleEntry, SensorReading } from './types'
import { sendNotify } from './notify'
import { buildEnergyProfile, isTroughHour, isPeakHour, type EnergyProfile } from './EnergyModel'
import type { TaskEngine } from '../task/TaskEngine'
import { getSessions } from '../storage/db'
import { createLLMAdapter, isLLMEnabled } from './LLMAdapter'
import { buildAgentPrompt } from './prompt-builder'

// ── 内置规则 ──────────────────────────────────────────────

/** 声景随阶段自动切换 */
const phaseSoundscapeRule: Rule = (reading, prev) => {
  if (reading.phase === prev.phase) return []
  const actions: AgentAction[] = []

  if (reading.phase === 'focus' && prev.phase !== 'focus') {
    actions.push({ type: 'applyPreset', name: PRESETS[0].name })
  }
  if (
    (reading.phase === 'shortBreak' || reading.phase === 'longBreak') &&
    prev.phase !== 'shortBreak' && prev.phase !== 'longBreak'
  ) {
    actions.push({ type: 'applyPreset', name: PRESETS[2].name })
  }
  // flow / idle -> 不动
  return actions
}

/** 音乐专注联动：focus/flow 阶段压低音量 */
const musicDuckRule: Rule = (reading, prev) => {
  if (!reading.duckEnabled) return []
  const wasDucked = prev.phase === 'focus' || prev.phase === 'flow'
  const shouldDuck = reading.phase === 'focus' || reading.phase === 'flow'
  if (shouldDuck && !wasDucked) return [{ type: 'setDuck', ducked: true }]
  if (!shouldDuck && wasDucked) return [{ type: 'setDuck', ducked: false }]
  return []
}

/** 提示音：阶段转换时播短促提示 */
const chimeRule: Rule = () => [] // 事件驱动，不走 tick，通过 onEvent 处理

/** 精力建议规则：低谷时段进入专注时提示 */
const energySuggestionRule: Rule = (reading, prev) => {
  // 仅在专注刚启动时建议
  if (reading.phase !== 'focus' || prev.phase === 'focus') return []
  const hour = reading.currentHour ?? new Date().getHours()
  if (!reading.currentHour) return []
  // 需要精力画像，通过全局变量获取（在引擎内缓存）
  const profile = energyCache
  if (!profile || !profile.sufficient) return []
  if (isTroughHour(profile, hour)) {
    return [{ type: 'suggest', message: '当前是你的低谷时段，试试短一点的专注？' }]
  }
  return []
}

/** 任务感知规则：任务认知度 + 精力时段匹配建议 */
const taskAwarenessRule: Rule = (reading, prev) => {
  if (reading.phase !== 'focus' || prev.phase === 'focus') return []
  if (!reading.currentTask) return []
  const hour = reading.currentHour ?? new Date().getHours()
  const profile = energyCache
  if (!profile || !profile.sufficient) return []

  const actions: AgentAction[] = []
  if (reading.currentTask.cognition === 'high' && isTroughHour(profile, hour)) {
    actions.push({ type: 'suggest', message: `「${reading.currentTask.title}」是高认知任务，建议等精力恢复再做` })
  }
  if (reading.currentTask.cognition === 'low' && isPeakHour(profile, hour)) {
    actions.push({ type: 'suggest', message: `高峰期处理「${reading.currentTask.title}」有点浪费哦` })
  }
  return actions
}

/** 连续专注规则：连续 3 轮以上未跳过休息 → 建议短一点 */
const longSessionRule: Rule = (reading, prev) => {
  if (reading.phase !== 'focus' || prev.phase === 'focus') return []
  if ((reading.consecutiveSessions ?? 0) >= 3) {
    return [{ type: 'suggest', message: '连续高强度了，下一轮试试短一点的专注？' }]
  }
  return []
}

/** 休息音乐联动（v0.8）：进入休息自动降速舒缓，离开恢复；默认关闭 */
const breakSootheRule: Rule = (reading, prev) => {
  const isBreak = reading.phase === 'shortBreak' || reading.phase === 'longBreak'
  const wasBreak = prev.phase === 'shortBreak' || prev.phase === 'longBreak'
  if (isBreak && !wasBreak) return [{ type: 'setSoothe', on: true }]
  if (!isBreak && wasBreak) return [{ type: 'setSoothe', on: false }]
  return []
}

// ── 精力画像缓存（从 IDB 加载一次） ──────────────────

export let energyCache: EnergyProfile | null = null

async function loadEnergyProfile() {
  try {
    const now = Date.now()
    const sessions = await getSessions(now - 30 * 86_400_000, now)
    energyCache = buildEnergyProfile(sessions)
  } catch {
    energyCache = null
  }
}

// ── 规则引擎 ──────────────────────────────────────────────

export class RulesEngine {
  private rules: Map<string, RuleEntry> = new Map()
  private prevReading: SensorReading
  private unsubscribers: (() => void)[] = []
  private consecutiveSessions = 0
  /** 当前 suggest 消息（供 UI 订阅） */
  private suggestMessage: string | null = null
  private suggestListeners: Set<(msg: string | null) => void> = new Set()
  private focus: FocusEngine
  private soundscape: SoundscapeMixer
  private music: MusicPlayer
  private taskEng: TaskEngine | undefined

  constructor(
    focus: FocusEngine,
    soundscape: SoundscapeMixer,
    music: MusicPlayer,
    taskEng?: TaskEngine,
  ) {
    this.focus = focus
    this.soundscape = soundscape
    this.music = music
    this.taskEng = taskEng
    // 注册内置规则
    this.addRule('phaseSoundscape', phaseSoundscapeRule)
    this.addRule('musicDuck', musicDuckRule)
    this.addRule('chime', chimeRule)
    this.addRule('energySuggestion', energySuggestionRule)
    this.addRule('taskAwareness', taskAwarenessRule)
    this.addRule('longSession', longSessionRule)
    this.addRule('breakSoothe', breakSootheRule, false)

    // 初始读数
    this.prevReading = this.sense()

    // 订阅专注引擎的 tick（状态变化）
    this.unsubscribers.push(
      this.focus.subscribe(() => this.tick()),
    )

    // 订阅专注引擎的事件（阶段转换）
    this.unsubscribers.push(
      this.focus.onEvent((event) => this.handleEvent(event)),
    )

    // 异步加载精力画像
    void loadEnergyProfile()
  }

  /** 销毁引擎，取消所有订阅 */
  destroy() {
    this.unsubscribers.forEach((unsub) => unsub())
    this.unsubscribers = []
  }

  // ── 规则管理 ──────────────────────────────────────────

  addRule(name: string, rule: Rule, enabled = true) {
    this.rules.set(name, { name, enabled, rule })
  }

  removeRule(name: string) {
    this.rules.delete(name)
  }

  enableRule(name: string, enabled: boolean) {
    const entry = this.rules.get(name)
    if (entry) entry.enabled = enabled
  }

  isRuleEnabled(name: string): boolean {
    return this.rules.get(name)?.enabled ?? false
  }

  // ── Sense -> Plan -> Act ────────────────────────────────

  /** 采集当前传感器读数 */
  private sense(): SensorReading {
    const focusSnap = this.focus.snapshot()
    const musicSnap = this.music.snapshot()
    const soundSnap = this.soundscape.snapshot()
    const current = this.taskEng?.peekCurrent() ?? null
    return {
      phase: focusSnap.phase,
      duckEnabled: musicSnap.duckEnabled,
      soundscapePlaying: soundSnap.playing,
      currentTask: current ? { title: current.title, cognition: current.cognition } : undefined,
      currentHour: new Date().getHours(),
      consecutiveSessions: this.consecutiveSessions,
    }
  }

  /** 每个 tick：采集 -> 跑规则 -> 执行 + 可选 LLM 补充 */
  private tick() {
    const reading = this.sense()
    const actions: AgentAction[] = []

    for (const entry of this.rules.values()) {
      if (!entry.enabled) continue
      actions.push(...entry.rule(reading, this.prevReading))
    }

    this.execute(actions)
    this.prevReading = reading

    // 异步 LLM 补充建议（不阻塞 tick）
    if (isLLMEnabled()) {
      this.requestLLMSuggest(reading).catch(() => { /* 静默降级 */ })
    }
  }

  /** 异步调用 LLM 补充一条 suggest 动作 */
  private async requestLLMSuggest(reading: SensorReading) {
    const adapter = createLLMAdapter()
    const now = Date.now()
    const sessions = await getSessions(now - 7 * 86_400_000, now).catch(() => [])
    const tasks = this.taskEng?.snapshot().tasks ?? []
    const prompt = buildAgentPrompt(reading, energyCache, sessions, tasks)
    const msg = await adapter.suggest(prompt)
    if (msg) this.setSuggest(msg)
  }

  /** 处理专注事件（阶段转换） */
  private handleEvent(event: FocusEvent) {
    const actions: AgentAction[] = []

    // 连续专注计数：breakStarted = 完成了一轮专注
    if (event.type === 'breakStarted') {
      this.consecutiveSessions++
    }
    // 跳过休息 = 重置计数（breakEnded 发生在休息提前结束时）
    // 注：自然结束也会触发 breakEnded，这里简化处理：breakStarted 时增加，focusStarted 时保持
    // 用户实际跳过与否在 v0.4 简化为计数累计，等 v0.5 精确追踪

    // 提示音
    if (event.type === 'flowStarted') {
      actions.push({ type: 'playChime', style: 'gentle' })
    }
    if (event.type === 'breakStarted' || event.type === 'breakEnded' || event.type === 'focusStarted') {
      actions.push({ type: 'playChime', style: 'normal' })
    }

    // 浏览器通知（仅标签页不可见时发送）
    if (typeof document !== 'undefined' && document.hidden) {
      const notify = eventToNotify(event, this.focus.snapshot())
      if (notify) actions.push({ type: 'notify', ...notify })
    }

    this.execute(actions)
  }

  /** 统一执行动作 */
  private execute(actions: AgentAction[]) {
    for (const action of actions) {
      switch (action.type) {
        case 'applyPreset': {
          const preset = PRESETS.find((p) => p.name === action.name)
          if (preset) this.soundscape.applyPreset(preset)
          break
        }
        case 'setDuck':
          this.music.setDucked(action.ducked)
          break
        case 'playChime':
          playChime(action.style)
          break
        case 'notify':
          sendNotify(action.title, action.body)
          break
        case 'suggest':
          this.setSuggest(action.message)
          break
        case 'setSoothe':
          this.music.setSoothe(action.on)
          break
      }
    }
  }

  // ── suggest 消息订阅 ──────────────────────────────────

  private setSuggest(msg: string | null) {
    this.suggestMessage = msg
    this.suggestListeners.forEach((fn) => fn(msg))
  }

  getSuggest(): string | null {
    return this.suggestMessage
  }

  subscribeSuggest(fn: (msg: string | null) => void): () => void {
    this.suggestListeners.add(fn)
    return () => { this.suggestListeners.delete(fn) }
  }

  dismissSuggest() {
    this.setSuggest(null)
  }

  getConsecutiveSessions(): number {
    return this.consecutiveSessions
  }
}

// ── 辅助函数 ──────────────────────────────────────────────

/** 提示音：用独立 AudioContext 播短促和弦，不干扰声景混音图 */
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
    // 无手势解锁时静默失败
  }
}

/** 将 FocusEvent 映射为通知内容 */
function eventToNotify(
  event: FocusEvent,
  snap: { config: { focusMinutes: number }; nextBreakMs: number },
): { title: string; body: string } | null {
  switch (event.type) {
    case 'focusStarted':
      return { title: '🎯 专注开始', body: `${snap.config.focusMinutes} 分钟专注已启动` }
    case 'flowStarted':
      return { title: '🌊 进入心流', body: '到点了，但不打扰你' }
    case 'breakStarted':
      return { title: '☕ 休息一下', body: `本轮完成，休息 ${Math.round(snap.nextBreakMs / 60000)} 分钟` }
    case 'breakEnded':
      return { title: '⏰ 休息结束', body: '准备好了就开始下一轮' }
    default:
      return null
  }
}
