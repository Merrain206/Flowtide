/**
 * 隐私与协议静态文案（v0.9.1）
 *
 * 供首次启动同意弹窗（PrivacyConsent）与「我的 → 隐私与协议」共用。
 * Flowtide 是 local-first 应用：除网易云音乐 API 与 AI 建议请求外，
 * 不存在任何数据上报，文案如实描述即可。
 */

export interface PolicyDoc {
  key: string
  title: string
  content: string
}

export const POLICY_DOCS: PolicyDoc[] = [
  {
    key: 'agreement',
    title: '用户协议',
    content: [
      '1. Flowtide（心流潮汐）是一款免费的个人专注辅助工具，供你管理专注时间、任务与声景音乐。',
      '2. 应用数据（专注记录、任务、计划、偏好）全部保存在你的设备本地，你对自己的数据拥有完全控制权，可随时导出、恢复或清除。',
      '3. 音乐播放能力依赖网易云音乐开放接口，你应遵守网易云音乐的用户协议与版权要求，仅播放你有权收听的内容。',
      '4. AI 建议功能会将你输入的文本发送至大模型服务（DeepSeek）以生成结果，请勿输入敏感个人信息。',
      '5. 本应用按「现状」提供，不对因系统限制（如后台被杀导致提醒延迟）造成的损失承担责任。',
      '6. 继续使用本应用即表示你同意本协议与隐私政策。',
    ].join('\n'),
  },
  {
    key: 'privacy',
    title: '隐私政策',
    content: [
      'Flowtide 是一款 local-first 的专注应用，我们的原则是：能不收集就不收集。',
      '· 你的专注记录、任务、计划与全部偏好配置都保存在本机（应用私有存储 / 浏览器 IndexedDB），不会上传到任何服务器。',
      '· 我们不设任何第三方统计、广告或崩溃上报 SDK。',
      '· 网易云登录 cookie 仅保存在本机，用于播放你有权限的歌曲，绝不外发给除网易云接口之外的任何一方。',
      '· 检查更新时仅向我们的服务器请求一个公开的版本描述文件，不携带任何个人信息。',
      '· 你可以随时在「我的 → 账号」退出登录清除 cookie，或通过系统卸载应用来删除全部本地数据。',
    ].join('\n'),
  },
  {
    key: 'collect',
    title: '个人信息收集清单',
    content: [
      '· 专注/休息记录、任务与计划：仅存本机，用于复盘统计。',
      '· 偏好配置（时长、开关等）：仅存本机。',
      '· 网易云登录 cookie：仅存本机，用于音乐播放，可随时退出清除。',
      '· AI 功能输入的文本：仅在你主动使用 AI 功能时发送给大模型服务用于生成结果，我们不留存。',
      '· 我们不收集设备标识、位置、通讯录、相册等任何隐私信息。',
    ].join('\n'),
  },
  {
    key: 'thirdparty',
    title: '第三方共享个人信息清单',
    content: [
      '仅在你主动使用对应功能时，以下信息才会发往第三方，且均为功能必需：',
      '· 网易云音乐接口（经我方代理转发）：登录 cookie、搜索关键词、歌单/歌曲 ID —— 用于扫码登录与音乐播放。',
      '· DeepSeek 大模型服务：你在 AI 计划 / 日程提取 / 周报中输入的文本 —— 用于生成 AI 结果。',
      '除上述外，不存在任何第三方数据共享；我们没有广告、统计或推送 SDK。',
    ].join('\n'),
  },
  {
    key: 'permissions',
    title: '系统权限管理',
    content: [
      '本应用可能申请以下系统权限，均可在系统设置中随时关闭：',
      '· 通知权限：到点提醒专注/休息结束（核心功能）。',
      '· 忽略电池优化 / 自启动：保证被切到后台后到点仍能准时提醒。',
      '· 震动：阶段切换时的触觉反馈。',
      '拒绝以上权限不影响计时等基础功能，仅对应能力不可用。',
    ].join('\n'),
  },
  {
    key: 'feedback',
    title: '建议反馈',
    content: [
      '遇到问题或有任何建议，欢迎反馈：',
      '· GitHub Issues：github.com/Merrain206/Flowtide/issues',
      '· 也可以直接联系开发者本人。',
      '反馈时描述清楚设备型号与操作步骤，能帮我们更快定位问题。',
    ].join('\n'),
  },
]

/** 首次启动隐私同意一次性标记 */
export const PRIVACY_CONSENT_KEY = 'flowtide.privacy.consent.v1'

/** 是否已同意隐私政策与用户协议 */
export function hasConsented(): boolean {
  try {
    return localStorage.getItem(PRIVACY_CONSENT_KEY) === '1'
  } catch {
    return false
  }
}

/** 记录同意 */
export function markConsented(): void {
  try {
    localStorage.setItem(PRIVACY_CONSENT_KEY, '1')
  } catch { /* 忽略 */ }
}
