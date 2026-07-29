/**
 * 音乐面板 —— 网易云扫码登录播放 + 本地音乐导入播放
 *
 * 网易云：通过自建 NeteaseCloudMusicApi 服务扫码登录，
 *         登录账号有 VIP 即可整曲播放 VIP 歌曲（非官方接口，仅个人自用）。
 * 两种来源都进同一个播放器，支持"专注联动"：专注/心流阶段自动压低歌曲音量。
 */

import { useEffect, useRef, useState } from 'react'
import { musicPlayer, useMusic } from '../hooks/useEngines'
import {
  clearCookie,
  getAccount,
  getApiBase,
  isLoggedIn,
  parsePlaylistId,
  ping,
  playlistTracks,
  qrCheck,
  qrCreate,
  qrKey,
  search,
  setCookie,
  songUrl,
} from '../core/music/netease-api'
import type { Account, NeteaseSong } from '../core/music/netease-api'

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
              <div className="track-meta">
                <span className="track-name">{t.name}</span>
                {t.artist && <span className="track-artist">{t.artist}</span>}
              </div>
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

      {state.tracks.length === 0 && (
        <div className="empty-state" style={{ padding: '20px 16px' }}>
          <div className="empty-emoji">🎧</div>
          <div className="empty-text">播放队列还是空的</div>
          <div className="empty-sub">拖入本地音频，或在下方粘贴网易云歌单导入</div>
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

// ── 网易云扫码登录 + 搜索 + 直链播放 ─────────────────────

function NeteaseTab() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn)
  const [account, setAccount] = useState<Account | null>(null)
  const [apiOk, setApiOk] = useState<boolean | null>(null)

  // 进入时探测 API 可达性 & 拉取账号
  useEffect(() => {
    ping().then(setApiOk)
    if (isLoggedIn()) getAccount().then(setAccount)
  }, [])

  // ── API 不可达提示 ──────────────────────────────────
  if (apiOk === false) {
    return (
      <div>
        <p className="embed-hint" style={{ color: '#e5484d' }}>
          API 服务不可达（{getApiBase()}），请在设置中检查 API 地址。
        </p>
      </div>
    )
  }

  // ── 未登录：展示扫码流程 ────────────────────────────
  if (!loggedIn) {
    return (
      <div>
        <p className="embed-hint">
          登录网易云账号（需有 VIP）即可完整播放 VIP 歌曲。
          扫码登录仅供个人自用，cookie 保存在本地。
        </p>
        <QrLogin
          onSuccess={async (cookie) => {
            setCookie(cookie)
            setLoggedIn(true)
            const acc = await getAccount()
            setAccount(acc)
          }}
        />
      </div>
    )
  }

  // ── 已登录：账号信息 + 搜索 + 结果列表 ──────────────
  return (
    <div>
      {/* 账号栏 */}
      <div className="account-bar">
        {account?.avatarUrl && (
          <img className="account-avatar" src={account.avatarUrl} alt="" width={28} height={28} style={{ borderRadius: '50%' }} />
        )}
        <span className="account-name">{account?.nickname ?? '已登录'}</span>
        {account?.vip && <span className="vip-badge">{account.vipLabel}</span>}
        <button
          className="btn ghost"
          style={{ marginLeft: 'auto', fontSize: 12 }}
          onClick={() => { clearCookie(); setLoggedIn(false); setAccount(null) }}
        >
          退出
        </button>
      </div>

      <SearchPlay />

      <PlaylistImport />
    </div>
  )
}

// ── 扫码登录子组件 ────────────────────────────────────────

