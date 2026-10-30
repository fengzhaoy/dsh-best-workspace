/**
 * 端到端验证"添加工作区"不再卡死：
 * 1. 隔离 profile 安装本插件并启动真实宿主；
 * 2. 断言 cordis 配置钉住了官方 browse 交互对、directory-picker-auto 已停用；
 * 3. 浏览器打开后断言客户端面上是 browse 对话框而非 native 流程；
 * 4. 关掉预览说明、打开"选择工作区"，验证进程内目录浏览器真的渲染出来。
 *
 * 用法：node scripts/verify-directory-flow.mjs
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../', import.meta.url))
const root = await mkdtemp(path.join(tmpdir(), 'dcu-dirflow-host-'))
const home = path.join(root, 'home')
const workspace = path.join(root, 'workspace')
await mkdir(workspace, { recursive: true })
const env = { ...process.env, DSH_HOME: home, DSH_PROFILE: 'web' }

function run(args, extraEnv = env) {
  return new Promise((resolve, reject) => {
    const child = spawn('dsh', args, { cwd: workspace, env: extraEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', data => { output += data })
    child.stderr.on('data', data => { output += data })
    child.on('error', reject)
    child.on('exit', code => (code === 0 ? resolve(output) : reject(new Error(output))))
  })
}

console.log('[1/5] 在隔离 profile 安装本插件…')
await run(['plugin', '--profile', 'web', 'add', repo])

console.log('[2/5] 校验 cordis 配置钉住 browse 交互对…')
const dump = await run(['--profile', 'web', '--dump-config'])
assert.match(dump, /id: directory-picker-browse-backend[\s\S]{0,80}name: '@deepseek-ai\/dsh-host-directory-picker-browse'/, 'browse 宿主后端必须被钉进加载树')
assert.match(dump, /id: directory-picker-browse-surface[\s\S]{0,80}name: '@deepseek-ai\/dsh-client-ui-directory-picker-browse'/, 'browse 客户端面必须被钉进加载树')
const autoRow = dump.split('\n').findIndex(line => line.includes('id: directory-picker') && !line.includes('browse'))
assert.ok(autoRow >= 0, 'directory-picker-auto 行必须仍存在')
assert.match(dump.split('\n').slice(autoRow, autoRow + 5).join('\n'), /disabled: true/, 'directory-picker-auto 行必须被停用')
console.log('      browse 交互对已挂载，auto 行已停用 ✓')

console.log('[3/5] 启动隔离宿主…')
const server = spawn('dsh', ['web', '--no-open', '--port', '0'], { cwd: workspace, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let serverLog = ''
server.stdout.on('data', data => { serverLog += data })
server.stderr.on('data', data => { serverLog += data })
const url = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('宿主启动超时\n' + serverLog)), 90000)
  const inspect = () => {
    const match = serverLog.match(/dsh web: (http:\/\/[^\s]+)/)
    if (match) { clearTimeout(timeout); resolve(match[1]) }
  }
  server.stdout.on('data', inspect)
  server.stderr.on('data', inspect)
  server.once('exit', code => { clearTimeout(timeout); reject(new Error(`宿主提前退出 ${code}\n` + serverLog)) })
})
console.log('      宿主地址：' + url)

const { chromium } = await import('playwright')
const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5000)

  console.log('[4/5] 校验客户端面…')
  const failed = errors.find(text => text.includes('did not activate'))
  assert.equal(failed, undefined, `客户端条目必须全部激活：${failed ?? ''}`)
  const surfaces = await page.evaluate(() => window.__DSH_BOOT__.entries.map(entry => entry.id).filter(id => id.includes('directory-picker')))
  assert.deepEqual(surfaces.sort(), ['@deepseek-ai/dsh-client-ui-directory-picker-browse'], `客户端 directory-picker 面必须是 browse 且仅 browse：${JSON.stringify(surfaces)}`)
  console.log('      客户端面为官方 browse 对话框，native 流程未挂载 ✓')

  console.log('[5/5] 走通"选择工作区"流程…')
  // 关掉"预览版说明"对话框：直接对"继续"按钮派发冒泡 click（React 在根容器监听）。
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('[role=dialog] button')].find(b => (b.textContent || '').trim() === '继续')
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  await page.waitForTimeout(1000)
  // 打开工作区菜单（无工作区时目录流程会自动展开）。
  await page.evaluate(() => {
    const trigger = [...document.querySelectorAll('button[aria-haspopup=menu]')].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes('选择工作区'))
    trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  await page.waitForTimeout(1200)
  const menuItems = await page.evaluate(() => [...document.querySelectorAll('[role=menuitem]')].map(e => (e.textContent || '').trim()).filter(Boolean))
  console.log('      菜单项：' + JSON.stringify(menuItems))
  // 点"打开文件夹/添加工作区"类条目；若菜单里只有一项也直接点。
  const target = menuItems.find(text => /文件夹|工作区|浏览/.test(text)) ?? menuItems[0]
  if (target !== undefined) {
    await page.evaluate(label => {
      const item = [...document.querySelectorAll('[role=menuitem]')].find(e => (e.textContent || '').trim() === label)
      item?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    }, target)
  }
  // 官方 browse 对话框的标题文案（dsh-client-ui-directory-picker-browse locale）。
  let opened = false
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.waitForTimeout(500)
    if (await page.getByText('选择工作区目录', { exact: true }).count() > 0) { opened = true; break }
  }
  assert.ok(opened, '官方 browse 目录浏览器必须弹出（若不弹出说明流程仍被 native 占用或挂死）')
  console.log('      官方 browse 目录浏览器已弹出，无 osascript、不会卡死 ✓')
  await page.screenshot({ path: path.join(root, 'browse-flow.png') })
  console.log('      截图：' + path.join(root, 'browse-flow.png'))

  const blocking = errors.filter(text => /did not activate|osascript|directory-picker/.test(text))
  assert.deepEqual(blocking, [], `不得出现目录流程相关错误：${JSON.stringify(blocking)}`)
  console.log('\n全部通过。隔离证据目录：' + root)
} finally {
  await browser.close()
  server.kill()
  if (server.exitCode === null) await new Promise(resolve => server.once('exit', resolve))
}
