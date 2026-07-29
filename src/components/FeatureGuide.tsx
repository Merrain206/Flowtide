/**
 * 功能引导浮层 —— 交互式新手导览
 *
 * 点击 ? 按钮激活，在各面板元素旁浮现说明气泡。
 * 高亮目标元素 + 半透明遮罩 + 步骤导航。
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { GUIDE_STEPS, QUICK_TOUR_STEPS, type GuideStep } from '../data/guide-steps'

interface Props {
  active: boolean
  quickTour?: boolean
  onClose: () => void
}

export function FeatureGuide({ active, quickTour, onClose }: Props) {
  const steps = quickTour ? QUICK_TOUR_STEPS : GUIDE_STEPS
  const [current, setCurrent] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)

  // 获取目标元素位置（窄屏先滚到可见处再测量）
  useEffect(() => {
    if (!active) return
    const step = steps[current]
    if (!step) return
    const el = document.querySelector(step.target)
    if (!el) {
      setRect(null)
      return
    }
    if (isMobile()) {
      el.scrollIntoView({ block: 'center', behavior: 'auto' })
      // 等滚动落位后再测量高亮框位置
      const t = window.setTimeout(() => setRect(el.getBoundingClientRect()), 80)
      return () => window.clearTimeout(t)
    }
    setRect(el.getBoundingClientRect())
  }, [active, current, steps])

  // Esc 关闭
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (!active) return
    if (e.key === 'Escape') onClose()
    if (e.key === 'ArrowRight' || e.key === 'Enter') next()
    if (e.key === 'ArrowLeft') prev()
  }, [active, current, steps.length])

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  // 重置步骤
  useEffect(() => {
    if (active) setCurrent(0)
  }, [active])

  function next() {
    if (current < steps.length - 1) setCurrent((c) => c + 1)
    else onClose()
  }

  function prev() {
    if (current > 0) setCurrent((c) => c - 1)
  }

  if (!active) return null

  const step = steps[current]
  const isLast = current === steps.length - 1
  const isFirst = current === 0

  return (
    <>
      {/* 遮罩层 */}
      <div className="guide-overlay" onClick={onClose} />

      {/* 高亮框 */}
      {rect && (
        <div
          className="guide-highlight"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
          }}
        />
      )}

      {/* 引导气泡 */}
      <div
        ref={bubbleRef}
        className={`guide-bubble guide-${step.position}`}
        style={getBubbleStyle(rect, step.position)}
      >
        <div className="guide-step-info">
          <span className="guide-step-no">{current + 1}/{steps.length}</span>
        </div>
        <h3 className="guide-title">{step.title}</h3>
        <p className="guide-desc">{step.description}</p>
        <div className="guide-nav">
          <button
            className="btn ghost guide-prev"
            onClick={prev}
            disabled={isFirst}
          >
            上一步
          </button>
          <button className="btn primary guide-next" onClick={next}>
            {isLast ? '完成' : '下一步'}
          </button>
        </div>
      </div>
    </>
  )
}

/** 窄屏（手机）判定：与 index.css 的 640px 断点保持一致 */
function isMobile(): boolean {
  return window.innerWidth <= 640
}

/** 根据目标元素位置计算气泡定位 */
function getBubbleStyle(
  rect: DOMRect | null,
  position: GuideStep['position'],
): React.CSSProperties {
  // 手机端：左右定位会飘出屏幕，统一改为底部固定卡片
  if (isMobile()) {
    return { position: 'fixed', left: 12, right: 12, bottom: 16, transform: 'none' }
  }

  if (!rect) {
    return { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }

  const gap = 16
  switch (position) {
    case 'right':
      return {
        position: 'fixed',
        top: rect.top + rect.height / 2,
        left: rect.right + gap,
        transform: 'translateY(-50%)',
      }
    case 'left':
      return {
        position: 'fixed',
        top: rect.top + rect.height / 2,
        right: window.innerWidth - rect.left + gap,
        transform: 'translateY(-50%)',
      }
    case 'bottom':
      return {
        position: 'fixed',
        top: rect.bottom + gap,
        left: rect.left + rect.width / 2,
        transform: 'translateX(-50%)',
      }
    case 'top':
      return {
        position: 'fixed',
        bottom: window.innerHeight - rect.top + gap,
        left: rect.left + rect.width / 2,
        transform: 'translateX(-50%)',
      }
  }
}
