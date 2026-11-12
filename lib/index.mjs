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
/** 复用宿主 connection 服务的 Host/Origin/登录校验；不可用时拒绝，而不是放行。 */
function authorize(ctx, request, response) {
	try {
		const connection = ctx.get?.("connection");
		if (typeof connection?.requestRejection !== "function") {
			send(response, 503, { error: "宿主认证服务暂不可用。" });
			return false;
		}
		const rejection = connection.requestRejection(request);
		if (rejection !== void 0) {
			send(response, rejection, { error: rejection === 401 ? "请先登录 DSH。" : "已拒绝不可信或跨站请求。" });
			return false;
		}
		return true;
	} catch {
		send(response, 503, { error: "宿主认证服务暂不可用。" });
		return false;
	}
}
function apply(ctx) {
	ctx.effect(() => {
		const webServer = ctx.get?.("webServer");
		if (typeof webServer?.register !== "function") {
			ctx.logger?.warn?.("dsh-best-workspace: 缺少 webServer.register，工作区偏好端点未注册。");
			return () => {};
		}
		const dispose = webServer.register({
			kind: "exact",
			path: ENDPOINT,
			handler: async (request, response) => {
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