function QrLogin({ onSuccess }: { onSuccess: (cookie: string) => void }) {
  const [qrImg, setQrImg] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('正在生成二维码…')
  const [error, setError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const startLogin = async () => {
    setError('')
    setStatus('正在生成二维码…')
    try {
      const key = await qrKey()
      const img = await qrCreate(key)
      setQrImg(img)
      setStatus('请用网易云 App 扫描二维码')

      pollRef.current = setInterval(async () => {
        try {
          const s = await qrCheck(key)
          if (s.code === 803 && s.cookie) {
            clearInterval(pollRef.current)
            setStatus('登录成功 ✓')
            onSuccess(s.cookie)
          } else if (s.code === 802) {
            setStatus('扫描成功，请在手机上确认…')
          } else if (s.code === 800) {
            clearInterval(pollRef.current)
            setQrImg(null)
            setStatus('二维码已过期，请点击刷新')
          }
        } catch (e) {
          clearInterval(pollRef.current)
          setError('轮询失败：' + (e instanceof Error ? e.message : '未知错误'))
        }
      }, 2000)
    } catch (e) {
      setError('生成二维码失败：' + (e instanceof Error ? e.message : '未知错误'))
      setStatus('')
    }
  }

  useEffect(() => {
    startLogin()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  return (
    <div className="qr-login">
      {qrImg ? (
        <img src={qrImg} alt="网易云登录二维码" className="qr-img" />
      ) : (
        <button className="btn primary" onClick={startLogin}>刷新二维码</button>
      )}
      {status && <p className="embed-hint">{status}</p>}
      {error && <p className="embed-hint" style={{ color: '#e5484d' }}>{error}</p>}
    </div>
  )
}

// ── 歌单导入子组件（v0.8） ────────────────────────────

function PlaylistImport() {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const doImport = async () => {
    const id = parsePlaylistId(input)
    if (!id) {
      setMsg('⚠️ 无法识别歌单，请粘贴歌单链接或数字 ID')
      return
    }
    setLoading(true)
    setMsg('')
    try {
      const songs = await playlistTracks(id)
      if (!songs.length) {
        setMsg('歌单为空或无法访问')
        return
      }
      const added = musicPlayer.addRemoteTracks(
        songs.map((s) => ({ id: String(s.id), name: s.name, artist: s.artist })),
      )
      setMsg(`✅ 已导入 ${added} 首（共 ${songs.length} 首，重复自动跳过），到「本地音乐」页播放`)
      setInput('')
    } catch (e) {
      setMsg('导入失败：' + (e instanceof Error ? e.message : '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="playlist-import" style={{ marginTop: 14 }}>
      <div className="embed-form">
        <input
          className="text-input"
          value={input}
          placeholder="粘贴歌单链接或 ID，整单导入播放队列…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doImport()}
        />
        <button className="btn primary" onClick={doImport} disabled={loading}>
          {loading ? '导入中…' : '导入歌单'}
        </button>
      </div>
      <p className="embed-hint" style={{ fontSize: 11 }}>
        曲目播放时才拉取直链（直链有时效）；受限曲目会自动跳过。
      </p>
      {msg && <p className="embed-hint">{msg}</p>}
    </div>
  )
}

// ── 搜索 + 播放子组件 ─────────────────────────────────────

function SearchPlay() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NeteaseSong[]>([])
  const [loading, setLoading] = useState(false)
  const [playing, setPlaying] = useState<string | null>(null) // 当前正在播放的歌曲 id
  const [error, setError] = useState('')

  const doSearch = async () => {
    const q = query.trim()
    if (!q) return
    setLoading(true)
    setError('')
    try {
      const songs = await search(q)
      setResults(songs)
      if (!songs.length) setError('未找到相关歌曲')
    } catch (e) {
      setError('搜索失败：' + (e instanceof Error ? e.message : '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  const play = async (song: NeteaseSong) => {
    setError('')
    try {
      const url = await songUrl(song.id)
      if (!url) {
        setError(`「${song.name}」无法获取播放链接（可能需要更高 VIP 等级或受版权限制）`)
        return
      }
      setPlaying(String(song.id))
      musicPlayer.playRemote({
        id: String(song.id),
        name: song.name,
        url,
        artist: song.artist,
      })
    } catch (e) {
      setError('获取播放链接失败：' + (e instanceof Error ? e.message : '未知错误'))
    }
  }

  return (
    <div className="search-play">
      <div className="embed-form">
        <input
          className="text-input"
          value={query}
          placeholder="搜索歌曲或歌手…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch()}
        />
        <button className="btn primary" onClick={doSearch} disabled={loading}>
          {loading ? '搜索中…' : '搜索'}
        </button>
      </div>
      {error && <p className="embed-hint" style={{ color: '#e5484d' }}>{error}</p>}

      {results.length > 0 && (
        <div className="track-list">
          {results.map((song) => (
            <div
              key={song.id}
              className={`track-item ${playing === String(song.id) ? 'active' : ''}`}
              onClick={() => play(song)}
            >
              <span>{playing === String(song.id) ? '🔊' : '♪'}</span>
              <div className="track-meta">
                <span className="track-name">{song.name}</span>
                <span className="track-artist">{song.artist} · {song.album}</span>
              </div>
              {!song.playable && <span className="unplayable">受限</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


