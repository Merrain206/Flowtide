/**
 * Flowtide 音频引擎 —— 分层声景混音器
 *
 * 音频图结构：
 *   [各变体音源链] → layerGain(×3) → masterGain → destination
 *
 * 所有音量变化都经 setTargetAtTime 平滑过渡，避免爆音；
 * AudioContext 延迟到首次播放时创建（浏览器自动播放策略要求用户手势）。
 */

import type { LayerId, LayerState, SoundscapeListener, SoundscapePreset, SoundscapeState } from './types'
import { PRESETS } from './types'
import { buildSource, type SourceChain } from './sources'

const SMOOTH = 0.08
const STATE_KEY = 'flowtide.soundscape.v1'
const LAYER_IDS: LayerId[] = ['base', 'ambience', 'pulse']

export class SoundscapeMixer {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private layerGains = new Map<LayerId, GainNode>()
  private chains = new Map<LayerId, SourceChain>()

  private playing = false
  private masterVolume = 0.8
  private layers: Record<LayerId, LayerState>
  private preset: string | null

  private listeners = new Set<SoundscapeListener>()

  constructor() {
    const saved = loadState()
    this.masterVolume = saved?.masterVolume ?? 0.8
    this.layers = saved?.layers ?? structuredClone(PRESETS[0].layers)
    this.preset = saved?.preset ?? PRESETS[0].name
  }

  subscribe(fn: SoundscapeListener): () => void {
    this.listeners.add(fn)
    fn(this.snapshot())
    return () => this.listeners.delete(fn)
  }

  // ── 播放控制 ──────────────────────────────────────────

  async play() {
    if (this.playing) return
    this.ensureContext()
    if (this.ctx!.state === 'suspended') await this.ctx!.resume()
    this.playing = true
    for (const id of LAYER_IDS) this.rebuildLayer(id)
    this.notify()
  }

  async stop() {
    if (!this.playing) return
    this.playing = false
    // 先淡出再拆链，避免爆音
    const master = this.masterGain
    if (this.ctx && master) {
      master.gain.setTargetAtTime(0, this.ctx.currentTime, SMOOTH)
      await sleep(250)
    }
    for (const id of LAYER_IDS) this.teardownLayer(id)
    if (this.ctx && master) {
      master.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, SMOOTH)
    }
    this.notify()
  }

  async toggle() {
    if (this.playing) await this.stop()
    else await this.play()
  }

  // ── 混音控制（用户或 Agent 调用） ─────────────────────

  setMasterVolume(volume: number) {
    this.masterVolume = clamp01(volume)
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, SMOOTH)
    }
    this.persistAndNotify()
  }

  setLayerVolume(id: LayerId, volume: number) {
    this.layers[id] = { ...this.layers[id], volume: clamp01(volume) }
    this.preset = null
    const gain = this.layerGains.get(id)
    if (this.ctx && gain) {
      gain.gain.setTargetAtTime(this.layers[id].volume, this.ctx.currentTime, SMOOTH)
    }
    this.persistAndNotify()
  }

  setLayerVariant(id: LayerId, variant: string) {
    if (this.layers[id].variant === variant) return
    this.layers[id] = { ...this.layers[id], variant }
    this.preset = null
    if (this.playing) this.rebuildLayer(id)
    this.persistAndNotify()
  }

  /** 应用预设（v0.3 起 Agent 按专注阶段调用） */
  applyPreset(preset: SoundscapePreset) {
    this.layers = structuredClone(preset.layers)
    this.preset = preset.name
    if (this.playing) {
      for (const id of LAYER_IDS) this.rebuildLayer(id)
    }
    this.persistAndNotify()
  }

  snapshot(): SoundscapeState {
    return {
      playing: this.playing,
      masterVolume: this.masterVolume,
      layers: structuredClone(this.layers),
      preset: this.preset,
    }
  }

  // ── 内部音频图管理 ────────────────────────────────────

  private ensureContext() {
    if (this.ctx) return
    this.ctx = new AudioContext()
    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = this.masterVolume
    this.masterGain.connect(this.ctx.destination)
    for (const id of LAYER_IDS) {
      const gain = this.ctx.createGain()
      gain.gain.value = this.layers[id].volume
      gain.connect(this.masterGain)
      this.layerGains.set(id, gain)
    }
  }

  /** 按当前 variant 重建某一层的音源链 */
  private rebuildLayer(id: LayerId) {
    this.teardownLayer(id)
    const gain = this.layerGains.get(id)
    if (!this.ctx || !gain) return
    gain.gain.setTargetAtTime(this.layers[id].volume, this.ctx.currentTime, SMOOTH)
    const chain = buildSource(this.ctx, gain, this.layers[id].variant)
    if (chain) this.chains.set(id, chain)
  }

  private teardownLayer(id: LayerId) {
    const chain = this.chains.get(id)
    if (chain) {
      chain.stop()
      this.chains.delete(id)
    }
  }

  private persistAndNotify() {
    saveState({
      playing: false,
      masterVolume: this.masterVolume,
      layers: this.layers,
      preset: this.preset,
    })
    this.notify()
  }

  private notify() {
    const snap = this.snapshot()
    this.listeners.forEach((fn) => fn(snap))
  }
}

// ── 工具 ────────────────────────────────────────────────

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v))
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function loadState(): SoundscapeState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    return raw ? (JSON.parse(raw) as SoundscapeState) : null
  } catch {
    return null
  }
}

function saveState(state: SoundscapeState) {
  localStorage.setItem(STATE_KEY, JSON.stringify(state))
}
