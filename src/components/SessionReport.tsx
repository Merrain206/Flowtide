/**
 * 专注报告卡（v0.5）—— 本轮专注即时反馈
 *
 * 在 focus -> break 转换时短暂弹出（3 秒可跳过）。
 * 展示：本轮时长、是否进入心流、关联任务、相比均值的表现。
 */

import { useEffect, useState } from 'react'
import type { SessionRecord } from '../core/focus/types'

interface Props {
  record: SessionRecord | null
  /** 连续专注轮次 */
  consecutiveSessions: number
  onDismiss: () => void
}

/** 基于规则生成鼓励语 */
function encouragement(record: SessionRecord, consecutive: number): string {
  if (record.flowMs > 0) {
    const flowMin = Math.round(record.flowMs / 60000)
    return `心流延长了 ${flowMin} 分钟，状态很棒！`
  }
  if (consecutive >= 3) {
    return `连续 ${consecutive} 轮专注，继续保持节奏！`
  }
  const messages = [
    '完成一轮专注，好好休息一下',
    '专注力正在积累，继续加油',
    '做得好，让大脑充充电',
    '每一轮专注都在塑造更好的自己',
  ]
  return messages[consecutive % messages.length]
}

export function SessionReport({ record, consecutiveSessions, onDismiss }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (record) {
      setVisible(true)
      const timer = setTimeout(() => {
        setVisible(false)
        onDismiss()
      }, 3000)
      return () => clearTimeout(timer)    } else {
      setVisible(false)
    }
  }, [record])

  if (!record || !visible) return null

  const totalMin = Math.round((record.focusMs + record.flowMs) / 60000)
  const hadFlow = record.flowMs > 0
  const msg = encouragement(record, consecutiveSessions)

  return (
    <div className="report-card">
      <div className="report-header">
        <span className="report-icon">📋</span>
        <span className="report-title">本轮报告</span>
        <button className="report-close" onClick={() => { setVisible(false); onDismiss() }}>×</button>
      </div>

      <div className="report-stats">
        <div className="report-stat">
          <span className="report-val">{totalMin}</span>
          <span className="report-label">分钟</span>
        </div>
        <div className="report-stat">
          <span className="report-val">{hadFlow ? `+${Math.round(record.flowMs / 60000)}` : '0'}</span>
          <span className="report-label">心流延长</span>
        </div>
        <div className="report-stat">
          <span className="report-val">{consecutiveSessions}</span>
          <span className="report-label">连续轮次</span>
        </div>
      </div>

      <p className="report-msg">{msg}</p>
    </div>
  )
}
