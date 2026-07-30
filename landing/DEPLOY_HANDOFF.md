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
