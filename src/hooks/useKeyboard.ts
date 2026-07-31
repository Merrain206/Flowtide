/**
 * 键盘快捷键 hook（v0.5）
 *
 * Space:       开始/暂停/继续专注
 * L:           落地休息（flow 阶段）
 * S:           跳过休息（break 阶段）
 * 1-5:         切换栏目 Tab
 * ?:           打开功能引导
 * Esc:         关闭浮层/抖屉
 * Ctrl+Shift+D: 打开开发者面板
 */

import { useEffect } from 'react'

export interface KeyboardCallbacks {
  onToggleFocus: () => void
  onLandRest: () => void
  onSkipBreak: () => void
  onSwitchTab: (tab: number) => void
  onOpenGuide: () => void
  onCloseOverlay: () => void
  onOpenDev?: () => void
}

export function useKeyboard(callbacks: KeyboardCallbacks) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // 忽略输入框内的按键
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          callbacks.onToggleFocus()
          break
        case 'l':
        case 'L':
          callbacks.onLandRest()
          break
        case 's':
        case 'S':
          callbacks.onSkipBreak()
          break
        case '1':
          callbacks.onSwitchTab(0)
          break
        case '2':
          callbacks.onSwitchTab(1)
          break
        case '3':
          callbacks.onSwitchTab(2)
          break
        case '4':
          callbacks.onSwitchTab(3)
          break
        case '5':
          callbacks.onSwitchTab(4)
          break
        case '?':
          callbacks.onOpenGuide()
          break
        case 'Escape':
          callbacks.onCloseOverlay()
          break
        case 'd':
        case 'D':
          if (e.ctrlKey && e.shiftKey) {
            e.preventDefault()
            callbacks.onOpenDev?.()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [callbacks])
}
