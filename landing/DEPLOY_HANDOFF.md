# Flowtide 网页资产交接文档（给部署 AI）

> 本文档描述 Flowtide 应用的全部对外网页资产，用于更新 merrain.cn 站点，
> 让用户可以了解并下载 Flowtide。请通读后再动手。

## 一、资产清单（本目录 `landing/`）

| 文件 | 作用 | 说明 |
|---|---|---|
| `index.html` | **介绍页 + 下载页**（自包含单文件） | 全部样式内联，无 JS、无外部依赖；含产品介绍、4 张真机截图画廊、6 项功能矩阵、安装说明、下载按钮 |
| `assets/shot-home.png` | 截图：番茄钟主界面 + 任务队列 | index.html 内相对路径引用 `assets/xxx.png`，**必须与 index.html 保持相对位置** |
| `assets/shot-sound.png` | 截图：三档声景面板 | 同上 |
| `assets/shot-plan.png` | 截图：AI 目标计划浮窗 | 同上 |
| `assets/shot-extract.png` | 截图：AI 日程提取浮窗 | 同上 |
| `latest.json` | **应用内自动更新的检查源** | ⚠️ 结构和字段名严禁改动（versionCode / versionName / url / notes），App 靠它提示更新 |
| `flowtide-0.9.3.apk` | 安装包（不在仓库里，已在服务器上） | 3,742,072 字节；文件名约定 `flowtide-{版本号}.apk` |
| `app/`（服务器目录，构建产物不入库） | **在线尝鲜版**（完整 Web App） | 由 `npm run build:web` 产出（base=/download/flowtide/app/），发版脚本自动同步；供 Windows/Mac 浏览器和鸿蒙 NEXT 用户使用 |

## 二、当前线上状态（截至 v0.9.3）

以上文件已全部部署在服务器 `/var/www/flowtide/`（assets 截图除外，随下次发布同步），
通过 Nginx 暴露为：

- 下载页：`https://merrain.cn/download/flowtide/`
- APK 直链：`https://merrain.cn/download/flowtide/flowtide-0.9.3.apk`
- 更新检查：`https://merrain.cn/download/flowtide/latest.json`
- 在线尝鲜版：`https://merrain.cn/download/flowtide/app/`（PWA，可「安装为应用」）

**这四个 URL 已被写进 App 内部或对外分发，路径不可变更。**
如果要把介绍页迁到别的路径（如 `merrain.cn/flowtide`），可以做跳转或复制一份，
但 `/download/flowtide/latest.json` 和 APK 直链必须原地保留。

## 三、希望你（部署 AI）做的事

1. 把 `assets/` 目录的 4 张截图上传到 `/var/www/flowtide/assets/`（若尚未存在）
2. 确认 `https://merrain.cn/download/flowtide/` 打开后截图正常显示
3. **在 merrain.cn 主站加一个 Flowtide 的入口**（导航/卡片均可），指向上面的介绍页
4. 可选：给 `/download/flowtide/assets/` 下的 PNG 配置长缓存（immutable），
   给 `latest.json` 配置不缓存或短缓存（App 更新检查要拿到最新值）

## 四、红线（务必遵守）

- ❌ 不要改 `latest.json` 的字段结构和现有 URL 路径
- ❌ 不要重命名/移动已上线的 APK 文件（老版本 App 的更新提示直链会 404）
- ❌ 不要动 `app/` 目录的内容（发版脚本会整目录替换，手改会被覆盖；内部资源带哈希文件名，缺文件会白屏）
- ❌ 不要在任何页面源码中出现服务器 IP，一律用 `merrain.cn` 域名
- ✅ `index.html` 可以自由美化/整合进主站风格，但保留下载按钮、在线尝鲜版入口、安装说明和 local-first 隐私声明

## 五、产品一句话介绍（写文案可直接用）

> **Flowtide 心流潮汐** —— 让专注与休息像潮汐一样自然涨落的 AI 专注番茄钟。
> 心流保护不打断、三档专业声景、网易云音乐联动、AI 目标拆解与日程提取、
> 精力热力图复盘。数据全部存在本机，无广告无统计，安装包不到 4 MB。
> 支持 Android 7.0+ 与鸿蒙 4.x（APK）；Windows / Mac / 鸿蒙 NEXT 可用在线尝鲜版。当前版本 v0.9.3。

## 六、同步到博客主站（merrain.cn 首页）的具体指引

