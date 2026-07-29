/**
 * 网易云音乐 —— 非官方 API 客户端
 *
 * 通过自建的 NeteaseCloudMusicApi 服务（部署在用户自己的服务器）
 * 实现扫码登录 → 取账号 cookie → 用 cookie 拉取歌曲直链 → 交给播放器播放。
 *
 * ⚠️ 该接口为逆向实现，非网易云官方授权，仅供个人自用；
 *    接口可能随时失效，且受版权/地区限制部分歌曲仍不可播放。
 *
 * 架构：纯前端不能直连网易云（跨域 + 请求签名），
 *      所有请求都打到可配置的 API 服务地址。
 */

const COOKIE_KEY = 'flowtide.netease.cookie.v1'
/**
 * 固定 API 地址（v0.9 锁定，不可配置）：
 * - 开发时通过 vite 代理 ( /ncm → merrain.cn 反代 )，避免跨域。
 * - 生产环境直连 merrain.cn 域名反代（服务器 IP 绝不出现在前端）。
 */
const DEFAULT_BASE = import.meta.env.DEV ? '/ncm' : 'https://merrain.cn/ncm'

// ── 配置：API 服务地址（固定） & 登录 cookie ──────────────

/** API 地址恒为固定值，用户不可覆盖（彻底锁定，避免 IP 外泄） */
export function getApiBase(): string {
  return DEFAULT_BASE
}

function getCookie(): string {
  return localStorage.getItem(COOKIE_KEY) || ''
}

export function setCookie(cookie: string) {
  localStorage.setItem(COOKIE_KEY, cookie)
}

export function clearCookie() {
  localStorage.removeItem(COOKIE_KEY)
}

export function isLoggedIn(): boolean {
  return !!getCookie()
}

// ── 底层请求 ──────────────────────────────────────────

async function api<T = unknown>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) usp.set(k, String(v))
  usp.set('timestamp', String(Date.now())) // 防缓存
  const cookie = getCookie()
  if (cookie) usp.set('cookie', cookie)

  const res = await fetch(`${getApiBase()}${path}?${usp.toString()}`)
  if (!res.ok) throw new Error(`接口返回 ${res.status}`)
  return res.json() as Promise<T>
}

/** 探测 API 服务是否可达 */
export async function ping(): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/?timestamp=${Date.now()}`)
    return res.ok
  } catch {
    return false
  }
}

// ── 扫码登录 ──────────────────────────────────────────

export async function qrKey(): Promise<string> {
  const r = await api<{ data: { unikey: string } }>('/login/qr/key')
  return r.data.unikey
}

/** 返回二维码图片（base64 data url） */
export async function qrCreate(key: string): Promise<string> {
  const r = await api<{ data: { qrimg: string } }>('/login/qr/create', { key, qrimg: 'true' })
  return r.data.qrimg
}

export interface QrStatus {
  /** 800=过期 801=待扫码 802=待确认 803=授权成功 */
  code: number
  message?: string
  cookie?: string
}

export async function qrCheck(key: string): Promise<QrStatus> {
  const r = await api<QrStatus>('/login/qr/check', { key })
  return r
}

// ── 账号信息 ──────────────────────────────────────────

export interface Account {
  nickname: string
  vip: boolean
  vipLabel: string
  avatarUrl?: string
}

export async function getAccount(): Promise<Account | null> {
  const r = await api<{
    profile?: { nickname: string; avatarUrl?: string }
    account?: { vipType?: number }
  }>('/user/account')
  if (!r.profile) return null
  const vipType = r.account?.vipType ?? 0
  return {
    nickname: r.profile.nickname,
    vip: vipType > 0,
    vipLabel: vipType > 0 ? '黑胶VIP' : '普通用户',
    avatarUrl: r.profile.avatarUrl,
  }
}

// ── 搜索与直链 ────────────────────────────────────────

export interface NeteaseSong {
  id: number
  name: string
  artist: string
  album: string
  /** 该账号是否有权限播放（无版权/需更高等级会为 false） */
  playable: boolean
}

interface RawArtist { name: string }
interface RawSong {
  id: number
  name: string
  artists?: RawArtist[]
  ar?: RawArtist[]
  album?: { name: string }
  al?: { name: string }
}

export async function search(keywords: string): Promise<NeteaseSong[]> {
  const r = await api<{ result?: { songs?: RawSong[] } }>('/search', { keywords, limit: 30 })
  const songs = r.result?.songs ?? []
  return songs.map((s) => ({
    id: s.id,
    name: s.name,
    artist: (s.artists ?? s.ar ?? []).map((a) => a.name).join(' / '),
    album: s.album?.name ?? s.al?.name ?? '',
    playable: true,
  }))
}

/** 取歌曲可播放直链；返回 null 表示无版权/无权限（如需 VIP 而账号非 VIP） */
export async function songUrl(id: number): Promise<string | null> {
  const r = await api<{ data?: { url: string | null }[] }>('/song/url/v1', { id, level: 'exhigh' })
  return r.data?.[0]?.url ?? null
}

// ── 歌单导入（v0.8） ──────────────────────────────────

/**
 * 从用户输入中解析歌单 ID：
 * 支持纯数字 ID、分享链接（…/playlist?id=xxx）、
 * App 分享文本（内含 https://y.music.163.com/m/playlist?id=xxx）。
 */
export function parsePlaylistId(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  if (/^\d+$/.test(text)) return text
  // 链接或分享文本中的 id= 参数（playlist 上下文优先）
  const byParam = text.match(/playlist[/?#&]*[^\d]*?id=(\d+)/i) ?? text.match(/[?&]id=(\d+)/)
  return byParam?.[1] ?? null
}

/** 拉取歌单全部曲目（上限 500 首，避免超大歌单拖垮队列） */
export async function playlistTracks(id: string): Promise<NeteaseSong[]> {
  const r = await api<{ songs?: RawSong[] }>('/playlist/track/all', { id, limit: 500 })
  const songs = r.songs ?? []
  return songs.map((s) => ({
    id: s.id,
    name: s.name,
    artist: (s.artists ?? s.ar ?? []).map((a) => a.name).join(' / '),
    album: s.album?.name ?? s.al?.name ?? '',
    playable: true,
  }))
}
