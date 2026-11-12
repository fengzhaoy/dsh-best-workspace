import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'

/**
 * Host 侧只保留一个业务端点：工作区偏好（置顶 / 分组）的读写。
 * 侧栏其余能力全部走客户端 store 与宿主原生服务，不再需要 Host 路由。
 */
export const inject = ['webServer']

const API_BASE = '/api/dsh-best-workspace'
const ENDPOINT = API_BASE + '/preferences'
const PREFERENCES_FILE = '.dsh-best-workspace-preferences.json'
/** 旧版本（codex-ui 时代）的存档位置；仅用于首次启动时迁移一次。 */
const LEGACY_PREFERENCES_FILE = '.dsh-codex-ui-preferences.json'
const MAX_BODY_BYTES = 32 * 1024

interface WorkspaceGroup {
  id: string
  title: string
  workspaceIds: string[]
}

interface WorkspacePreferences {
  version: 2
  pinnedWorkspaceIds: string[]
  workspaceGroups: WorkspaceGroup[]
  exists: boolean
}

function preferencesPath(): string {
  const profileDir = process.env.DSH_PROFILE_DIR ?? resolve(homedir(), '.dsh', 'profiles', 'web')
  return resolve(profileDir, PREFERENCES_FILE)
}

function parsePinnedWorkspaceIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > 1000) return undefined
  if (!value.every((id) => typeof id === 'string' && id.trim() !== '' && id.length <= 256)) return undefined
  return [...new Set(value)]
}

function parseWorkspaceGroups(value: unknown): WorkspaceGroup[] | undefined {
  if (!Array.isArray(value) || value.length > 100) return undefined
  const groupIds = new Set<string>()
  const titles = new Set<string>()
  const workspaceIds = new Set<string>()
  const groups: WorkspaceGroup[] = []
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') return undefined
    const record = entry as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    const title = typeof record.title === 'string' ? record.title.trim() : ''
    if (id === '' || id.length > 128 || title === '' || title.length > 80) return undefined
    const titleKey = title.toLowerCase()
    if (groupIds.has(id) || titles.has(titleKey)) return undefined
    if (!Array.isArray(record.workspaceIds) || record.workspaceIds.length > 1000) return undefined
    const ids = [...new Set(record.workspaceIds)]
    if (!ids.every((item) => typeof item === 'string' && item.trim() !== '' && item.length <= 256)) return undefined
    if (ids.some((item) => workspaceIds.has(item))) return undefined
    groupIds.add(id)
    titles.add(titleKey)
    ids.forEach((item) => workspaceIds.add(item))
    groups.push({ id, title, workspaceIds: ids as string[] })
  }
  return groups
}

function parsePreferences(value: unknown): Omit<WorkspacePreferences, 'exists'> | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const pinnedWorkspaceIds = parsePinnedWorkspaceIds(record.pinnedWorkspaceIds)
  if (pinnedWorkspaceIds === undefined) return undefined
  if (record.version === 1) return { version: 2, pinnedWorkspaceIds, workspaceGroups: [] }
  if (record.version !== 2) return undefined
  const workspaceGroups = parseWorkspaceGroups(record.workspaceGroups)
  return workspaceGroups === undefined ? undefined : { version: 2, pinnedWorkspaceIds, workspaceGroups }
}

/** 旧存档的绝对路径（同目录）。 */
function legacyPreferencesPath(): string {
  const profileDir = process.env.DSH_PROFILE_DIR ?? resolve(homedir(), '.dsh', 'profiles', 'web')
  return resolve(profileDir, LEGACY_PREFERENCES_FILE)
}

/**
 * 读取新存档；新存档缺失时尝试从旧存档迁移一次。
 * 迁移只复制不动旧文件——降级回旧版本时仍能读到原始配置。
 */
async function readPreferences(): Promise<WorkspacePreferences> {
  const path = preferencesPath()
  try {
    const parsed = parsePreferences(JSON.parse(await readFile(path, 'utf8')))
    if (parsed === undefined) throw new Error('工作区偏好文件格式无效。')
    return { ...parsed, exists: true }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const migrated = await migrateLegacyPreferences()
    return migrated ?? { version: 2, pinnedWorkspaceIds: [], workspaceGroups: [], exists: false }
  }
}

