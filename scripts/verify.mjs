// 插件加载自检：模拟 DSH 的加载流程，验证宿主端与客户端两半是否完好。
// 用法：node scripts/verify.mjs .      （在插件根目录执行）
import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const pkgDir = process.argv[2] ?? '.'
const fail = []
const ok = (m) => console.log('  ✓ ' + m)
const bad = (m) => { console.log('  ✗ ' + m); fail.push(m) }

console.log('插件目录: ' + pkgDir)

// 1. package.json
console.log('\n[1] package.json')
let pkg
try {
  pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
  ok(`name=${pkg.name} version=${pkg.version}`)
  if (pkg.name !== 'dsh-brutal-delete') bad('包名应为 dsh-brutal-delete')
  if (pkg.type !== 'module') bad('type 应为 module')
  if (pkg.main !== 'lib/index.js') bad('main 应为 lib/index.js')
  if (pkg.private === true) bad('private:true 会导致无法发布')
  else ok('非 private，可发布')
  if (pkg.publishConfig?.access !== 'public') bad('publishConfig.access 应为 public')
  else ok('publishConfig 就绪')
  if (!pkg.dsh?.bundle?.patch) bad('缺少 dsh.bundle.patch —— 市场收录会拒绝')
  else ok('dsh.bundle.patch = ' + pkg.dsh.bundle.patch)
  if (pkg.dsh?.client?.platform !== 'web') bad('client.platform 应为 web')
  else ok('client.platform = web')
} catch (e) { bad('package.json 读取失败: ' + e.message) }

// 2. cordis.patch.yml
console.log('\n[2] cordis.patch.yml')
try {
  const patch = readFileSync(join(pkgDir, 'cordis.patch.yml'), 'utf8')
  if (!patch.includes('dsh-brutal-delete')) bad('patch 未含插件 id')
  else ok('patch 含 dsh-brutal-delete')
} catch (e) { bad('patch 读取失败: ' + e.message) }

// 3. dsh.plugin.json
console.log('\n[3] dsh.plugin.json')
try {
  const man = JSON.parse(readFileSync(join(pkgDir, 'dsh.plugin.json'), 'utf8'))
  ok(`name=${man.name} version=${man.version}`)
  if (man.name !== 'dsh-brutal-delete') bad('manifest name 不一致')
  if (pkg !== undefined && man.version !== pkg.version) {
    bad(`版本不一致: package.json=${pkg.version} dsh.plugin.json=${man.version}`)
  } else if (pkg !== undefined) ok('版本号一致')
} catch (e) { bad('dsh.plugin.json 读取失败: ' + e.message) }

// 4. 宿主端入口
console.log('\n[4] 宿主端 lib/index.js')
try {
  const mod = await import(pathToFileURL(join(pkgDir, 'lib/index.js')).href)
  if (mod.name !== 'dsh-brutal-delete') bad('export name 不一致: ' + mod.name)
  else ok('name = dsh-brutal-delete')
  if (!Array.isArray(mod.inject) || mod.inject.length === 0) bad('inject 缺失')
  else ok('inject = ' + mod.inject.join(', '))
  if (typeof mod.apply !== 'function') bad('缺少具名 apply 导出')
  else ok('apply 可调用')
} catch (e) { bad('宿主端加载失败: ' + e.message) }

// 5. 客户端 bundle
console.log('\n[5] 客户端 lib/client.js')
try {
  const src = readFileSync(join(pkgDir, 'lib/client.js'), 'utf8')
  ok(`可读，${src.length} bytes`)
  if (!src.includes('dsh-brutal-delete')) bad('client 未含插件 id')
  else ok('含插件 id')
  if (src.includes('dsh-session-delete')) bad('client 残留旧 id')
  else ok('无旧 id 残留')
  if (!src.includes("'dsh-brutal-delete/delete'")) bad('client 路由路径未更新')
  else ok('路由路径 = dsh-brutal-delete/delete')
  for (const part of ['BatchDot', 'BatchFooter', 'BatchOverlay', 'KeyA', 'Escape', 'Delete']) {
    if (!src.includes(part)) bad('client 缺少 ' + part)
  }
  ok('批量组件与快捷键齐全')
  new Function(src)
  ok('语法有效')
} catch (e) { bad('客户端校验失败: ' + e.message) }

// 6. README
console.log('\n[6] README.md')
try {
  const rd = readFileSync(join(pkgDir, 'README.md'), 'utf8')
  ok(`${rd.length} 字符`)
  if (!rd.includes('暴力')) bad('README 缺中文名')
  else ok('含中文名')
} catch (e) { bad('README 缺失: ' + e.message) }

console.log('\n' + '='.repeat(48))
if (fail.length === 0) {
  console.log('全部通过 ✓  插件可安全加载与发布')
  process.exit(0)
}
console.log(`失败 ${fail.length} 项:`)
fail.forEach((f) => console.log('  - ' + f))
process.exit(1)
