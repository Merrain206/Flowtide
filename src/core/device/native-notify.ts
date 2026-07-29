/**
 * 原生通知桥（v0.7 模块五）—— Capacitor LocalNotifications
 *
 * Web 端的 Notification 在锁屏/杀后台后无法触发，
 * 原生环境改为「专注开始时预约到点通知」：即使 App 被杀，
 * 系统也会准点弹通知（手环通知镜像白名单加 Flowtide 即可震动提醒）。
 *
 * Web 环境完全不受影响，继续走现有 notify.ts 路径。
 */

import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import type { FocusEngine } from '../focus/FocusEngine'
import type { FocusPhase } from '../focus/types'

/** 预约通知的固定 ID：同 ID 重复 schedule 会自动覆盖 */
const ID_FOCUS_END = 1001
const ID_BREAK_END = 1002

/** 通知渠道：Android 8+ 的声音/震动由渠道决定，默认渠道不震动 */
const CHANNEL_ID = 'flowtide-alerts'

async function ensureChannel(): Promise<void> {
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: '专注提醒',
      description: '专注/休息到点提醒（震动 + 横幅）',
      importance: 5, // 高优先级：横幅 + 声音 + 震动
      vibration: true,
    })
  } catch {
    // 旧系统或插件不可用时忽略
  }
}

/** 是否运行在原生容器内（APK） */
export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

/** 请求原生通知权限（应用启动时调用一次） */
export async function requestNativePermission(): Promise<boolean> {
  if (!isNative()) return false
  try {
    const { display } = await LocalNotifications.requestPermissions()
    return display === 'granted'
  } catch {
    return false
  }
}

/** 查询原生通知权限状态（granted / denied / default） */
export async function checkNativePermission(): Promise<string> {
  if (!isNative()) return 'denied'
  try {
    const { display } = await LocalNotifications.checkPermissions()
    if (display === 'granted' || display === 'denied') return display
    return 'default'
  } catch {
    return 'denied'
  }
}

/**
 * 挂接专注引擎：监听阶段切换，预约/取消到点通知。
 * 仅原生环境生效，Web 环境为空操作。
 */
export function initNativeNotify(engine: FocusEngine): void {
  if (!isNative()) return
  void requestNativePermission()
  void ensureChannel()

  let prevPhase: FocusPhase = 'idle'
  engine.subscribe((snap) => {
    if (snap.phase === prevPhase) return
    const from = prevPhase
    prevPhase = snap.phase

    if (snap.phase === 'focus') {
      // 专注开始：预约到点通知（锁屏也可靠触发）
      void scheduleAt(ID_FOCUS_END, Date.now() + snap.remainingMs,
        '专注到点 🎯', '时间到了，进入心流保护 · 随时可以落地休息')
    } else if (snap.phase === 'shortBreak' || snap.phase === 'longBreak') {
      // 进入休息：专注通知已消费，预约休息结束通知
      void cancel(ID_FOCUS_END)
      void scheduleAt(ID_BREAK_END, Date.now() + snap.remainingMs,
        '休息结束 ☀️', '精力回来了，开始下一轮专注吧')
    } else if (snap.phase === 'idle') {
      // 回到待命（含放弃/跳过休息）：清掉所有预约
      void cancel(ID_FOCUS_END)
      void cancel(ID_BREAK_END)
    } else if (snap.phase === 'flow' && from !== 'focus') {
      // 恢复流程直接进入 flow 的场景：专注预约已无意义
      void cancel(ID_FOCUS_END)
    }
  })
}

async function scheduleAt(id: number, at: number, title: string, body: string): Promise<void> {
  if (at <= Date.now()) return
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id,
        title,
        body,
        schedule: { at: new Date(at), allowWhileIdle: true },
        channelId: CHANNEL_ID,
        smallIcon: 'ic_stat_icon_config_sample',
      }],
    })
  } catch {
    // 权限被拒或插件不可用时静默失败
  }
}

async function cancel(id: number): Promise<void> {
  try {
    await LocalNotifications.cancel({ notifications: [{ id }] })
  } catch {
    // 忽略取消失败
  }
}
