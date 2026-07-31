/**
 * 浏览器通知封装 —— 集成层
 *
 * 仅在标签页不可见 (document.hidden) 时发送，
 * 避免打扰正在查看页面的用户。
 */

/** 请求通知权限（应在用户手势后调用） */
export async function requestPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

/** 发送系统通知 */
export function sendNotify(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    new Notification(title, {
      body,
      // 跟随构建 base：在线尝鲜版部署在子路径，硬编码 /favicon.svg 会 404
      icon: import.meta.env.BASE_URL + 'favicon.svg',
      silent: false,
    })
  } catch {
    // 某些环境（如 iOS Safari）不支持 new Notification，静默失败
  }
}
