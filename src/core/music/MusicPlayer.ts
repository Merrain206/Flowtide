/**
 * Flowtide 音乐引擎 —— 本地音乐播放器
 *
 * 基于 HTMLAudioElement，负责本地导入曲目的播放与队列管理；
 * 支持"专注联动"：专注/心流阶段自动把歌曲音量平滑压低（ducking），
 * 休息/待命时恢复 —— 这是音乐与专注引擎的第一次真正联动。
 *
 * 注：本地文件通过 ObjectURL 播放，刷新页面后需重新导入
 * （浏览器无法持久化文件句柄，v0.2 Tauri 版将支持记住本地曲库）。
 */

export interface Track {
  id: string
  name: string
  url: string
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
      })
    }
    // 首次导入自动定位到第一首（不自动播放，把决定权留给用户）
    if (this.currentIndex === -1 && this.tracks.length > 0) {
      this.currentIndex = 0
      this.audio.src = this.tracks[0].url
    }
    this.notify()
  }

  removeTrack(id: string) {
    const idx = this.tracks.findIndex((t) => t.id === id)
    if (idx === -1) return
    const removingCurrent = idx === this.currentIndex
    URL.revokeObjectURL(this.tracks[idx].url)
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
    this.audio.src = this.tracks[index].url
    void this.audio.play()
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
