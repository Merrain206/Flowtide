/**
 * 专注复盘看板 (编号 04)
 *
 * 周趋势柱状图 · 28 天热力图 · 心流占比圆环 · 连续天数 · AI 周报（v0.7）
 */

import { useState } from 'react'
import { useWeeklyStats, useEnergyProfile } from '../hooks/useStats'
import {
  getCachedWeeklyReport,
  generateWeeklyReport,
  type WeeklyReport,
} from '../core/report/weekly'

const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const MS_MIN = 60_000
const MS_HOUR = 3_600_000

/** 5 级热力色阶（薄荷绿色系） */
const HEAT_LEVELS = ['#f0f2f5', '#d4f5ea', '#a3e8d4', '#5cd6b0', '#2bbf94', '#0c8f72']

function formatMs(ms: number): string {
  if (ms < MS_MIN) return '<1 分钟'
  const h = Math.floor(ms / MS_HOUR)
  const m = Math.floor((ms % MS_HOUR) / MS_MIN)
  if (h > 0) return `${h}h${m > 0 ? ` ${m}m` : ''}`
  return `${m} 分钟`
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** 环比趋势箭头（v0.8）：上周无数据或旧版缓存无字段时不显示 */
function trendMark(cur: number, prev: number | undefined): string {
  if (typeof prev !== 'number' || prev <= 0) return ''
  const delta = (cur - prev) / prev
  if (delta >= 0.05) return ' ↑'
  if (delta <= -0.05) return ' ↓'
  return ' →'
}

export function StatsPanel() {
  const { days, totalMs, flowRatio, streak, heatmap } = useWeeklyStats()
  const energy = useEnergyProfile()
  // AI 周报（v0.7）：同一周命中 localStorage 缓存，不重复调用 LLM
  const [report, setReport] = useState<WeeklyReport | null>(() => getCachedWeeklyReport())
  const [reportLoading, setReportLoading] = useState(false)
  const [reportErr, setReportErr] = useState<string | null>(null)

  async function handleGenerateReport() {
    if (reportLoading) return
    setReportLoading(true)
    setReportErr(null)
    try {
      setReport(await generateWeeklyReport())
    } catch (err) {
      setReportErr(err instanceof Error ? err.message : '生成失败，请重试')
    } finally {
      setReportLoading(false)
    }
  }

  // 首次使用：无任何专注数据时，展示统一空状态
  if (totalMs === 0) {
    return (
      <section className="panel stats-panel">
        <header className="panel-head">
          <span className="sec-no">04</span>
          <h2 className="panel-title">专注复盘</h2>
        </header>
        <div className="empty-state">
          <div className="empty-emoji">📊</div>
          <div className="empty-text">还没有专注记录</div>
          <div className="empty-sub">完成第一轮专注，这里会长出你的心流曲线与热力图</div>
        </div>
      </section>
    )
  }

  // 柱状图：最大值用于归一化
  const maxMs = Math.max(...days.map((d) => d.focusMs + d.flowMs), MS_MIN)

  return (
    <section className="panel stats-panel">
      <header className="panel-head">
        <span className="sec-no">04</span>
        <h2 className="panel-title">专注复盘</h2>
        {streak > 0 && (
          <span className="streak-badge">🔥 {streak} 天</span>
        )}
      </header>

      {/* 周趋势柱状图 */}
      <div className="chart-section">
        <h3 className="chart-title">本周趋势</h3>
        <svg className="chart-bars" viewBox="0 0 280 100" preserveAspectRatio="xMidYMid meet">
          {days.map((d, i) => {
            const total = d.focusMs + d.flowMs
            const barH = Math.max(2, (total / maxMs) * 70)
            const flowH = total > 0 ? (d.flowMs / total) * barH : 0
            const focusH = barH - flowH
            const x = i * 40 + 4
            return (
              <g key={d.date}>
                {/* 专注段 */}
                <rect
                  x={x} y={90 - barH} width={28} height={focusH}
                  rx={4} fill="var(--c-focus)" opacity={0.85}
                />
                {/* 心流段 */}
                {flowH > 0 && (
                  <rect
                    x={x} y={90 - flowH} width={28} height={flowH}
                    rx={4} fill="var(--c-flow)" opacity={0.75}
                  />
                )}
                {/* 日期标签 */}
                <text x={x + 14} y={99} textAnchor="middle" className="chart-label">
                  {DAY_LABELS[new Date(d.date).getDay()]}
                </text>
                {/* hover 数值提示 */}
                <title>{shortDate(d.date)}: {formatMs(total)}</title>
              </g>
            )
          })}
        </svg>
        <p className="chart-summary">
          本周专注 <strong>{formatMs(totalMs)}</strong>
        </p>
      </div>

      {/* 心流占比 */}
      <div className="flow-section">
        <h3 className="chart-title">心流占比</h3>
        <div className="flow-ring-wrap">
          <svg className="flow-ring" viewBox="0 0 80 80">
            <circle cx={40} cy={40} r={32} className="ring-track" />
            <circle
              cx={40} cy={40} r={32}
              className="ring-progress"
              strokeDasharray={`${flowRatio * 201.06} 201.06`}
              stroke="var(--c-flow)"
            />
          </svg>
          <span className="flow-pct">{Math.round(flowRatio * 100)}%</span>
        </div>
      </div>

      {/* 28 天热力图 */}
      <div className="heat-section">
        <h3 className="chart-title">28 天热力图</h3>
        <div className="heatmap-grid">
          {heatmap.map((d) => {
            const total = d.focusMs + d.flowMs
            const level = total === 0 ? 0
              : total < 15 * MS_MIN ? 1
              : total < 30 * MS_MIN ? 2
              : total < 60 * MS_MIN ? 3
              : total < 120 * MS_MIN ? 4
              : 5
            return (
              <div
                key={d.date}
                className="heatmap-cell"
                style={{ background: HEAT_LEVELS[level] }}
                title={`${shortDate(d.date)}: ${formatMs(total)}`}
              />
            )
          })}
        </div>
      </div>

      {/* 精力时段（v0.4） */}
      <div className="energy-section">
        <h3 className="chart-title">精力时段</h3>
        {!energy.sufficient ? (
          <p className="energy-hint">积累 7 天专注数据后展示精力画像</p>
        ) : (
          <div className="energy-bars">
            {energy.avgFocusByHour.map((mins, h) => {
              const isPeak = energy.peakHours.includes(h)
              const isTrough = energy.troughHours.includes(h)
              const maxMin = Math.max(...energy.avgFocusByHour, 1)
              const barW = (mins / maxMin) * 100
              return (
                <div key={h} className="energy-row">
                  <span className="energy-hour">{String(h).padStart(2, '0')}</span>
                  <div className="energy-bar-wrap">
                    <div
                      className={`energy-bar ${isPeak ? 'peak' : ''} ${isTrough ? 'trough' : ''}`}
                      style={{ width: `${barW}%` }}
                    />
                  </div>
                  <span className="energy-val">
                    {mins > 0 ? `${Math.round(mins)}m` : ''}
                  </span>
                </div>
              )
            })}
            <div className="energy-legend">
              <span className="legend-item"><span className="legend-dot peak" /> 高效峰值</span>
              <span className="legend-item"><span className="legend-dot trough" /> 低谷</span>
              <span className="legend-item"><span className="legend-dot" /> 普通时段</span>
            </div>
          </div>
        )}
      </div>

      {/* 本周洞察（v0.7 AI 周报） */}
      <div className="insight-section">
        <h3 className="chart-title">本周洞察</h3>
        {report ? (
          <div className="insight-body">
            <p className="insight-narrative">{report.narrative}</p>
            <div className="insight-numbers">
              <div className="insight-num">
                <span className="insight-num-val">{formatMs(report.stats.focusMs)}</span>
                <span className="insight-num-label">专注时长{trendMark(report.stats.focusMs, report.stats.prevFocusMs)}</span>
              </div>
              <div className="insight-num">
                <span className="insight-num-val">{report.stats.cycles}</span>
                <span className="insight-num-label">专注轮次{trendMark(report.stats.cycles, report.stats.prevCycles)}</span>
              </div>
              <div className="insight-num">
                <span className="insight-num-val">{Math.round(report.stats.flowRatio * 100)}%</span>
                <span className="insight-num-label">心流占比</span>
              </div>
            </div>
            <button className="btn ghost insight-regen" disabled={reportLoading} onClick={() => void handleGenerateReport()}>
              {reportLoading ? '生成中…' : '重新生成'}
            </button>
          </div>
        ) : (
          <div className="insight-empty">
            <p className="energy-hint">让 AI 回顾你这一周的专注节奏</p>
            <button className="btn primary insight-gen" disabled={reportLoading} onClick={() => void handleGenerateReport()}>
              {reportLoading ? '生成中…' : '✨ 生成周报'}
            </button>
          </div>
        )}
        {reportErr && <p className="insight-err">{reportErr}</p>}
      </div>
    </section>
  )
}