主站是 Next.js 15 + MDX 博客（MyBlogger，Nginx 反代 3000 端口，Cloudflare CDN），
已有「精选项目」卡片体系（`/projects`）。**推荐做法：把 Flowtide 作为一个精选项目加进去**，
与现有项目（课堂 AI 领航员、AI 五子棋等）同栏展示，自动出现在首页精选区。

### 项目卡片字段（照着现有项目数据结构填）

| 字段 | 内容 |
|---|---|
| 标题 | Flowtide 心流潮汐 |
| 标记 | 精选 |
| 描述 | AI 专注番茄钟：心流保护不打断、双层声景混音、网易云音乐联动、AI 目标拆解与日程提取、精力热力图复盘。local-first，数据只存本机，安装包不到 4 MB，已发布 Android 版与在线版。 |
| 技术标签 | React 19 / TypeScript / Vite / Capacitor / PWA / Web Audio / IndexedDB / DeepSeek |
| 演示链接 | `https://merrain.cn/download/flowtide/app/`（在线尝鲜版，点开即用） |
| 下载/官网链接 | `https://merrain.cn/download/flowtide/`（介绍页，含 APK 下载） |
| 源码链接 | `https://github.com/Merrain206/Flowtide` |
| 配图（可选） | 可直接引用线上截图 `https://merrain.cn/download/flowtide/assets/shot-home.png`，或下载到博客仓库本地引用（竖屏 1220×2712，建议裁切/压缩后用） |

### 项目详情页（若博客支持 MDX 详情页，可选）

可建 `/projects/flowtide` 详情页，素材都是现成的：
- 四张线上截图：`…/assets/shot-home.png`、`shot-sound.png`、`shot-plan.png`、`shot-extract.png`
- 功能介绍文案：直接参考介绍页 `https://merrain.cn/download/flowtide/` 的六张功能卡 + 「为什么叫心流潮汐」段落
- 页尾放两个按钮：「在线体验」→ app/，「下载 Android 版」→ 介绍页

### 可选加分项

- 首页 Hero 区或导航栏加一个轻量入口（如「🌊 Flowtide」）直指介绍页
- 写一篇博客文章介绍开发历程（素材同上），文末挂项目链接

### 注意事项（针对主站架构）

1. **路由不要冲突**：`/download/flowtide/` 是 Nginx 静态直出目录（不进 Next.js），
   博客新增页面/重写规则不要占用 `/download` 前缀，也不要在 Next.js 里加同名路由。
2. **Cloudflare 缓存**：博客页面更新后若线上不变，去 Cloudflare 控制台清一下缓存（或等 TTL 过期）。
3. **链接用完整 https 域名**：介绍页不在 Next.js 应用内，用 `<a href>` 而非 Next 的 `<Link>`，
   避免客户端路由拦截 404。
4. **老规矩不变**：第四节红线全部适用，尤其是不要碰 `latest.json`、APK 和 `app/` 目录。

### ⚠ 重要：版本号不要硬编码（务必读这条）

博客里的 `/flowtide`（或 `/projects/flowtide`）详情页**绝对不要把版本号、APK 文件名写死**。
Flowtide 会持续发版（0.9.3 → 0.9.4 → …），写死的话每次发版这个页面都会过期、
下载链接还会指向已被替换掉的旧文件名（404）。

**唯一可信的版本源**是 `https://merrain.cn/download/flowtide/latest.json`，结构：
```json
{ "versionCode": 6, "versionName": "0.9.4",
  "url": "https://merrain.cn/download/flowtide/flowtide-0.9.4.apk", "notes": "..." }
```

**推荐做法（三选一，按省心程度排序）：**

1. **最省心：详情页只放一个「下载 / 了解更多」按钮，直接跳** `https://merrain.cn/download/flowtide/`。
   那个介绍页由发布脚本自动更新，永远是最新版，博客侧零维护。
2. **要在博客内显示版本号**：客户端 `fetch('https://merrain.cn/download/flowtide/latest.json')`
   动态渲染版本号和下载链接（用 `versionName` 和 `url` 字段），不要写常量。
3. **服务端渲染**：Next.js 里用 `fetch(latest.json, { cache: 'no-store' })` 或短 `revalidate`
   在 SSR/ISR 阶段取版本号，别 build 时写死。

**下载按钮的 href 永远用 `latest.json` 里的 `url` 字段**，不要自己拼 `flowtide-0.9.3.apk`——
旧版本 APK 发新版时会被同名替换策略清掉，写死的链接会 404。

配图同理：截图会随版本更新，建议热链 `https://merrain.cn/download/flowtide/assets/shot-*.png`
而不是复制到博客 `/images/` 下（复制的副本不会随发版更新）。
