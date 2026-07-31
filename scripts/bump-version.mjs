/**
 * 版本链一键同步（v0.9.4）
 *
 * 版本号散布在 6 处，人肉同步早晚漏一处。本脚本一条命令全部对齐：
 *   1. package.json            version
 *   2. android/app/build.gradle versionName + versionCode（自动 +1，可用 --code 指定）
 *   3. src/core/device/update.ts APP_VERSION
 *   4. public/sw.js             CACHE_NAME
 *   5. landing/latest.json      versionName / versionCode / url / notes（--notes 指定）
 *   6. landing/index.html       APK 文件名与版本号文案
 *
 * 用法：
 *   npm run bump 0.9.4                        # versionCode 自动 +1
 *   npm run bump 0.9.4 -- --code 7            # 手动指定 versionCode
 *   npm run bump 0.9.4 -- --notes "更新说明"   # 顺带写 latest.json 的 notes
 *   npm run bump -- --check                   # 只校验 6 处是否一致，不改文件
 */

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const p = (...seg) => path.join(root, ...seg)

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const version = args.find((a) => /^\d+\.\d+\.\d+$/.test(a))
const codeArg = args.includes('--code') ? parseInt(args[args.indexOf('--code') + 1], 10) : null
const notesArg = args.includes('--notes') ? args[args.indexOf('--notes') + 1] : null

/** 读取 6 处现状 */
async function collect() {
  const pkg = JSON.parse(await readFile(p('package.json'), 'utf8'))
  const gradle = await readFile(p('android', 'app', 'build.gradle'), 'utf8')
  const update = await readFile(p('src', 'core', 'device', 'update.ts'), 'utf8')
  const sw = await readFile(p('public', 'sw.js'), 'utf8')
  const latest = JSON.parse(await readFile(p('landing', 'latest.json'), 'utf8'))
  const landing = await readFile(p('landing', 'index.html'), 'utf8')

  return {
    pkg: pkg.version,
    gradleName: gradle.match(/versionName "([^"]+)"/)?.[1],
    gradleCode: parseInt(gradle.match(/versionCode (\d+)/)?.[1] ?? '0', 10),
    updateTs: update.match(/APP_VERSION = '([^']+)'/)?.[1],
    swCache: sw.match(/CACHE_NAME = 'flowtide-v([^']+)'/)?.[1],
    latestName: latest.versionName,
    latestCode: latest.versionCode,
    landingApk: landing.match(/flowtide-([\d.]+)\.apk/)?.[1],
  }
}

const cur = await collect()

if (checkOnly || !version) {
  const names = [cur.pkg, cur.gradleName, cur.updateTs, cur.swCache, cur.latestName, cur.landingApk]
  const codes = [cur.gradleCode, cur.latestCode]
  const ok = new Set(names).size === 1 && new Set(codes).size === 1
  console.log('当前版本链：')
  console.log(`  package.json      ${cur.pkg}`)
  console.log(`  build.gradle      ${cur.gradleName} (code ${cur.gradleCode})`)
  console.log(`  update.ts         ${cur.updateTs}`)
  console.log(`  sw.js CACHE_NAME  ${cur.swCache}`)
  console.log(`  latest.json       ${cur.latestName} (code ${cur.latestCode})`)
  console.log(`  landing APK 链接  ${cur.landingApk}`)
  console.log(ok ? '✅ 六处一致' : '❌ 存在不一致！')
  if (!version) process.exit(ok ? 0 : 1)
}

if (!version) process.exit(0)

const code = codeArg ?? cur.gradleCode + 1
console.log(`\n同步到 v${version} (versionCode ${code}) …`)

// 1. package.json
{
  const raw = await readFile(p('package.json'), 'utf8')
  await writeFile(p('package.json'), raw.replace(/"version": "[^"]+"/, `"version": "${version}"`))
}
// 2. build.gradle
{
  const raw = await readFile(p('android', 'app', 'build.gradle'), 'utf8')
  await writeFile(p('android', 'app', 'build.gradle'), raw
    .replace(/versionCode \d+/, `versionCode ${code}`)
    .replace(/versionName "[^"]+"/, `versionName "${version}"`))
}
// 3. update.ts
{
  const raw = await readFile(p('src', 'core', 'device', 'update.ts'), 'utf8')
  await writeFile(p('src', 'core', 'device', 'update.ts'), raw
    .replace(/APP_VERSION = '[^']+'/, `APP_VERSION = '${version}'`))
}
// 4. sw.js
{
  const raw = await readFile(p('public', 'sw.js'), 'utf8')
  await writeFile(p('public', 'sw.js'), raw
    .replace(/CACHE_NAME = 'flowtide-v[^']+'/, `CACHE_NAME = 'flowtide-v${version}'`))
}
// 5. latest.json（保留原 notes，除非 --notes 指定）
{
  const latest = JSON.parse(await readFile(p('landing', 'latest.json'), 'utf8'))
  latest.versionCode = code
  latest.versionName = version
  latest.url = `https://merrain.cn/download/flowtide/flowtide-${version}.apk`
  if (notesArg) latest.notes = notesArg
  await writeFile(p('landing', 'latest.json'), JSON.stringify(latest, null, 2) + '\n')
}
// 6. landing/index.html（APK 文件名 + 「v x.y.z」文案）
{
  const raw = await readFile(p('landing', 'index.html'), 'utf8')
  await writeFile(p('landing', 'index.html'), raw
    .replaceAll(/flowtide-[\d.]+\.apk/g, `flowtide-${version}.apk`)
    .replaceAll(/v\d+\.\d+\.\d+/g, `v${version}`))
}

const after = await collect()
const okNames = new Set([after.pkg, after.gradleName, after.updateTs, after.swCache, after.latestName, after.landingApk]).size === 1
const okCodes = after.gradleCode === after.latestCode
if (!okNames || !okCodes) {
  console.error('❌ 同步后校验失败，请手动检查！')
  process.exit(1)
}
console.log(`✅ 六处已全部同步到 v${version} (code ${code})`)
if (!notesArg) console.log('⚠ latest.json 的 notes 仍是上一版文案，发布前记得更新（--notes 或手改）')
