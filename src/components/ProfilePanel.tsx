/**
 * 「我的」栏目（v0.9 模块三）
 *
 * 底部导航第 5 项，集中承载账号、数据备份、检查更新、隐私协议与全部偏好设置。
 * 取代原右侧滑出的 SettingsDrawer 与顶部三枚浮动按钮（⚙ 设置 / ? 引导 / 🛠 开发者）。
 *
 * 设置项按主题折叠成分区，默认收起，减少一屏信息密度（开箱更清爽）。
 */

import { useState, useEffect } from 'react'
import { focusEngine, rulesEngine, useFocus } from '../hooks/useEngines'
import { requestPermission } from '../core/agent/notify'
import { isNative, checkNativePermission, requestNativePermission } from '../core/device/native-notify'
import { getAccount, isLoggedIn, clearCookie, type Account } from '../core/music/netease-api'
import { exportBackupFile, parseBackup, restoreBackup } from '../core/backup/backup'
import {
  getAPIKey, setAPIKey, getProvider, setProvider,
  isLLMEnabled, setLLMEnabled, type LLMProvider,
} from '../core/agent/LLMAdapter'
import { isHapticsSupported, isHapticsEnabled, setHapticsEnabled, vibrate } from '../core/device/haptics'
import { isWakeLockSupported, isWakeLockEnabled, setWakeLockEnabled } from '../core/device/wakelock'
import { isLiveTimerEnabled, setLiveTimerEnabled, checkPromotedSupport } from '../core/device/live-timer'
import { isScheduleEnabled, setScheduleEnabled, currentSlotLabel } from '../core/audio/schedule'
import {
  APP_VERSION, DOWNLOAD_PAGE, checkUpdate,
  isAutoCheckEnabled, setAutoCheckEnabled, type UpdateInfo,
} from '../core/device/update'
import {
  isNativeApp, isIgnoringBattery, requestIgnoreBattery, openAutoStart, openAppSettings,
} from '../core/device/keepalive'
import { POLICY_DOCS } from '../data/policies'

interface Props {
  /** 打开功能引导（重播） */
  onOpenGuide: () => void
  /** 打开开发者面板 */
  onOpenDev: () => void
  /** 跳到音乐栏目（未登录时去扫码） */
  onGoMusic: () => void
}

