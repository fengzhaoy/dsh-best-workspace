import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
//#region src/index.ts
/**
* Host 侧只保留一个业务端点：工作区偏好（置顶 / 分组）的读写。
* 侧栏其余能力全部走客户端 store 与宿主原生服务，不再需要 Host 路由。
*/
const inject = ["webServer"];
const ENDPOINT = "/api/dsh-best-workspace/preferences";
const PREFERENCES_FILE = ".dsh-best-workspace-preferences.json";
/** 旧版本（codex-ui 时代）的存档位置；仅用于首次启动时迁移一次。 */
const LEGACY_PREFERENCES_FILE = ".dsh-codex-ui-preferences.json";
const MAX_BODY_BYTES = 32768;
function preferencesPath() {
	const profileDir = process.env.DSH_PROFILE_DIR ?? resolve(homedir(), ".dsh", "profiles", "web");
	return resolve(profileDir, PREFERENCES_FILE);
}
function parsePinnedWorkspaceIds(value) {
	if (!Array.isArray(value) || value.length > 1e3) return void 0;
	if (!value.every((id) => typeof id === "string" && id.trim() !== "" && id.length <= 256)) return void 0;
	return [...new Set(value)];
}
function parseWorkspaceGroups(value) {
	if (!Array.isArray(value) || value.length > 100) return void 0;
	const groupIds = /* @__PURE__ */ new Set();
	const titles = /* @__PURE__ */ new Set();
	const workspaceIds = /* @__PURE__ */ new Set();
	const groups = [];
	for (const entry of value) {
		if (entry === null || typeof entry !== "object") return void 0;
		const record = entry;
		const id = typeof record.id === "string" ? record.id.trim() : "";
		const title = typeof record.title === "string" ? record.title.trim() : "";
		if (id === "" || id.length > 128 || title === "" || title.length > 80) return void 0;
		const titleKey = title.toLowerCase();
		if (groupIds.has(id) || titles.has(titleKey)) return void 0;
		if (!Array.isArray(record.workspaceIds) || record.workspaceIds.length > 1e3) return void 0;
		const ids = [...new Set(record.workspaceIds)];
		if (!ids.every((item) => typeof item === "string" && item.trim() !== "" && item.length <= 256)) return void 0;
		if (ids.some((item) => workspaceIds.has(item))) return void 0;
		groupIds.add(id);
		titles.add(titleKey);
		ids.forEach((item) => workspaceIds.add(item));
		groups.push({
			id,
			title,
			workspaceIds: ids
		});
	}
	return groups;
}
function parsePreferences(value) {
	if (value === null || typeof value !== "object") return void 0;
	const record = value;
	const pinnedWorkspaceIds = parsePinnedWorkspaceIds(record.pinnedWorkspaceIds);
	if (pinnedWorkspaceIds === void 0) return void 0;
	if (record.version === 1) return {
		version: 2,
		pinnedWorkspaceIds,
		workspaceGroups: []
	};
	if (record.version !== 2) return void 0;
	const workspaceGroups = parseWorkspaceGroups(record.workspaceGroups);
	return workspaceGroups === void 0 ? void 0 : {
		version: 2,
		pinnedWorkspaceIds,
		workspaceGroups
	};
}
/** 旧存档的绝对路径（同目录）。 */
function legacyPreferencesPath() {
	const profileDir = process.env.DSH_PROFILE_DIR ?? resolve(homedir(), ".dsh", "profiles", "web");
	return resolve(profileDir, LEGACY_PREFERENCES_FILE);
}
/**
* 读取新存档；新存档缺失时尝试从旧存档迁移一次。
* 迁移只复制不动旧文件——降级回旧版本时仍能读到原始配置。
*/
async function readPreferences() {
	const path = preferencesPath();
	try {
		const parsed = parsePreferences(JSON.parse(await readFile(path, "utf8")));
		if (parsed === void 0) throw new Error("工作区偏好文件格式无效。");
		return {
			...parsed,
			exists: true
		};
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
		return await migrateLegacyPreferences() ?? {
			version: 2,
			pinnedWorkspaceIds: [],
			workspaceGroups: [],
			exists: false
		};
	}
}
/** 从旧存档读一次并写入新存档（内容非空才写）；旧文件保留不动。 */
async function migrateLegacyPreferences() {
	try {
		const legacy = parsePreferences(JSON.parse(await readFile(legacyPreferencesPath(), "utf8")));
		if (legacy === void 0) return void 0;
		if (legacy.pinnedWorkspaceIds.length === 0 && legacy.workspaceGroups.length === 0) return void 0;
		await writePreferences(legacy.pinnedWorkspaceIds, legacy.workspaceGroups);
		return {
			...legacy,
			exists: true
		};
	} catch {
		return;
	}
}
let writeQueue = Promise.resolve();
function writePreferences(pinnedWorkspaceIds, workspaceGroups) {
	const path = preferencesPath();
	const task = writeQueue.catch(() => void 0).then(async () => {
		await mkdir(dirname(path), { recursive: true });
		const temporary = join(dirname(path), "." + basename(path) + "." + process.pid + "." + randomUUID() + ".tmp");
		try {
			await writeFile(temporary, JSON.stringify({
				version: 2,
				pinnedWorkspaceIds,
				workspaceGroups
			}, void 0, 2) + "\n", "utf8");
			await rename(temporary, path);
		} finally {
			await rm(temporary, { force: true }).catch(() => void 0);
		}
	});
	writeQueue = task;
	return task;
}
var BodyTooLargeError = class extends Error {};
async function readBody(request) {
	const declared = Number(request.headers["content-length"]);
	if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new BodyTooLargeError("请求体过大。");
	const chunks = [];
	let length = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		length += buffer.length;
		if (length > MAX_BODY_BYTES) throw new BodyTooLargeError("请求体过大。");
		chunks.push(buffer);
	}
	return Buffer.concat(chunks).toString("utf8");
}
function send(response, status, body) {
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	response.end(body === void 0 ? void 0 : JSON.stringify(body));
}
/**
* 宿主路由准入策略：anonymous 表示「WebServer 层不再要求 Peer」。
* 本端点自己调用 connection 做 Host/Origin/登录校验，以便把 401/403 这类
* 真实状态码反馈给侧栏。DSH 0.2.3 起 WebRoute.auth 默认 required：没有 Peer
* 时 WebServer 直接 503，侧栏只剩「服务暂不可用」，看不到「请先登录」。
*/
const ROUTE_AUTH = "anonymous";
/**
* 复用宿主 connection 服务做 Host/Origin/登录校验；不可用时拒绝，而不是放行。
*
* 两代 API 并存：
* - 0.2.3+：connection.admit(request) 返回 { peer } 或 { rejection }
* - 更早：connection.requestRejection(request) 返回 rejection | undefined
*/
function authorize(ctx, request, response) {
	/**
	* 免 inject 读取 connection：cordis 的 ctx Proxy 不允许访问未在 inject 声明的属性
	* （ctx.get 只会读到 declared inject 的服务），用 reflect.get 读取，未提供时返回 undefined。
	* 每次请求现读：connection 可能在本插件 apply 之后才挂上。
	*/
	const connection = readService(ctx, "connection");
	/**
	* 刻意不走 connection.admit()。
	*
	* DSH 0.2.3 随 cordis 4.2 收紧后，HostConnectionService 构造函数里的
	* this.authentication = ctx['connection.authentication'] 在 inject=[] 的上下文里会抛
	* cannot get property "connection.authentication" without inject，于是 admit()
	* 对任何调用方都必然失败（宿主自身缺陷，插件无法修复）。
	*
	* 这里改用两条互不依赖的公开能力拼出同样的判定：
	*  1) isTrustedRequest() —— Host / Origin 来源围栏，不触碰 authentication；
	*  2) reflect.get('connection.authentication') —— 真正的凭据校验器。
	*/
	const facts = {
		headers: request.headers,
		method: request.method,
		url: new URL(request.url ?? "/", "http://" + (request.headers.host ?? "127.0.0.1")),
		transport: "http",
		signal: void 0,
		socket: request.socket
	};
	if (typeof connection?.isTrustedRequest === "function") {
		let trusted = false;
		try {
			trusted = connection.isTrustedRequest(facts) === true;
		} catch (error) {
			ctx.logger?.warn?.("dsh-best-workspace: isTrustedRequest 失败", error);
		}
		if (!trusted) return reject(response, 403);
		const authentication = readService(ctx, "connection.authentication");
		if (typeof authentication?.authenticate === "function") {
			let verdict;
			try {
				verdict = authentication.authenticate(facts);
			} catch (error) {
				ctx.logger?.warn?.("dsh-best-workspace: authenticate 失败", error);
				send(response, 503, {
					error: "宿主认证服务暂不可用（authenticate 失败）。",
					detail: error instanceof Error ? error.message : String(error)
				});
				return false;
			}
			if (verdict !== null && typeof verdict?.rejection === "number") return reject(response, verdict.rejection);
			return true;
		}
		ctx.logger?.warn?.("dsh-best-workspace: connection.authentication 尚未就绪");
		send(response, 503, { error: "宿主认证服务尚未就绪，请稍后重试。" });
		return false;
	}
	if (typeof connection?.requestRejection === "function") try {
		const rejection = connection.requestRejection(request);
		return rejection === void 0 ? true : reject(response, rejection);
	} catch (error) {
		ctx.logger?.warn?.("dsh-best-workspace: connection.requestRejection 失败", error);
		send(response, 503, { error: "宿主认证服务暂不可用（requestRejection 失败）。" });
		return false;
	}
	ctx.logger?.warn?.("dsh-best-workspace: connection 服务不可用", {
		hasConnection: connection !== void 0,
		admitType: typeof connection?.admit
	});
	send(response, 503, { error: "宿主认证服务暂不可用（未取到 connection）。" });
	return false;
}
/** 反射读取宿主服务，绕过 cordis 的 inject 访问限制；不可用时返回 undefined。 */
function readService(ctx, name) {
	try {
		if (typeof ctx.reflect?.get === "function") return ctx.reflect.get(name);
		return ctx[name];
	} catch {
		return;
	}
}
/** 把宿主的拒绝码翻成侧栏能识别的业务错误。 */
function reject(response, rejection) {
	send(response, rejection, { error: rejection === 401 ? "请先登录 DSH。" : "已拒绝不可信或跨站请求。" });
	return false;
}
function apply(ctx) {
	ctx.effect(() => {
		const webServer = readService(ctx, "webServer");
		if (typeof webServer?.register !== "function") {
			ctx.logger?.warn?.("dsh-best-workspace: 缺少 webServer.register，工作区偏好端点未注册。");
			return () => {};
		}
		const dispose = webServer.register({
			kind: "exact",
			path: ENDPOINT,
			auth: ROUTE_AUTH,
			handler: async (request, response) => {
				try {
					if (!authorize(ctx, request, response)) return;
					try {
						if (request.method === "GET" || request.method === "HEAD") {
							const preferences = await readPreferences();
							if (request.method === "HEAD") {
								response.writeHead(200, { "cache-control": "no-store" });
								response.end();
								return;
							}
							send(response, 200, preferences);
							return;
						}
						if (request.method === "PUT") {
							const body = JSON.parse(await readBody(request));
							const pinnedWorkspaceIds = body === null ? void 0 : parsePinnedWorkspaceIds(body.pinnedWorkspaceIds);
							const existing = await readPreferences();
							const workspaceGroups = body !== null && "workspaceGroups" in body ? parseWorkspaceGroups(body.workspaceGroups) : existing.workspaceGroups;
							if (pinnedWorkspaceIds === void 0 || workspaceGroups === void 0) {
								send(response, 400, { error: "工作区偏好格式无效。" });
								return;
							}
							await writePreferences(pinnedWorkspaceIds, workspaceGroups);
							send(response, 200, {
								version: 2,
								pinnedWorkspaceIds,
								workspaceGroups,
								exists: true
							});
							return;
						}
						response.writeHead(405, { allow: "GET, HEAD, PUT" });
						response.end();
					} catch (error) {
						if (error instanceof BodyTooLargeError) {
							send(response, 413, { error: "请求体过大。" });
							return;
						}
						if (error instanceof SyntaxError) {
							send(response, 400, { error: "工作区偏好格式无效。" });
							return;
						}
						ctx.logger?.warn?.("dsh-best-workspace: 工作区偏好端点失败", error);
						send(response, 503, { error: "工作区偏好暂不可用。" });
					}
				} catch (error) {
					ctx.logger?.warn?.("dsh-best-workspace: 端点未预期异常", error);
					const detail = error instanceof Error ? error.message : String(error);
					if (response.headersSent) {
						response.end();
						return;
					}
					send(response, 503, {
						error: "工作区偏好端点异常。",
						detail
					});
				}
			}
		});
		return () => {
			try {
				dispose?.();
			} catch {}
		};
	}, "dsh-best-workspace: workspace preferences endpoint");
}
//#endregion
export { apply, inject };
