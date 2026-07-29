/**
 * 首次启动隐私同意弹窗（v0.9.1）
 *
 * 用户第一次进入应用时强制弹出，展示用户协议 / 隐私政策等全部文档入口，
 * 必须亲手点「同意并继续」才能使用；点「不同意」则退出应用（Web 端停留在拒绝页）。
 */

import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { POLICY_DOCS, markConsented } from '../data/policies'

interface Props {
  onAgree: () => void
}

export function PrivacyConsent({ onAgree }: Props) {
  const [openDoc, setOpenDoc] = useState<string>('')
  const [refused, setRefused] = useState(false)

  const handleAgree = () => {
    markConsented()
    onAgree()
  }

  const handleRefuse = () => {
    if (Capacitor.isNativePlatform()) {
      void CapApp.exitApp()
    } else {
      setRefused(true)
    }
  }

  if (refused) {
    return (
      <div className="consent-overlay">
        <div className="consent-card">
          <div className="consent-emoji">🌊</div>
          <h3 className="consent-title">感谢你的了解</h3>
          <p className="consent-desc">
            不同意隐私政策将无法使用 Flowtide。如果你改变主意，随时欢迎回来。
          </p>
          <button className="btn primary consent-agree" onClick={() => setRefused(false)}>
            重新查看
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="consent-overlay">
      <div className="consent-card">
        <div className="consent-emoji">🌊</div>
        <h3 className="consent-title">欢迎使用 Flowtide</h3>
        <p className="consent-desc">
          在开始之前，请阅读并同意以下协议。Flowtide 是 local-first 应用：
          你的数据保存在本机，我们不设任何统计与广告 SDK。
        </p>

        <div className="consent-docs">
          {POLICY_DOCS.map((doc) => (
            <div key={doc.key}>
              <button
                className="consent-doc-toggle"
                onClick={() => setOpenDoc(openDoc === doc.key ? '' : doc.key)}
              >
                《{doc.title}》
                <span>{openDoc === doc.key ? '▾' : '▸'}</span>
              </button>
              {openDoc === doc.key && (
                <div className="policy-block consent-doc-body">{doc.content}</div>
              )}
            </div>
          ))}
        </div>

        <button className="btn primary consent-agree" onClick={handleAgree}>
          同意并继续
        </button>
        <button className="btn ghost consent-refuse" onClick={handleRefuse}>
          不同意
        </button>
      </div>
    </div>
  )
}
