/**
 * 设备协同 —— 屏幕常亮（Screen Wake Lock，v0.6）
 *
 * 手机上锁屏后 JS 定时器会被系统节流，番茄钟走时和到点通知都会失灵。
 * 专注期间保持屏幕常亮 = 通知桥接路线（浏览器通知 → 手环同步）的保活前提。
 *
 * 桌面浏览器同样支持但意义不大；不支持的环境静默降级。
 */

const WAKELOCK_KEY = 'flowtide.wakelock'

let sentinel: WakeLockSentinel | null = null

export function isWakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator
}

/** 用户是否开启专注期间屏幕常亮（默认开，仅在支持的设备生效） */
export function isWakeLockEnabled(): boolean {
  try {
    return localStorage.getItem(WAKELOCK_KEY) !== '0'
  } catch {
    return true
  }
}

export function setWakeLockEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(WAKELOCK_KEY, enabled ? '1' : '0')
  } catch { /* 忽略 */ }
  if (!enabled) void releaseWakeLock()
}

/** 请求屏幕常亮（幂等；页面不可见时会失败，交给 visibilitychange 重试） */
export async function acquireWakeLock(): Promise<boolean> {
  if (!isWakeLockSupported() || !isWakeLockEnabled()) return false
  if (sentinel && !sentinel.released) return true
  try {
    sentinel = await navigator.wakeLock.request('screen')
    return true
  } catch {
    return false
  }
}

export async function releaseWakeLock(): Promise<void> {
  try {
    await sentinel?.release()
  } catch { /* 忽略 */ }
  sentinel = null
}

/** 切回前台时自动重新上锁（系统会在页面隐藏时强制释放） */
let reacquireArmed = false

export function armReacquire(shouldHold: () => boolean): void {
  if (reacquireArmed || typeof document === 'undefined') return
  reacquireArmed = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && shouldHold()) {
      void acquireWakeLock()
    }
  })
}
