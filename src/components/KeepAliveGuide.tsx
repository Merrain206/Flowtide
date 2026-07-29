/**
 * 首次启动后台保活引导（v0.9 模块六）
 *
 * 仅 APK 端、未加入电池优化白名单时首启弹出一次。
 * 引导用户完成两步：允许后台运行 + 开启自启动，避免到点不提醒。
 * Web 端不渲染。
 */

import { useState } from 'react'
import { requestIgnoreBattery, openAutoStart, markGuided } from '../core/device/keepalive'

interface Props {
  onDone: () => void
}

export function KeepAliveGuide({ onDone }: Props) {
  const [batteryDone, setBatteryDone] = useState(false)
  const [autoStartDone, setAutoStartDone] = useState(false)

  function finish() {
    markGuided()
    onDone()
  }

  return (
    <div className="keepalive-guide-overlay">
      <div className="keepalive-guide-card">
        <div className="keepalive-guide-emoji">🔔</div>
        <h2 className="keepalive-guide-title">为了到点准时提醒你</h2>
        <p className="keepalive-guide-desc">
          国产手机默认会限制后台运行，App 被清理后专注/休息到点就不会提醒。
          完成下面两步，让 Flowtide 到点必响：
        </p>

        <button
          className={`keepalive-step ${batteryDone ? 'done' : ''}`}
          onClick={() => { void requestIgnoreBattery(); setBatteryDone(true) }}
        >
          <span className="keepalive-step-num">{batteryDone ? '✓' : '1'}</span>
          <span>
            <span className="keepalive-step-title">允许后台运行</span>
            <span className="keepalive-step-sub">在弹窗中选择「允许」忽略电池优化</span>
          </span>
        </button>

        <button
          className={`keepalive-step ${autoStartDone ? 'done' : ''}`}
          onClick={() => { void openAutoStart(); setAutoStartDone(true) }}
        >
          <span className="keepalive-step-num">{autoStartDone ? '✓' : '2'}</span>
          <span>
            <span className="keepalive-step-title">开启自启动</span>
            <span className="keepalive-step-sub">在自启动列表中打开 Flowtide 的开关</span>
          </span>
        </button>

        <button className="btn primary keepalive-guide-done" onClick={finish}>
          我已设置
        </button>
        <button className="btn ghost keepalive-guide-skip" onClick={finish}>
          稍后在「我的」里设置
        </button>
      </div>
    </div>
  )
}
