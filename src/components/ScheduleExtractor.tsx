/**
 * AI 日程提取（v0.6）—— 自然语言 → 任务列表
 *
 * 用户粘贴今日/本周日程文本，AI 智能提取任务并批量导入番茄钟。
 * 支持识别：事项名称、时间点、优先级、认知负荷（高/低）、预估番茄数。
 * v0.9.3：由侧边抽屉改为居中浮动窗口（亮色）。
 */

import { useState } from 'react'
import { taskEngine } from '../hooks/useEngines'
import { getAPIKey, getProvider } from '../core/agent/LLMAdapter'

// ── 提取出来的任务结构 ────────────────────────────────────

interface ExtractedTask {
  title: string
  cognition: 'high' | 'low'
  pomodoros: number
  time?: string   // 原文中的时间提示（导入后在任务卡和番茄钟中展示）
}

// ── 调用 LLM 提取日程 ─────────────────────────────────────

const EXTRACT_SYSTEM = `你是日程智能助手。用户会给你一段文字，里面包含今天或本周的日程安排。
请从中提取出所有待办任务，以 JSON 数组返回，格式如下：
[
  {
    "title": "任务名称（简短，15字以内）",
    "cognition": "high 或 low（high=需要深度思考，如写作/编程/学习；low=常规事务，如回邮件/整理）",
    "pomodoros": 数字（1-6，预估需要几个番茄钟完成）,
    "time": "原文中的时间信息（如有），否则留空字符串"
  }
]
只返回 JSON，不要任何解释文字。如果提取不到有效任务，返回空数组 []。`

const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions'
const DEEPSEEK_MODEL = 'deepseek-v4-flash'

async function extractTasksFromText(text: string): Promise<ExtractedTask[]> {
  const apiKey = getAPIKey()
  const provider = getProvider()

  // Mock 模式或用户未配置 Key 时，用简单规则解析（逐行拆分）
  if (provider === 'mock' || !apiKey) {
    return mockExtract(text)
  }

  const res = await fetch(DEEPSEEK_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: EXTRACT_SYSTEM },
        { role: 'user', content: text },
      ],
      temperature: 0.3,
      max_tokens: 800,
      stream: false,
    }),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const content: string = data.choices?.[0]?.message?.content ?? '[]'

  // 从回复中提取 JSON
  const jsonMatch = content.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []
  return JSON.parse(jsonMatch[0]) as ExtractedTask[]
}

/** Mock 提取：逐行拆分，识别常见模式 */
function mockExtract(text: string): ExtractedTask[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  return lines
    .filter((l) => l.length > 2 && !l.startsWith('//'))
    .slice(0, 10)
    .map((line) => {
      // 简单启发式：含"写"|"做"|"完成"|"准备"等动词推测为高认知
      const highKeywords = /写|做|完成|准备|学习|研究|分析|开发|设计|规划|调试|编写/
      const cognition: 'high' | 'low' = highKeywords.test(line) ? 'high' : 'low'
      // 时间模式提取
      const timeMatch = line.match(/(\d{1,2}[:：]\d{2}|\d{1,2}点(半)?|上午|下午|早上|晚上)/)
      const time = timeMatch ? timeMatch[0] : ''
      // 清理时间前缀
      const title = line.replace(/^\d{1,2}[:：]\d{2}[-\s]*/, '').replace(/^[上下早晚]午?/, '').trim().slice(0, 20)
      return { title, cognition, pomodoros: cognition === 'high' ? 2 : 1, time }
    })
    .filter((t) => t.title.length > 0)
}

// ── UI 组件 ──────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
}

