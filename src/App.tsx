/**
 * Flowtide 主界面 —— 番茄钟面板 + 声景控制台
 */

import { TimerPanel } from './components/TimerPanel'
import { SoundscapePanel } from './components/SoundscapePanel'
import { useFocus, useFocusEffects } from './hooks/useEngines'

function App() {
  useFocusEffects()
  const { phase } = useFocus()

  return (
    <div className={`app phase-${phase}`}>
      <header className="app-header">
        <h1 className="logo">
          Flowtide <span className="logo-cn">心流潮汐</span>
        </h1>
        <p className="tagline">让专注与休息像潮汐一样自然涨落</p>
      </header>
      <main className="app-main">
        <TimerPanel />
        <SoundscapePanel />
      </main>
      <footer className="app-footer">
        v0.1 · 数据仅存于本地 (local-first)
      </footer>
    </div>
  )
}

export default App
