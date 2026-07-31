/**
 * PWA 图标生成（v0.9.4）
 *
 * 从 public/favicon.svg 渲染出 manifest 需要的 PNG 图标：
 *   icon-192.png / icon-512.png            —— purpose: any（保留圆角透明角）
 *   icon-maskable-192.png / -512.png       —— purpose: maskable（全出血深底 + 内容缩进安全区）
 *
 * 用法：node scripts/gen-icons.mjs
 * 依赖：@capacitor/assets 自带的 sharp，无需额外安装。
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pub = path.join(root, 'public')
const svg = await readFile(path.join(pub, 'favicon.svg'))

/** 与 favicon.svg 的底色一致，maskable 全出血背景 */
const BG = '#0b1020'

for (const size of [192, 512]) {
  // any：直接等比渲染
  await sharp(svg, { density: 300 })
    .resize(size, size)
    .png()
    .toFile(path.join(pub, `icon-${size}.png`))

  // maskable：内容占 80%（安全区），四周补满底色
  const inner = Math.round(size * 0.8)
  const content = await sharp(svg, { density: 300 }).resize(inner, inner).png().toBuffer()
  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: content, gravity: 'centre' }])
    .png()
    .toFile(path.join(pub, `icon-maskable-${size}.png`))
}

console.log('已生成 public/icon-{192,512}.png 与 icon-maskable-{192,512}.png')