export function ScheduleExtractor({ open, onClose }: Props) {
  const [text, setText] = useState('')
  const [tasks, setTasks] = useState<ExtractedTask[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [imported, setImported] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  async function handleExtract() {
    if (!text.trim()) return
    setLoading(true)
    setError('')
    setTasks([])
    setImported(false)
    try {
      const result = await extractTasksFromText(text)
      setTasks(result)
      setSelected(new Set(result.map((_, i) => i)))  // 默认全选
    } catch (err) {
      setError(err instanceof Error ? err.message : '提取失败')
    } finally {
      setLoading(false)
    }
  }

  async function handleImport() {
    const toImport = tasks.filter((_, i) => selected.has(i))
    for (const t of toImport) {
      await taskEngine.addTask(t.title, t.cognition, t.pomodoros, t.time || undefined)
    }
    setImported(true)
    setTimeout(() => { onClose(); resetState() }, 1200)
  }

  function resetState() {
    setText('')
    setTasks([])
    setError('')
    setImported(false)
    setSelected(new Set())
  }

  function toggleSelect(i: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  function adjustPomodoros(i: number, delta: number) {
    setTasks((prev) => prev.map((t, idx) =>
      idx === i ? { ...t, pomodoros: Math.max(1, Math.min(8, t.pomodoros + delta)) } : t
    ))
  }

  function toggleCognition(i: number) {
    setTasks((prev) => prev.map((t, idx) =>
      idx === i ? { ...t, cognition: t.cognition === 'high' ? 'low' : 'high' } : t
    ))
  }

  if (!open) return null

  return (
    <div className="float-overlay" onClick={(e) => { if (e.target === e.currentTarget) { onClose(); resetState() } }}>
      <div className="float-window schedule-extractor">
        <header className="float-head">
          <h3 className="float-title">📅 AI 日程提取</h3>
          <button className="btn ghost" onClick={() => { onClose(); resetState() }}>✕</button>
        </header>

        <div className="float-body">
        {/* 输入区 */}
        {!tasks.length && !loading && (
          <div className="extract-input-area">
            <p className="extract-hint">
              粘贴今日或本周日程文字，AI 自动识别任务、时间和认知负荷，一键导入番茄钟。
            </p>
            <textarea
              className="extract-textarea"
              placeholder={"例如：\n9:00 开周会\n10:30 写技术方案\n14:00 回邮件、整理文档\n15:00 Code Review\n16:30 准备演讲稿"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
            />
            {error && <p className="extract-error">{error}</p>}
            <button
              className="btn primary extract-btn"
              onClick={handleExtract}
              disabled={!text.trim()}
            >
              🤖 AI 提取任务
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="extract-loading">
            <span className="extract-spinner">⟳</span>
            正在分析日程…
          </div>
        )}

        {/* 提取结果 */}
        {tasks.length > 0 && !imported && (
          <>
            <p className="extract-result-hint">
              AI 提取到 <strong>{tasks.length}</strong> 个任务，勾选要导入的项后点击确认：
            </p>
            <ul className="extract-task-list">
              {tasks.map((t, i) => (
                <li key={i} className={`extract-task-item ${selected.has(i) ? 'selected' : 'unselected'}`}>
                  <button
                    className={`task-check ${selected.has(i) ? 'done' : ''}`}
                    onClick={() => toggleSelect(i)}
                  >
                    {selected.has(i) ? '✓' : '○'}
                  </button>
                  <div className="extract-task-body">
                    <span className="task-title">{t.title}</span>
                    {t.time && <span className="extract-time-tag">🕐 {t.time}</span>}
                  </div>
                  <button
                    className={`cog-chip ${t.cognition}`}
                    onClick={() => toggleCognition(i)}
                    title="切换认知负荷"
                  >
                    {t.cognition === 'high' ? '🧠 高' : '🌿 低'}
                  </button>
                  <div className="pomo-stepper">
                    <button className="stepper-btn" onClick={() => adjustPomodoros(i, -1)} disabled={t.pomodoros <= 1}>−</button>
                    <span className="stepper-val">🍅{t.pomodoros}</span>
                    <button className="stepper-btn" onClick={() => adjustPomodoros(i, 1)} disabled={t.pomodoros >= 8}>+</button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="extract-footer">
              <button className="btn ghost" onClick={() => { setTasks([]); setError('') }}>重新提取</button>
              <button
                className="btn primary"
                onClick={handleImport}
                disabled={selected.size === 0}
              >
                导入 {selected.size} 个任务 →
              </button>
            </div>
          </>
        )}

        {/* 成功 */}
        {imported && (
          <div className="extract-success">
            ✅ 导入成功！任务已加入番茄钟队列
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
