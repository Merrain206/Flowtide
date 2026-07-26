/**
 * Flowtide 音频引擎 —— 类型定义
 *
 * 分层混音架构：
 *   基底层(base)   —— 宽频环境音：雨声 / 溪流 / 白噪
 *   氛围层(ambience) —— 空间感：风声 / 咖啡馆低语感
 *   律动层(pulse)  —— 低信息量音调：双耳节拍风格的柔和嗡鸣
 * 各层音量可被用户或 Agent（v0.2）实时调节。
 */

export type LayerId = 'base' | 'ambience' | 'pulse'

/** 每层可选的音源变体（全部程序化生成，无版权素材） */
export const LAYER_VARIANTS = {
  base: ['rain', 'stream', 'white'] as const,
  ambience: ['wind', 'cafe', 'off'] as const,
  pulse: ['deep', 'soft', 'off'] as const,
}

export type BaseVariant = (typeof LAYER_VARIANTS.base)[number]
export type AmbienceVariant = (typeof LAYER_VARIANTS.ambience)[number]
export type PulseVariant = (typeof LAYER_VARIANTS.pulse)[number]

export interface LayerState {
  /** 0..1 */
  volume: number
  variant: string
}

export interface SoundscapeState {
  playing: boolean
  /** 总输出音量 0..1 */
  masterVolume: number
  layers: Record<LayerId, LayerState>
  /** 当前应用的预设名（手动调整后为 null） */
  preset: string | null
}

/** 声景预设 —— v0.2 起由 Agent 按专注阶段自动切换 */
export interface SoundscapePreset {
  name: string
  label: string
  description: string
  layers: Record<LayerId, LayerState>
}

export const PRESETS: SoundscapePreset[] = [
  {
    name: 'deepFocus',
    label: '深度专注',
    description: '雨声打底 + 低频嗡鸣，遮蔽环境干扰',
    layers: {
      base: { volume: 0.55, variant: 'rain' },
      ambience: { volume: 0.15, variant: 'wind' },
      pulse: { volume: 0.3, variant: 'deep' },
    },
  },
  {
    name: 'lightWork',
    label: '轻度工作',
    description: '咖啡馆氛围，适合邮件与杂务',
    layers: {
      base: { volume: 0.35, variant: 'stream' },
      ambience: { volume: 0.45, variant: 'cafe' },
      pulse: { volume: 0, variant: 'off' },
    },
  },
  {
    name: 'rest',
    label: '休息放松',
    description: '轻柔溪流 + 微风，帮助注意力落地',
    layers: {
      base: { volume: 0.4, variant: 'stream' },
      ambience: { volume: 0.3, variant: 'wind' },
      pulse: { volume: 0.15, variant: 'soft' },
    },
  },
]

export type SoundscapeListener = (state: SoundscapeState) => void
