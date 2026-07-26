/**
 * 网易云音乐官方外链播放器工具
 *
 * 网易云官方提供 outchain iframe 嵌入（合法途径），
 * 这里负责从用户粘贴的分享链接/ID 中解析出嵌入参数。
 * 注意：部分版权受限歌曲外链只能试听，属平台限制。
 */

export interface NeteaseEmbed {
  type: 'song' | 'playlist'
  id: string
}

/** 解析用户输入：完整分享链接 / 纯数字 ID 均可 */
export function parseNeteaseInput(input: string): NeteaseEmbed | null {
  const s = input.trim()
  if (!s) return null
  // 纯数字默认按单曲处理
  if (/^\d+$/.test(s)) return { type: 'song', id: s }

  const playlist = s.match(/playlist\?id=(\d+)/) ?? s.match(/playlist\/(\d+)/)
  if (playlist) return { type: 'playlist', id: playlist[1] }

  const song = s.match(/song\?id=(\d+)/) ?? s.match(/song\/(\d+)/)
  if (song) return { type: 'song', id: song[1] }

  const anyId = s.match(/id=(\d+)/)
  if (anyId) return { type: 'song', id: anyId[1] }
  return null
}

export function neteaseEmbedUrl(embed: NeteaseEmbed): string {
  return embed.type === 'song'
    ? `https://music.163.com/outchain/player?type=2&id=${embed.id}&auto=0&height=66`
    : `https://music.163.com/outchain/player?type=0&id=${embed.id}&auto=0&height=430`
}

export function neteaseEmbedHeight(embed: NeteaseEmbed): number {
  return embed.type === 'song' ? 86 : 450
}
