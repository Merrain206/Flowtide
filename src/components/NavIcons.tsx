/**
 * 底部导航栏目图标（v0.9 模块三）
 *
 * 统一 stroke 风格、currentColor、1.8px 描边，呼应页头 wave-deco 的手绘感。
 * 任务=清单勾选 / 声景=波纹 / 音乐=音符 / 复盘=柱状图 / 我的=人像。
 */

interface IconProps {
  className?: string
}

const common = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

/** 任务：清单 + 勾选 */
export function IconTasks({ className }: IconProps) {
  return (
    <svg className={className} {...common}>
      <path d="M9 5h11M9 12h11M9 19h11" />
      <path d="M3.5 5l1.2 1.2L7 4" />
      <path d="M3.5 12l1.2 1.2L7 11" />
      <path d="M3.5 19l1.2 1.2L7 18" />
    </svg>
  )
}

/** 声景：三层波纹 */
export function IconSound({ className }: IconProps) {
  return (
    <svg className={className} {...common}>
      <path d="M2 12c2.5-4 4.5-4 7 0s4.5 4 7 0" />
      <path d="M2 6.5c2.5-4 4.5-4 7 0s4.5 4 7 0" opacity="0.55" />
      <path d="M2 17.5c2.5-4 4.5-4 7 0s4.5 4 7 0" opacity="0.55" />
      <path d="M20 8v8" />
    </svg>
  )
}

/** 音乐：音符 */
export function IconMusic({ className }: IconProps) {
  return (
    <svg className={className} {...common}>
      <path d="M9 18V6l10-2v11" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="16" cy="15" r="3" />
    </svg>
  )
}

/** 复盘：柱状图 */
export function IconStats({ className }: IconProps) {
  return (
    <svg className={className} {...common}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  )
}

/** 我的：人像 */
export function IconProfile({ className }: IconProps) {
  return (
    <svg className={className} {...common}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" />
    </svg>
  )
}
