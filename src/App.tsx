/**
 * Flowtide 主界面（v0.9.1）
 *
 * 首启强制隐私同意弹窗 → 启动页淡出 → 计时器常驻顶部 hero，
 * 其下按底部导航切换五个栏目：任务 / 声景 / 音乐 / 复盘 / 我的。
 * 品牌展示移到启动页，主界面不再摆大页头，进来直接见番茄钟。
 */

import { useState, useMemo, useEffect } from 'react'
import { TimerPanel } from './components/TimerPanel'
import { SoundscapePanel } from './components/SoundscapePanel'
import { MusicPanel } from './components/MusicPanel'
import { StatsPanel } from './components/StatsPanel'
import { TaskPanel } from './components/TaskPanel'
import { ProfilePanel } from './components/ProfilePanel'
import { FeatureGuide } from './components/FeatureGuide'
import { DevPanel } from './components/DevPanel'
import { ScheduleExtractor } from './components/ScheduleExtractor'
import { PlanWizard } from './components/PlanWizard'
import { KeepAliveGuide } from './components/KeepAliveGuide'
import { PrivacyConsent } from './components/PrivacyConsent'
import { IconTasks, IconSound, IconMusic, IconStats, IconProfile } from './components/NavIcons'
import { focusEngine, useFocus, useSoundscape, useNotifyPermission } from './hooks/useEngines'
import { useKeyboard } from './hooks/useKeyboard'
import { autoCheckDaily, type UpdateInfo, DOWNLOAD_PAGE, APP_VERSION } from './core/device/update'
import { needsKeepAliveGuide } from './core/device/keepalive'
import { hasConsented } from './data/policies'

type Tab = 'tasks' | 'sound' | 'music' | 'stats' | 'profile'
const TABS: Tab[] = ['tasks', 'sound', 'music', 'stats', 'profile']

/** 首次访问自动播放功能引导的一次性标记 */
const GUIDE_SEEN_KEY = 'flowtide.guide.seen.v1'

function App() {
  useNotifyPermission()
  const { phase } = useFocus()
  const { playing: soundscapePlaying } = useSoundscape()
  const [tab, setTab] = useState<Tab>('tasks')
  const [guideOpen, setGuideOpen] = useState(false)
  const [devOpen, setDevOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const [keepAliveGuide, setKeepAliveGuide] = useState(false)
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [consented, setConsented] = useState(hasConsented)

  // 启动页：品牌展示约 0.9s 后淡出移除（index.html 中的 #boot-splash）
  useEffect(() => {
    const el = document.getElementById('boot-splash')
    if (!el) return
    const t = setTimeout(() => {
      el.classList.add('hide')
      setTimeout(() => el.remove(), 500)
    }, 900)
    return () => clearTimeout(t)
  }, [])

  // 首启引导 + 每日检查更新 + 保活引导（均在隐私同意之后才执行）
  useEffect(() => {
    if (!consented) return
    let seen = true
    try { seen = localStorage.getItem(GUIDE_SEEN_KEY) === '1' } catch { /* 忽略 */ }
    if (!seen) {
      try { localStorage.setItem(GUIDE_SEEN_KEY, '1') } catch { /* 忽略 */ }
      // 略延迟，等界面稳定后再自动导览
      const t = setTimeout(() => setGuideOpen(true), 600)
      return () => clearTimeout(t)
    }
    // 老用户：静默检查更新 + 保活引导
    void autoCheckDaily().then((info) => { if (info) setUpdate(info) })
    void needsKeepAliveGuide().then((need) => { if (need) setKeepAliveGuide(true) })
  }, [consented])

  // 键盘快捷键
  const kbCallbacks = useMemo(() => ({
    onToggleFocus: () => {
      const snap = focusEngine.snapshot()
      if (snap.paused) focusEngine.resume()
      else focusEngine.startFocus()
    },
    onLandRest: () => {
      if (focusEngine.snapshot().phase === 'flow') focusEngine.advance()
    },
    onSkipBreak: () => {
      const { phase } = focusEngine.snapshot()
      if (phase === 'shortBreak' || phase === 'longBreak') focusEngine.advance()
    },
    onSwitchTab: (idx: number) => {
      if (idx >= 0 && idx < TABS.length) setTab(TABS[idx])
    },
    onOpenGuide: () => setGuideOpen(true),
    onOpenDev: () => setDevOpen(true),
    onCloseOverlay: () => {
      setGuideOpen(false)
      setDevOpen(false)
      setScheduleOpen(false)
      setPlanOpen(false)
    },
  }), [])
  useKeyboard(kbCallbacks)

  return (
    <div className={`app phase-${phase} has-bottom-nav`}>
      {/* 首次进入：强制隐私同意弹窗，同意后才能使用 */}
      {!consented && <PrivacyConsent onAgree={() => setConsented(true)} />}

      {/* 检查更新提示条 */}
      {update && (
        <div className="update-banner">
          <span>发现新版本 v{update.versionName}，建议更新以获得最佳体验</span>
          <span className="update-banner-actions">
            <button className="btn primary" onClick={() => window.open(update.url || DOWNLOAD_PAGE, '_blank')}>去下载</button>
            <button className="btn ghost" onClick={() => setUpdate(null)}>稍后</button>
          </span>
        </div>
      )}

      <FeatureGuide active={guideOpen} onClose={() => setGuideOpen(false)} />
      <DevPanel open={devOpen} onClose={() => setDevOpen(false)} />
      <ScheduleExtractor open={scheduleOpen} onClose={() => setScheduleOpen(false)} />
      <PlanWizard open={planOpen} onClose={() => setPlanOpen(false)} />
      {keepAliveGuide && <KeepAliveGuide onDone={() => setKeepAliveGuide(false)} />}

      <main className="app-main">
        <TimerPanel />
        <div className="tab-content" key={tab}>
          {tab === 'tasks' && <TaskPanel onOpenExtractor={() => setScheduleOpen(true)} onOpenPlan={() => setPlanOpen(true)} />}
          {tab === 'sound' && <SoundscapePanel />}
          {tab === 'music' && <MusicPanel />}
          {tab === 'stats' && <StatsPanel />}
          {tab === 'profile' && (
            <ProfilePanel
              onOpenGuide={() => setGuideOpen(true)}
              onOpenDev={() => setDevOpen(true)}
              onGoMusic={() => setTab('music')}
            />
          )}
        </div>
      </main>

      <footer className="app-footer">
        v{APP_VERSION} · 数据仅存于本地 (local-first)
      </footer>

      {/* 底部导航 */}
      <nav className="bottom-nav">
        <button className={`nav-item ${tab === 'tasks' ? 'active' : ''}`} onClick={() => setTab('tasks')}>
          <IconTasks />
          <span>任务</span>
        </button>
        <button className={`nav-item ${tab === 'sound' ? 'active' : ''}`} onClick={() => setTab('sound')}>
          <span className="nav-icon-wrap">
            <IconSound />
            {soundscapePlaying && <span className="nav-dot" />}
          </span>
          <span>声景</span>
        </button>
        <button className={`nav-item ${tab === 'music' ? 'active' : ''}`} onClick={() => setTab('music')}>
          <IconMusic />
          <span>音乐</span>
        </button>
        <button className={`nav-item ${tab === 'stats' ? 'active' : ''}`} onClick={() => setTab('stats')}>
          <IconStats />
          <span>复盘</span>
        </button>
        <button className={`nav-item ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')}>
          <IconProfile />
          <span>我的</span>
        </button>
      </nav>
    </div>
  )
}

export default App