/** 从旧存档读一次并写入新存档（内容非空才写）；旧文件保留不动。 */
async function migrateLegacyPreferences(): Promise<WorkspacePreferences | undefined> {
  try {
    const legacy = parsePreferences(JSON.parse(await readFile(legacyPreferencesPath(), 'utf8')))
    if (legacy === undefined) return undefined
    if (legacy.pinnedWorkspaceIds.length === 0 && legacy.workspaceGroups.length === 0) return undefined
    await writePreferences(legacy.pinnedWorkspaceIds, legacy.workspaceGroups)
    return { ...legacy, exists: true }
  } catch {
    return undefined
  }
}

let writeQueue: Promise<void> = Promise.resolve()

function writePreferences(pinnedWorkspaceIds: string[], workspaceGroups: WorkspaceGroup[]): Promise<void> {
  const path = preferencesPath()
  const task = writeQueue.catch(() => undefined).then(async () => {
    await mkdir(dirname(path), { recursive: true })
    const temporary = join(dirname(path), '.' + basename(path) + '.' + process.pid + '.' + randomUUID() + '.tmp')
    try {
      await writeFile(temporary, JSON.stringify({ version: 2, pinnedWorkspaceIds, workspaceGroups }, undefined, 2) + '\n', 'utf8')
      await rename(temporary, path)
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined)
    }
  })
  writeQueue = task
  return task
}

class BodyTooLargeError extends Error {}

async function readBody(request: IncomingMessage): Promise<string> {
  const declared = Number(request.headers['content-length'])
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new BodyTooLargeError('请求体过大。')
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    length += buffer.length
    if (length > MAX_BODY_BYTES) throw new BodyTooLargeError('请求体过大。')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function send(response: ServerResponse, status: number, body?: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(body === undefined ? undefined : JSON.stringify(body))
}

/** 复用宿主 connection 服务的 Host/Origin/登录校验；不可用时拒绝，而不是放行。 */
function authorize(ctx: Context, request: IncomingMessage, response: ServerResponse): boolean {
  try {
    const connection = (ctx as any).get?.('connection')
    if (typeof connection?.requestRejection !== 'function') {
      send(response, 503, { error: '宿主认证服务暂不可用。' })
      return false
    }
    const rejection = connection.requestRejection(request)
    if (rejection !== undefined) {
      send(response, rejection, { error: rejection === 401 ? '请先登录 DSH。' : '已拒绝不可信或跨站请求。' })
      return false
    }
    return true
  } catch {
    send(response, 503, { error: '宿主认证服务暂不可用。' })
    return false
  }
}

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const webServer = (ctx as any).get?.('webServer')
    if (typeof webServer?.register !== 'function') {
      ctx.logger?.warn?.('dsh-best-workspace: 缺少 webServer.register，工作区偏好端点未注册。')
      return () => {}
    }
    const dispose = webServer.register({
      kind: 'exact',
      path: ENDPOINT,
      handler: async (request: IncomingMessage, response: ServerResponse) => {
        if (!authorize(ctx, request, response)) return
        try {
          if (request.method === 'GET' || request.method === 'HEAD') {
            const preferences = await readPreferences()
            if (request.method === 'HEAD') {
              response.writeHead(200, { 'cache-control': 'no-store' })
              response.end()
              return
            }
            send(response, 200, preferences)
            return
          }
          if (request.method === 'PUT') {
            const body = JSON.parse(await readBody(request)) as Record<string, unknown> | null
            const pinnedWorkspaceIds = body === null ? undefined : parsePinnedWorkspaceIds(body.pinnedWorkspaceIds)
            const existing = await readPreferences()
            const workspaceGroups = body !== null && 'workspaceGroups' in body
              ? parseWorkspaceGroups(body.workspaceGroups)
              : existing.workspaceGroups
            if (pinnedWorkspaceIds === undefined || workspaceGroups === undefined) {
              send(response, 400, { error: '工作区偏好格式无效。' })
              return
            }
            await writePreferences(pinnedWorkspaceIds, workspaceGroups)
            send(response, 200, { version: 2, pinnedWorkspaceIds, workspaceGroups, exists: true })
            return
          }
          response.writeHead(405, { allow: 'GET, HEAD, PUT' })
          response.end()
        } catch (error) {
          if (error instanceof BodyTooLargeError) {
            send(response, 413, { error: '请求体过大。' })
            return
          }
          if (error instanceof SyntaxError) {
            send(response, 400, { error: '工作区偏好格式无效。' })
            return
          }
          ctx.logger?.warn?.('dsh-best-workspace: 工作区偏好端点失败', error)
          send(response, 503, { error: '工作区偏好暂不可用。' })
        }
      },
    })
    return () => {
      try {
        dispose?.()
      } catch {}
    }
  }, 'dsh-best-workspace: workspace preferences endpoint')
}
