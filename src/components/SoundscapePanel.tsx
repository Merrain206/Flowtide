/**
 * 声景控制台 —— 预设切换 + 分层混音控制
 */

import { soundscape, useSoundscape } from '../hooks/useEngines'
import type { LayerId } from '../core/audio/types'
import { LAYER_VARIANTS, PRESETS } from '../core/audio/types'

const LAYER_META: Record<LayerId, { label: string; desc: string }> = {
  base: { label: '基底层', desc: '宽频环境音' },
  ambience: { label: '氛围层', desc: '空间感' },
  pulse: { label: '律动层', desc: '低频嗡鸣' },
}

const VARIANT_LABELS: Record<string, string> = {
  rain: '雨声',
  stream: '溪流',
  white: '白噪',
  wind: '微风',
  cafe: '咖啡馆',
  deep: '深沉',
  soft: '轻柔',
  off: '关闭',
}

export function SoundscapePanel() {
  const state = useSoundscape()

  return (
    <section className="panel sound-panel">
      <header className="panel-head">
        <span className="sec-no">03</span>
        <h2 className="panel-title">声景</h2>
        <button
          className={`btn ${state.playing ? '' : 'primary'}`}
          onClick={() => soundscape.toggle()}
        >
          {state.playing ? '■ 停止' : '▶ 播放'}
        </button>
      </header>

      <div className="preset-row">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            className={`preset-chip ${state.preset === p.name ? 'active' : ''}`}
            title={p.description}
            onClick={() => soundscape.applyPreset(p)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="layer-list">
        {(Object.keys(LAYER_META) as LayerId[]).map((id) => {
          const layer = state.layers[id]
          const meta = LAYER_META[id]
          return (
            <div className="layer-row" key={id}>
              <div className="layer-info">
                <span className="layer-label">{meta.label}</span>
                <span className="layer-desc">{meta.desc}</span>
              </div>
              <div className="variant-row">
                {LAYER_VARIANTS[id].map((v) => (
                  <button
                    key={v}
                    className={`variant-chip ${layer.variant === v ? 'active' : ''}`}
                    onClick={() => soundscape.setLayerVariant(id, v)}
                  >
                    {VARIANT_LABELS[v]}
                  </button>
                ))}
              </div>
              <input
                type="range"
                className="slider"
                min={0}
                max={100}
                value={Math.round(layer.volume * 100)}
                disabled={layer.variant === 'off'}
                onChange={(e) => soundscape.setLayerVolume(id, Number(e.target.value) / 100)}
                aria-label={`${meta.label}音量`}
              />
            </div>
          )
        })}
      </div>

      <div className="master-row">
        <span className="layer-label">总音量</span>
        <input
          type="range"
          className="slider"
          min={0}
          max={100}
          value={Math.round(state.masterVolume * 100)}
          onChange={(e) => soundscape.setMasterVolume(Number(e.target.value) / 100)}
          aria-label="总音量"
        />
      </div>
    </section>
  )
}
