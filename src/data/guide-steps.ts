/**
 * 功能引导步骤配置（纯数据，与组件分离便于国际化）
 *
 * 每个步骤指定目标 CSS 选择器、标题、描述和气泡位置。
 */

export interface GuideStep {
  /** CSS 选择器，定位目标 DOM 元素 */
  target: string
  /** 步骤标题 */
  title: string
  /** 步骤描述 */
  description: string
  /** 气泡相对于目标的位置 */
  position: 'top' | 'bottom' | 'left' | 'right'
}

export const GUIDE_STEPS: GuideStep[] = [
  {
    target: '.timer-panel',
    title: '番茄钟（常驻顶部）',
    description: '你的专注核心，切到任何栏目都能看到它。点击「开始专注」进入番茄钟，到点后不强制打断——心流保护让你自然延长，随时可以「落地休息」。',
    position: 'bottom',
  },
  {
    target: '.ring-wrap',
    title: '环形进度',
    description: '直观显示当前阶段剩余时间。心流延长阶段进度环反向填充，展示已延长的量。',
    position: 'bottom',
  },
  {
    target: '.bottom-nav',
    title: '底部导航（全新）',
    description: '五个栏目一键切换：任务清单、声景混音、音乐播放、专注复盘，以及新增的「我的」。声景播放时图标上会有小圆点提示。',
    position: 'top',
  },
  {
    target: '.task-input-row',
    title: '认知负荷与番茄数',
    description: '🧠 高认知 = 需要深度思考的任务（写方案、编程、学习）；🌿 低认知 = 常规事务（回邮件、整理）。Agent 会据此推荐声景和高效时段。🍅 数字是预估完成该任务需要的番茄钟个数（1 个 ≈ 一轮专注）。任务栏还能用 AI 一键生成每日计划、从课表提取日程。',
    position: 'bottom',
  },
  {
    target: '.bottom-nav .nav-item:last-child',
    title: '「我的」·设置都在这',
    description: '账号、数据备份、检查更新、隐私协议，以及专注时长、Agent 规则、通知、灵动岛实况、后台保活等全部偏好设置都收纳在这里。复盘栏还有 AI 周报。',
    position: 'top',
  },
  {
    target: '.suggest-bubble',
    title: 'Agent 智能建议',
    description: 'Flowtide 的 AI 助手会根据你的任务、精力画像和专注状态给出建议。建议气泡会在 5 秒后自动消失。',
    position: 'top',
  },
]

/** 精简版快速导览（3 步） */
export const QUICK_TOUR_STEPS: GuideStep[] = [
  GUIDE_STEPS[0], // 番茄钟
  GUIDE_STEPS[2], // 功能页签
  GUIDE_STEPS[4], // 设置入口
]
