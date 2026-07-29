/**
 * 开发者面板（v0.6）—— 快捷调试入口
 *
 * 通过 Ctrl+Shift+D 或设置中的开关唤出。
 * 提供数据种子、一键快进、LLM 测试等快捷操作。
 */

import { useState } from 'react'
import {
  seed28DaysData,
  fastForwardFocus,
  seedSampleTasks,
  seedSamplePlan,
  seedBacklogPlan,
  clearAllData,
  forceLLMSuggest,
} from '../core/dev/dev-tools'

interface Props {
  open: boolean
  onClose: () => void
}

export function DevPanel({ open, onClose }: Props) {
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  function addLog(msg: string) {
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 30))
  }

  async function run(label: string, fn: () => Promise<string> | string) {
    if (busy) return
    setBusy(true)
    addLog(`▶ ${label}...`)
    try {
      const result = await fn()
      addLog(`✅ ${result}`)
    } catch (err) {
      addLog(`❌ ${err instanceof Error ? err.message : '未知错误'}`)
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="dev-panel-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <aside className="dev-panel">
        <header className="dev-head">
          <h3 className="dev-title">🛠 开发者模式</h3>
          <button className="btn ghost" onClick={onClose}>✕</button>
        </header>

        <section className="dev-section">
          <h4 className="dev-section-label">数据种子</h4>
          <div className="dev-actions">
            <DevBtn label="📊 生成 28 天数据" onClick={() => run('生成 28 天数据', async () => {
              const n = await seed28DaysData()
              return `已生成 ${n} 条专注记录（刷新复盘页可见）`
            })} />
            <DevBtn label="📋 种子任务列表" onClick={() => run('种子任务', async () => {
              const n = await seedSampleTasks()
              return `已添加 ${n} 个示例任务`
            })} />
            <DevBtn label="🎯 生成示例计划" onClick={() => run('种子计划', async () => {
              const n = await seedSamplePlan()
              return `已启用 ${n} 天四级备考示例计划，今天的任务已派发`
            })} />
            <DevBtn label="⚡ 生成积压计划" onClick={() => run('积压计划', async () => {
              const n = await seedBacklogPlan()
              return `已生成积压场景计划（当前积压 ${n} 项），计划卡片应出现重排建议`
            })} />
            <DevBtn label="🗑 清除所有数据" danger onClick={() => run('清除数据', async () => {
              await clearAllData()
              return '已清除全部专注记录、任务和计划'
            })} />
          </div>
        </section>

        <section className="dev-section">
          <h4 className="dev-section-label">快捷操作</h4>
          <div className="dev-actions">
            <DevBtn label="⏩ 快进完成专注" onClick={() => run('快进专注', () => {
              const ok = fastForwardFocus()
              return ok ? '已快进完成当前专注' : '当前不在专注中'
            })} />
          </div>
        </section>

        <section className="dev-section">
          <h4 className="dev-section-label">AI / LLM 测试</h4>
          <div className="dev-actions">
            <DevBtn label="🤖 强制 LLM 建议" onClick={() => run('LLM 建议', async () => {
              const msg = await forceLLMSuggest()
              return `AI 说：${msg}`
            })} />
          </div>
        </section>

        {/* 日志区 */}
        <section className="dev-section">
          <h4 className="dev-section-label">执行日志</h4>
          <div className="dev-log">
            {log.length === 0 && <span className="dev-log-empty">暂无日志</span>}
            {log.map((line, i) => (
              <div key={i} className="dev-log-line">{line}</div>
            ))}
          </div>
          {log.length > 0 && (
            <button className="btn ghost dev-clear" onClick={() => setLog([])}>清空日志</button>
          )}
        </section>

        <p className="dev-hint">按 Ctrl+Shift+D 或 Esc 关闭</p>
      </aside>
    </div>
  )
}

function DevBtn({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button className={`btn dev-btn ${danger ? 'dev-danger' : ''}`} onClick={onClick}>
      {label}
    </button>
  )
}