export function ProfilePanel({ onOpenGuide, onOpenDev, onGoMusic }: Props) {
  const { config } = useFocus()

  // 账号
  const [account, setAccount] = useState<Account | null>(null)
  const [loggedIn, setLoggedIn] = useState(isLoggedIn)

  // 专注配置
  const [focusMin, setFocusMin] = useState(config.focusMinutes)
  const [shortBreak, setShortBreak] = useState(config.shortBreakMinutes)
  const [longBreak, setLongBreak] = useState(config.longBreakMinutes)
  const [maxFlow, setMaxFlow] = useState(config.maxFlowMinutes)
  const [cyclesLong, setCyclesLong] = useState(config.cyclesPerLongBreak)

  // 通知
  const [notifyPerm, setNotifyPerm] = useState<string>('unknown')

  // Agent 规则
  const [autoSound, setAutoSound] = useState(() => rulesEngine.isRuleEnabled('phaseSoundscape'))
  const [musicDuck, setMusicDuck] = useState(() => rulesEngine.isRuleEnabled('musicDuck'))
  const [energySuggest, setEnergySuggest] = useState(() => rulesEngine.isRuleEnabled('energySuggestion'))
  const [taskAware, setTaskAware] = useState(() => rulesEngine.isRuleEnabled('taskAwareness'))
  const [longSess, setLongSess] = useState(() => rulesEngine.isRuleEnabled('longSession'))
  const [breakSoothe, setBreakSoothe] = useState(() => rulesEngine.isRuleEnabled('breakSoothe'))
  const [soundSchedule, setSoundSchedule] = useState(isScheduleEnabled)

  // AI 助手
  const [llmEnabled, setLLMState] = useState(isLLMEnabled)
  const [llmProvider, setLLMProvider] = useState<LLMProvider>(getProvider)
  const [llmKey, setLLMKey] = useState(getAPIKey)

  // 设备协同
  const [haptics, setHaptics] = useState(isHapticsEnabled)
  const [wakeLock, setWakeLock] = useState(isWakeLockEnabled)
  const [liveTimer, setLiveTimer] = useState(isLiveTimerEnabled)
  const [promoted, setPromoted] = useState(false)

  // 数据备份
  const [importMsg, setImportMsg] = useState('')

  // 检查更新
  const [autoUpdate, setAutoUpdate] = useState(isAutoCheckEnabled)
  const [updateMsg, setUpdateMsg] = useState('')
  const [checking, setChecking] = useState(false)
  const [foundUpdate, setFoundUpdate] = useState<UpdateInfo | null>(null)

  // 后台保活
  const [ignoringBattery, setIgnoringBattery] = useState<boolean | null>(null)

  // 隐私协议展开
  const [policyOpen, setPolicyOpen] = useState<string>('')

  useEffect(() => {
    setFocusMin(config.focusMinutes)
    setShortBreak(config.shortBreakMinutes)
    setLongBreak(config.longBreakMinutes)
    setMaxFlow(config.maxFlowMinutes)
    setCyclesLong(config.cyclesPerLongBreak)
  }, [config])

  useEffect(() => {
    if (isNative()) {
      void checkNativePermission().then(setNotifyPerm)
      void checkPromotedSupport().then(setPromoted)
    } else if ('Notification' in window) {
      setNotifyPerm(Notification.permission)
    }
    if (isLoggedIn()) void getAccount().then(setAccount).catch(() => {})
    if (isNativeApp()) void isIgnoringBattery().then(setIgnoringBattery)
  }, [])

  function saveFocus() {
    focusEngine.updateConfig({
      focusMinutes: focusMin,
      shortBreakMinutes: shortBreak,
      longBreakMinutes: longBreak,
      maxFlowMinutes: maxFlow,
      cyclesPerLongBreak: cyclesLong,
    })
    setImportMsg('✅ 专注配置已保存')
    setTimeout(() => setImportMsg(''), 2000)
  }

  function toggleRule(name: string, enabled: boolean) {
    rulesEngine.enableRule(name, enabled)
  }

  async function reqNotify() {
    const ok = isNative() ? await requestNativePermission() : await requestPermission()
    setNotifyPerm(ok ? 'granted' : 'denied')
  }

  function logout() {
    if (!confirm('确定退出网易云登录吗？本机保存的登录 cookie 将被清除。')) return
    clearCookie()
    setLoggedIn(false)
    setAccount(null)
  }

  async function handleExport() {
    try {
      await exportBackupFile()
      setImportMsg('✅ 备份已导出')
      setTimeout(() => setImportMsg(''), 3000)
    } catch { /* 用户取消分享面板等，静默 */ }
  }

  async function handleImport() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const { payload, summary } = parseBackup(text)
        const when = summary.exportedAt ? new Date(summary.exportedAt).toLocaleString() : '未知时间'
        const ok = confirm(
          `备份包含 ${summary.sessions} 条专注记录、${summary.tasks} 个任务、${summary.plans} 个计划与 ${summary.configs} 项配置（导出于 ${when}）。\n\n恢复将覆盖当前全部数据，确定继续吗？`,
        )
        if (!ok) return
        await restoreBackup(payload)
        setImportMsg('✅ 恢复完成，正在重新加载…')
        setTimeout(() => location.reload(), 800)
      } catch (err) {
        setImportMsg(err instanceof Error ? `导入失败：${err.message}` : '导入失败：文件格式无效')
        setTimeout(() => setImportMsg(''), 4000)
      }
    }
    input.click()
  }

  async function handleCheckUpdate() {
    setChecking(true)
    setUpdateMsg('检查中…')
    setFoundUpdate(null)
    const info = await checkUpdate()
    setChecking(false)
    if (!info) {
      setUpdateMsg('检查失败，请稍后再试')
    } else if (info.hasUpdate) {
      setFoundUpdate(info)
      setUpdateMsg('')
    } else {
      setUpdateMsg(`已是最新版本（v${APP_VERSION}）`)
    }
    setTimeout(() => setUpdateMsg(''), 4000)
  }

  function openDownload(url: string) {
    window.open(url || DOWNLOAD_PAGE, '_blank')
  }

  async function doIgnoreBattery() {
    await requestIgnoreBattery()
    // 用户从系统页返回后重新读取状态
    setTimeout(() => { void isIgnoringBattery().then(setIgnoringBattery) }, 1500)
  }

  return (
    <div className="panel profile-panel">
      {/* 账号 */}
      <section className="profile-section">
        <h3 className="profile-sec-title">账号</h3>
        {loggedIn && account ? (
          <>
            <div className="profile-row">
              <div>
                <div className="profile-row-label">{account.nickname}</div>
                <div className="profile-row-sub">
                  {account.vip ? `🎫 ${account.vipLabel}` : account.vipLabel}
                </div>
              </div>
              <button className="btn ghost" onClick={logout}>退出登录</button>
            </div>
            <p className="profile-row-sub">网易云登录仅用于播放你有权限的歌曲，cookie 只存本机、不上传。</p>
          </>
        ) : (
          <>
            <div className="profile-row">
              <span className="profile-row-label">未登录网易云</span>
              <button className="btn primary" onClick={onGoMusic}>去扫码登录</button>
            </div>
            <p className="profile-row-sub">登录后可播放你的歌单与会员曲目；不登录也能使用番茄钟、声景与全部本地功能。</p>
          </>
        )}
      </section>

      {/* 检查更新 */}
      <section className="profile-section">
        <h3 className="profile-sec-title">检查更新</h3>
        <div className="profile-row">
          <div>
            <div className="profile-row-label">当前版本 v{APP_VERSION}</div>
            {updateMsg && <div className="profile-row-sub">{updateMsg}</div>}
          </div>
          <button className="btn" onClick={handleCheckUpdate} disabled={checking}>
            {checking ? '检查中…' : '检查更新'}
          </button>
        </div>
        {foundUpdate && (
          <div className="update-found">
            <div className="profile-row-label">发现新版本 v{foundUpdate.versionName}</div>
            {foundUpdate.notes && <p className="profile-row-sub">{foundUpdate.notes}</p>}
            <button className="btn primary" style={{ marginTop: 8 }} onClick={() => openDownload(foundUpdate.url)}>
              去下载
            </button>
          </div>
        )}
        <SettingRow label="启动时自动检查（每日一次）">
          <ToggleSwitch on={autoUpdate} onChange={(v) => { setAutoUpdate(v); setAutoCheckEnabled(v) }} />
        </SettingRow>
        <button className="btn ghost" style={{ fontSize: 12 }} onClick={() => openDownload(DOWNLOAD_PAGE)}>
          打开下载页
        </button>
      </section>

      {/* 后台保活（仅 APK） */}
      {isNativeApp() && (
        <section className="profile-section">
          <h3 className="profile-sec-title">后台保活</h3>
          <div className="profile-row">
            <span className="profile-row-label">
              后台运行：
              <span className={`status-pill ${ignoringBattery ? 'ok' : 'warn'}`}>
                {ignoringBattery == null ? '检测中' : ignoringBattery ? '已允许' : '受限'}
              </span>
            </span>
            <button className="btn" onClick={doIgnoreBattery}>允许后台运行</button>
          </div>
          <div className="profile-row">
            <span className="profile-row-label">自启动</span>
            <button className="btn" onClick={() => void openAutoStart()}>开启自启动</button>
          </div>
          <p className="profile-row-sub">
            国产系统默认会限制后台。开启这两项后，即使 App 被清理，专注/休息到点也能准时提醒你。
          </p>
        </section>
      )}

      {/* 数据备份 */}
      <section className="profile-section">
        <h3 className="profile-sec-title">数据备份</h3>
        <div className="profile-row">
          <span className="profile-row-label">全量备份 / 恢复</span>
          <span>
            <button className="btn" onClick={handleExport} style={{ marginRight: 8 }}>导出</button>
            <button className="btn" onClick={handleImport}>恢复</button>
          </span>
        </div>
        <p className="profile-row-sub">
          包含专注记录、任务、计划与全部偏好；不含网易云登录与 API Key。恢复会覆盖当前数据，操作前会再次确认。
        </p>
        {importMsg && <p className="import-msg">{importMsg}</p>}
      </section>

      {/* 偏好设置 —— 折叠分区 */}
      <section className="profile-section">
        <h3 className="profile-sec-title">偏好设置</h3>

        <Collapsible title="专注配置">
          <SettingRow label="专注时长（分钟）">
            <NumInput value={focusMin} min={5} max={90} onChange={setFocusMin} />
          </SettingRow>
          <SettingRow label="短休息（分钟）">
            <NumInput value={shortBreak} min={1} max={30} onChange={setShortBreak} />
          </SettingRow>
          <SettingRow label="长休息（分钟）">
            <NumInput value={longBreak} min={5} max={60} onChange={setLongBreak} />
          </SettingRow>
          <SettingRow label="心流延长上限（分钟）">
            <NumInput value={maxFlow} min={5} max={60} onChange={setMaxFlow} />
          </SettingRow>
          <SettingRow label="每 N 轮长休息">
            <NumInput value={cyclesLong} min={2} max={8} onChange={setCyclesLong} />
          </SettingRow>
          <button className="btn primary" style={{ marginTop: 8, width: '100%' }} onClick={saveFocus}>
            保存专注配置
          </button>
        </Collapsible>

        <Collapsible title="Agent 规则">
          <SettingRow label="声景自动联动">
            <ToggleSwitch on={autoSound} onChange={(v) => { setAutoSound(v); toggleRule('phaseSoundscape', v) }} />
          </SettingRow>
          <SettingRow label="音乐专注压音">
            <ToggleSwitch on={musicDuck} onChange={(v) => { setMusicDuck(v); toggleRule('musicDuck', v) }} />
          </SettingRow>
          <SettingRow label="低谷时段提醒">
            <ToggleSwitch on={energySuggest} onChange={(v) => { setEnergySuggest(v); toggleRule('energySuggestion', v) }} />
          </SettingRow>
          <SettingRow label="任务精力匹配">
            <ToggleSwitch on={taskAware} onChange={(v) => { setTaskAware(v); toggleRule('taskAwareness', v) }} />
          </SettingRow>
          <SettingRow label="连续专注提醒">
            <ToggleSwitch on={longSess} onChange={(v) => { setLongSess(v); toggleRule('longSession', v) }} />
          </SettingRow>
          <SettingRow label="休息舒缓联动">
            <ToggleSwitch on={breakSoothe} onChange={(v) => { setBreakSoothe(v); toggleRule('breakSoothe', v) }} />
          </SettingRow>
          <p className="profile-row-sub">休息舒缓：进入休息时自动降低音乐播放速率（音高不变），营造慢节奏氛围。</p>
        </Collapsible>

        <Collapsible title="声景定时">
          <SettingRow label="按时段自动切换预设">
            <ToggleSwitch on={soundSchedule} onChange={(v) => { setSoundSchedule(v); setScheduleEnabled(v) }} />
          </SettingRow>
          <p className="profile-row-sub">
            上午深度专注 · 下午轻度工作 · 晚间放松 · 深夜雨声；仅在声景播放中跨时段时平滑切换（当前：{currentSlotLabel()}）。
          </p>
        </Collapsible>

        <Collapsible title={isNative() ? '到点通知' : '浏览器通知'}>
          <SettingRow label={`权限状态：${permLabel(notifyPerm)}`}>
            {notifyPerm !== 'granted' && <button className="btn" onClick={reqNotify}>请求权限</button>}
          </SettingRow>
        </Collapsible>

        <Collapsible title="AI 助手">
          <SettingRow label="启用 LLM 建议">
            <ToggleSwitch on={llmEnabled} onChange={(v) => { setLLMState(v); setLLMEnabled(v) }} />
          </SettingRow>
          <SettingRow label="提供商">
            <select
              className="num-input"
              value={llmProvider}
              style={{ width: 100 }}
              onChange={(e) => { const p = e.target.value as LLMProvider; setLLMProvider(p); setProvider(p) }}
            >
              <option value="mock">Mock（规则）</option>
              <option value="deepseek">DeepSeek</option>
            </select>
          </SettingRow>
          {llmProvider === 'deepseek' && (
            <>
              <div className="embed-form" style={{ marginTop: 4 }}>
                <input
                  className="text-input"
                  type="password"
                  value={llmKey}
                  placeholder="粘贴你的 DeepSeek API Key"
                  onChange={(e) => setLLMKey(e.target.value)}
                  onBlur={() => setAPIKey(llmKey)}
                />
                <button className="btn primary" onClick={() => setAPIKey(llmKey)}>保存</button>
              </div>
              {llmKey && (
                <button
                  className="btn ghost"
                  style={{ fontSize: 11, marginTop: 4, padding: '2px 8px' }}
                  onClick={() => { setLLMKey(''); setAPIKey('') }}
                >
                  清除 Key
                </button>
              )}
            </>
          )}
          <p className="profile-row-sub">
            {llmEnabled
              ? (llmProvider === 'deepseek'
                  ? (llmKey
                      ? '✅ DeepSeek v4 Flash · 已配置 Key'
                      : '⚠️ 未配置 Key，暂时降级为规则引擎（Key 仅存本机浏览器）')
                  : 'ℹ️ Mock 规则引擎（无网络请求）')
              : '已关闭 LLM 建议，仅使用规则引擎'}
          </p>
        </Collapsible>

        <Collapsible title="设备协同">
          <SettingRow label="阶段转换震动提醒">
            <ToggleSwitch on={haptics} onChange={(v) => { setHaptics(v); setHapticsEnabled(v) }} />
          </SettingRow>
          <SettingRow label={`设备支持：${isHapticsSupported() ? '✅ 支持震动' : '❌ 不支持'}`}>
            {isHapticsSupported() && <button className="btn" onClick={() => vibrate('test')}>测试震动</button>}
          </SettingRow>
          <SettingRow label="专注期间屏幕常亮">
            <ToggleSwitch on={wakeLock} onChange={(v) => { setWakeLock(v); setWakeLockEnabled(v) }} />
          </SettingRow>
          {isNative() && (
            <>
              <SettingRow label="实况通知（灵动岛）">
                <ToggleSwitch on={liveTimer} onChange={(v) => { setLiveTimer(v); setLiveTimerEnabled(v) }} />
              </SettingRow>
              <p className="profile-row-sub">
                {promoted
                  ? '✅ 本机支持状态栏胶囊 + 锁屏实况卡片'
                  : 'ℹ️ 本机未开启促升：可在「应用通知设置 → 实况通知」中允许；否则降级为常驻倒计时通知'}
              </p>
            </>
          )}
          <p className="profile-row-sub">
            屏幕常亮防止锁屏后计时器被系统暂停（{isWakeLockSupported() ? '✅ 当前设备支持' : '❌ 当前设备不支持'}）。
          </p>
        </Collapsible>
      </section>

      {/* 隐私与协议：六项文档统一来自 policies.ts，与首启同意弹窗共用 */}
      <section className="profile-section">
        <h3 className="profile-sec-title">隐私与协议</h3>
        {POLICY_DOCS.map((doc) => (
          <div key={doc.key}>
            <button className="profile-policy-toggle" onClick={() => setPolicyOpen(policyOpen === doc.key ? '' : doc.key)}>
              {doc.title} <span>{policyOpen === doc.key ? '▾' : '▸'}</span>
            </button>
            {policyOpen === doc.key && (
              <div className="policy-block">
                {doc.content}
                {doc.key === 'permissions' && isNativeApp() && (
                  <button className="btn" style={{ marginTop: 10 }} onClick={() => { void openAppSettings() }}>
                    前往系统权限设置 ▸
                  </button>
                )}
                {doc.key === 'feedback' && (
                  <button className="btn" style={{ marginTop: 10 }} onClick={() => window.open('https://github.com/Merrain206/Flowtide/issues', '_blank')}>
                    去 GitHub 反馈 ▸
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </section>

      {/* 更多入口 + 版本 */}
      <section className="profile-section">
        <div className="profile-row profile-entry" onClick={onOpenGuide}>
          <span className="profile-row-label">功能引导</span>
          <span className="profile-row-sub">重播 ▸</span>
        </div>
        <div className="profile-row profile-entry" onClick={onOpenDev}>
          <span className="profile-row-label">开发者面板</span>
          <span className="profile-row-sub">Ctrl+Shift+D ▸</span>
        </div>
        <p className="profile-version">Flowtide v{APP_VERSION} · 数据仅存于本地 (local-first)</p>
      </section>
    </div>
  )
}

// ── 子组件 ──────────────────────────────────────────────

function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`collapsible ${open ? 'open' : ''}`}>
      <button className="collapsible-head" onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <span className="collapsible-arrow">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  )
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="setting-row">
      <span className="setting-row-label">{label}</span>
      {children}
    </div>
  )
}

function NumInput({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      className="num-input"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}

function ToggleSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`switch ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
      aria-label="toggle"
    />
  )
}

function permLabel(perm: string): string {
  switch (perm) {
    case 'granted': return '已授权'
    case 'denied': return '已拒绝'
    default: return '未请求'
  }
}
