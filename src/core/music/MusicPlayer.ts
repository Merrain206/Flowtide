/**
 * Flowtide 音乐引擎 —— 本地音乐播放器
 *
 * 基于 HTMLAudioElement，负责本地导入曲目的播放与队列管理；
 * 支持"专注联动"：专注/心流阶段自动把歌曲音量平滑压低（ducking），
 * 休息/待命时恢复 —— 这是音乐与专注引擎的第一次真正联动。
 *
 * 注：本地文件通过 ObjectURL 播放，刷新页面后需重新导入
 * （浏览器无法持久化文件句柄，Tauri 版将支持记住本地曲库）。
 */

export interface Track {
  id: string
  name: string
  url: string
  /** local = 本地导入文件；netease = 网易云直链（url 为空时播放前懒解析） */
  source: 'local' | 'netease'
  /** 演唱者（网易云曲目才有） */
  artist?: string
}

export interface MusicState {
  tracks: Track[]
  /** 当前曲目下标，-1 = 无 */
  currentIndex: number
  playing: boolean
  /** 用户设定音量 0..1 */
  volume: number
  /** 是否启用专注联动压音 */
  duckEnabled: boolean
  /** 当前是否处于压音状态 */
  ducked: boolean
  /** 播放进度（秒） */
  currentTime: number
  duration: number
}

export type MusicListener = (state: MusicState) => void

const PREF_KEY = 'flowtide.music.pref.v1'
/** 压音时的音量倍率 */
const DUCK_FACTOR = 0.4
/** 音量渐变时长 ms */
const FADE_MS = 800

export class MusicPlayer {
  private audio = new Audio()
  private tracks: Track[] = []
  private currentIndex = -1
  private volume = 0.7
  private duckEnabled = true
  private ducked = false
  private fadeTimer: ReturnType<typeof setInterval> | null = null
  private listeners = new Set<MusicListener>()
  /** 网易云直链懒解析器（外部注入，核心层不依赖 API 模块） */
  private urlResolver: ((id: string) => Promise<string | null>) | null = null
  /** 懒解析令牌：解析期间用户切歌时作废旧请求 */
  private resolveToken = 0

  constructor() {
    const pref = loadPref()
    this.volume = pref.volume
    this.duckEnabled = pref.duckEnabled
    this.audio.volume = this.volume

    this.audio.addEventListener('timeupdate', () => this.notify())
    this.audio.addEventListener('loadedmetadata', () => this.notify())
    this.audio.addEventListener('ended', () => this.next())
    this.audio.addEventListener('play', () => this.notify())
    this.audio.addEventListener('pause', () => this.notify())
  }

  subscribe(fn: MusicListener): () => void {
    this.listeners.add(fn)
    fn(this.snapshot())
    return () => this.listeners.delete(fn)
  }

  // ── 曲目管理 ──────────────────────────────────────────

  addFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('audio/')) continue
      this.tracks.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name.replace(/\.[^.]+$/, ''),
        url: URL.createObjectURL(file),
        source: 'local',
      })
    }
    // 首次导入自动定位到第一首（不自动播放，把决定权留给用户）
    if (this.currentIndex === -1 && this.tracks.length > 0) {
      this.currentIndex = 0
      this.audio.src = this.tracks[0].url
    }
    this.notify()
  }

  /** 播放一首网易云直链曲目（入队并立即播放） */
  playRemote(track: { id: string; name: string; url: string; artist?: string }) {
    // 同一首已在队列则直接重新定位，避免重复入队
    const existing = this.tracks.findIndex((t) => t.source === 'netease' && t.id === track.id)
    if (existing !== -1) {
      this.tracks[existing] = { ...this.tracks[existing], url: track.url }
      this.select(existing)
      return
    }
    this.tracks.push({
      id: track.id,
      name: track.name,
      url: track.url,
      source: 'netease',
      artist: track.artist,
    })
    this.select(this.tracks.length - 1)
  }

  /** 注入网易云直链解析器（歌单导入曲目播放时懒拉取，直链会过期故不预先解析） */
  setUrlResolver(fn: (id: string) => Promise<string | null>) {
    this.urlResolver = fn
  }

  /** 批量导入网易云曲目（不带直链），返回实际新增数；已在队列的自动去重 */
  addRemoteTracks(list: { id: string; name: string; artist?: string }[]): number {
    let added = 0
    for (const t of list) {
      if (this.tracks.some((x) => x.source === 'netease' && x.id === t.id)) continue
      this.tracks.push({ id: t.id, name: t.name, url: '', source: 'netease', artist: t.artist })
      added++
    }
    // 首次导入自动定位到第一首（不自动播放，与本地导入一致）
    if (this.currentIndex === -1 && this.tracks.length > 0) {
      this.currentIndex = 0
    }
    if (added > 0) this.notify()
    return added
  }

  removeTrack(id: string) {
    const idx = this.tracks.findIndex((t) => t.id === id)
    if (idx === -1) return
    const removingCurrent = idx === this.currentIndex
    // 仅本地 ObjectURL 需要释放，网易云远程链接无需
    if (this.tracks[idx].url.startsWith('blob:')) URL.revokeObjectURL(this.tracks[idx].url)
    this.tracks.splice(idx, 1)

    if (removingCurrent) {
      this.audio.pause()
      if (this.tracks.length > 0) {
        this.currentIndex = Math.min(idx, this.tracks.length - 1)
        this.audio.src = this.tracks[this.currentIndex].url
      } else {
        this.currentIndex = -1
        this.audio.removeAttribute('src')
      }
    } else if (idx < this.currentIndex) {
      this.currentIndex -= 1
    }
    this.notify()
  }

  // ── 播放控制 ──────────────────────────────────────────

  select(index: number) {
    if (index < 0 || index >= this.tracks.length) return
    this.currentIndex = index
    const track = this.tracks[index]
    // 歌单导入的曲目无直链 → 播放时懒解析（每次现拉，避免直链过期）
    if (track.source === 'netease' && !track.url) {
      void this.resolveAndPlay(index, 0)
      return
    }
    this.audio.src = track.url
    void this.audio.play()
  }

  /** 懒解析直链并播放；受限曲目自动跳下一首（最多跳一圈防死循环） */
  private async resolveAndPlay(index: number, skipped: number) {
    const track = this.tracks[index]
    this.notify()
    const token = ++this.resolveToken
    const url = this.urlResolver
      ? await this.urlResolver(track.id).catch(() => null)
      : null
    // 解析期间用户已切歌 → 丢弃结果
    if (token !== this.resolveToken || this.currentIndex !== index) return
    if (url) {
      this.audio.src = url
      void this.audio.play()
      this.notify()
      return
    }
    if (skipped < this.tracks.length - 1) {
      const nextIdx = (index + 1) % this.tracks.length
      this.currentIndex = nextIdx
      const next = this.tracks[nextIdx]
      if (next.source === 'netease' && !next.url) {
        void this.resolveAndPlay(nextIdx, skipped + 1)
      } else {
        this.audio.src = next.url
        void this.audio.play()
      }
    }
  }

  toggle() {
    if (this.currentIndex === -1) return
    if (this.audio.paused) void this.audio.play()
    else this.audio.pause()
  }

  next() {
    if (this.tracks.length === 0) return
    this.select((this.currentIndex + 1) % this.tracks.length)
  }

  prev() {
    if (this.tracks.length === 0) return
    this.select((this.currentIndex - 1 + this.tracks.length) % this.tracks.length)
  }

  seek(seconds: number) {
    if (Number.isFinite(this.audio.duration)) {
      this.audio.currentTime = Math.min(Math.max(0, seconds), this.audio.duration)
    }
  }

  // ── 音量与专注联动 ────────────────────────────────────

  setVolume(volume: number) {
    this.volume = Math.min(1, Math.max(0, volume))
    this.applyVolume(false)
    this.persist()
    this.notify()
  }

  setDuckEnabled(enabled: boolean) {
    this.duckEnabled = enabled
    if (!enabled) this.ducked = false
    this.applyVolume(true)
    this.persist()
    this.notify()
  }

  /** 由专注引擎联动调用：进入专注 → 压低；离开 → 恢复 */
  setDucked(ducked: boolean) {
    const target = this.duckEnabled && ducked
    if (this.ducked === target) return
    this.ducked = target
    this.applyVolume(true)
    this.notify()
  }

  /** 休息舒缓模式（v0.8）：降低播放速率营造慢节奏，保持音高不变 */
  setSoothe(on: boolean) {
    this.audio.preservesPitch = true
    this.audio.playbackRate = on ? 0.85 : 1
  }

  /** 平滑渐变到目标音量，避免突兀 */
  private applyVolume(fade: boolean) {
    const target = this.volume * (this.ducked ? DUCK_FACTOR : 1)
    if (this.fadeTimer) {
      clearInterval(this.fadeTimer)
      this.fadeTimer = null
    }
    if (!fade) {
      this.audio.volume = target
      return
    }
    const start = this.audio.volume
    const startAt = Date.now()
    this.fadeTimer = setInterval(() => {
      const t = Math.min(1, (Date.now() - startAt) / FADE_MS)
      this.audio.volume = start + (target - start) * t
      if (t >= 1 && this.fadeTimer) {
        clearInterval(this.fadeTimer)
        this.fadeTimer = null
      }
    }, 50)
  }

  // ── 快照 ──────────────────────────────────────────────

  snapshot(): MusicState {
    return {
      tracks: [...this.tracks],
      currentIndex: this.currentIndex,
      playing: !this.audio.paused && this.currentIndex !== -1,
      volume: this.volume,
      duckEnabled: this.duckEnabled,
      ducked: this.ducked,
      currentTime: this.audio.currentTime || 0,
      duration: Number.isFinite(this.audio.duration) ? this.audio.duration : 0,
    }
  }

  private notify() {
    const snap = this.snapshot()
    this.listeners.forEach((fn) => fn(snap))
  }

  private persist() {
    localStorage.setItem(PREF_KEY, JSON.stringify({
      volume: this.volume,
      duckEnabled: this.duckEnabled,
    }))
  }
}

function loadPref(): { volume: number; duckEnabled: boolean } {
  try {
    const raw = localStorage.getItem(PREF_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<{ volume: number; duckEnabled: boolean }>) : {}
    return {
      volume: typeof parsed.volume === 'number' ? parsed.volume : 0.7,
      duckEnabled: parsed.duckEnabled ?? true,
    }
  } catch {
    return { volume: 0.7, duckEnabled: true }
  }
}
