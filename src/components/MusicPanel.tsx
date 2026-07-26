/**
 * 音乐面板 —— 网易云官方外链嵌入 + 本地音乐导入播放
 *
 * 本地播放支持"专注联动"：专注/心流阶段自动压低歌曲音量。
 */

import { useRef, useState } from 'react'
import { musicPlayer, useMusic } from '../hooks/useEngines'
import { neteaseEmbedHeight, neteaseEmbedUrl, parseNeteaseInput } from '../core/music/netease'
import type { NeteaseEmbed } from '../core/music/netease'

const EMBED_KEY = 'flowtide.netease.embed.v1'

function loadEmbed(): NeteaseEmbed | null {
  try {
    const raw = localStorage.getItem(EMBED_KEY)
    return raw ? (JSON.parse(raw) as NeteaseEmbed) : null
  } catch {
    return null
  }
}

function fmtSec(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function MusicPanel() {
  const [tab, setTab] = useState<'netease' | 'local'>('local')

  return (
    <section className="panel music-panel">
      <header className="panel-head">
        <span className="sec-no">03</span>
        <h2 className="panel-title">音乐</h2>
      </header>

      <div className="tab-row">
        <button className={`tab ${tab === 'local' ? 'active' : ''}`} onClick={() => setTab('local')}>
          本地音乐
        </button>
        <button className={`tab ${tab === 'netease' ? 'active' : ''}`} onClick={() => setTab('netease')}>
          网易云
        </button>
      </div>

      {tab === 'local' ? <LocalTab /> : <NeteaseTab />}
    </section>
  )
}

// ── 本地音乐 ────────────────────────────────────────────

function LocalTab() {
  const state = useMusic()
  const fileRef = useRef<HTMLInputElement>(null)
  const current = state.tracks[state.currentIndex]

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) musicPlayer.addFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <div
        className="import-zone"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          if (e.dataTransfer.files.length) musicPlayer.addFiles(e.dataTransfer.files)
        }}
      >
        🎵 点击或拖入音频文件（mp3 / flac / wav…）
        <br />
        <span style={{ fontSize: 11 }}>文件仅在本地播放，不会上传 · 刷新后需重新导入</span>
      </div>

      {state.tracks.length > 0 && (
        <div className="track-list">
          {state.tracks.map((t, i) => (
            <div
              key={t.id}
              className={`track-item ${i === state.currentIndex ? 'active' : ''}`}
              onClick={() => musicPlayer.select(i)}
            >
              <span>{i === state.currentIndex && state.playing ? '🔊' : '♪'}</span>
              <span className="track-name">{t.name}</span>
              <button
                className="track-remove"
                onClick={(e) => {
                  e.stopPropagation()
                  musicPlayer.removeTrack(t.id)
                }}
                aria-label="移除"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {current && (
        <div className="player-bar">
          <button className="icon-btn" onClick={() => musicPlayer.prev()} aria-label="上一首">⏮</button>
          <button className="icon-btn play" onClick={() => musicPlayer.toggle()} aria-label="播放/暂停">
            {state.playing ? '⏸' : '▶'}
          </button>
          <button className="icon-btn" onClick={() => musicPlayer.next()} aria-label="下一首">⏭</button>
          <div className="progress-wrap">
            <input
              type="range"
              className="slider"
              min={0}
              max={Math.max(1, Math.floor(state.duration))}
              value={Math.floor(state.currentTime)}
              onChange={(e) => musicPlayer.seek(Number(e.target.value))}
              aria-label="播放进度"
            />
            <div className="progress-time">
              <span>{fmtSec(state.currentTime)}</span>
              <span>{fmtSec(state.duration)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="music-volume-row">
        <span className="layer-label">音量</span>
        <input
          type="range"
          className="slider"
          min={0}
          max={100}
          value={Math.round(state.volume * 100)}
          onChange={(e) => musicPlayer.setVolume(Number(e.target.value) / 100)}
          aria-label="音乐音量"
        />
      </div>

      <div className="duck-row">
        <span>🌿</span>
        <span>
          <span className="duck-title">专注联动</span>
          {' '}· 专注时自动压低歌曲音量{state.ducked ? '（生效中）' : ''}
        </span>
        <button
          className={`switch ${state.duckEnabled ? 'on' : ''}`}
          onClick={() => musicPlayer.setDuckEnabled(!state.duckEnabled)}
          aria-label="切换专注联动"
        />
      </div>
    </div>
  )
}

// ── 网易云外链 ──────────────────────────────────────────

function NeteaseTab() {
  const [embed, setEmbed] = useState<NeteaseEmbed | null>(loadEmbed)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')

  const apply = () => {
    const parsed = parseNeteaseInput(input)
    if (!parsed) {
      setError('无法识别，请粘贴网易云歌曲/歌单分享链接或数字 ID')
      return
    }
    setError('')
    setEmbed(parsed)
    localStorage.setItem(EMBED_KEY, JSON.stringify(parsed))
    setInput('')
  }

  return (
    <div>
      <div className="embed-form">
        <input
          className="text-input"
          value={input}
          placeholder="粘贴网易云歌曲/歌单链接，如 https://music.163.com/#/song?id=..."
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
        />
        <button className="btn primary" onClick={apply}>嵌入</button>
      </div>
      {error && <p className="embed-hint" style={{ color: '#e5484d' }}>{error}</p>}
      <p className="embed-hint">
        使用网易云官方外链播放器，音乐版权归平台所有；部分受限歌曲仅可试听。
        在网易云 App/网页中点「分享 → 复制链接」即可获得。
      </p>
      {embed && (
        <iframe
          key={`${embed.type}-${embed.id}`}
          className="embed-frame"
          title="网易云音乐播放器"
          src={neteaseEmbedUrl(embed)}
          height={neteaseEmbedHeight(embed)}
        />
      )}
    </div>
  )
}
