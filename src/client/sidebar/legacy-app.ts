// @ts-nocheck
/*
 * 侧栏实现移植自 @michengai/dsh-codex-ui 1.1.49 的客户端 bundle（同一作者、Apache-2.0）。
 * 仅保留左侧边栏（工作区/会话树）相关代码；由生成脚本从已发布包中提取，后续再逐步类型化与裁剪。
 */
import type { Context as ClientContext } from "@deepseek-ai/cordis"
import * as react from "react"
import * as react_jsx_runtime from "react/jsx-runtime"
import * as react_dom from "react-dom"
import * as _deepseek_ai_dsh_client_ui_primitives from "@deepseek-ai/dsh-client-ui-primitives"
		//#region src/client/session-host.ts
		var UnknownSessionError = class extends Error {
			constructor() {
				super("unknown session");
				this.name = "UnknownSessionError";
			}
		};
		/** 旧宿主读 list.current；alpha.2 主视图改由 retainedBy.mainView 标记。 */
		function currentSessionId(state) {
			if (state === void 0) return void 0;
			if (typeof state.current === "string" && state.current !== "") return state.current;
			const byId = state.byId ?? {};
			const ids = Array.isArray(state.ids) && state.ids.length > 0 ? state.ids : Object.keys(byId);
			const pick = (id, row) => {
				if (row === void 0 || (row.retainedBy?.mainView ?? 0) <= 0) return void 0;
				const explicit = row.id?.trim();
				return explicit !== void 0 && explicit !== "" ? explicit : id;
			};
			for (const id of ids) {
				const found = pick(id, byId[id]);
				if (found !== void 0) return found;
			}
			for (const id of Object.keys(byId)) {
				if (ids.includes(id)) continue;
				const found = pick(id, byId[id]);
				if (found !== void 0) return found;
			}
		}
		/** 官方树在全局面板打开时取消会话选中。 */
		function visibleSelectedSessionId(state, panelActive = false) {
			return panelActive ? void 0 : currentSessionId(state);
		}
		function sessionRowUnread(localUnread, status, selected = false) {
			return localUnread || status?.completionUnread === true && !selected;
		}
		function sessionRunningFlags(byId, status) {
			const ids = new Set(Object.keys(byId));
			if (status !== void 0) for (const id of status.keys()) ids.add(id);
			const next = {};
			for (const id of ids) next[id] = sessionIsRunning(byId[id], status?.get(id));
			return next;
		}
		function hostAccess(ctx) {
			return ctx;
		}
		/** 有 reflect 时只 probe，不能硬读未注入服务，否则 Cordis 会挡住插件激活。 */
		function probeService(ctx, name) {
			if (ctx === void 0) return void 0;
			const access = hostAccess(ctx);
			const reflectGet = access.reflect?.get;
			const hasReflect = typeof reflectGet === "function";
			if (hasReflect) try {
				const found = reflectGet.call(access.reflect, name);
				if (found !== void 0) return found;
			} catch {}
			if (typeof access.get === "function") try {
				const found = access.get(name);
				if (found !== void 0) return found;
			} catch {
				return;
			}
			if (hasReflect) return void 0;
			try {
				return access[name];
			} catch {
				return;
			}
		}
		function isSessionArchived(ctx, id) {
			if (id === "") return false;
			const access = hostAccess(ctx);
			let store;
			try {
				store = probeService(access, "workspaces") ?? access.workspaces;
			} catch {
				return false;
			}
			return store?.list?.getSnapshot?.()?.archivedSessionIds?.includes(id) ?? false;
		}
		function openHostSession(ctx, id) {
			if (id === "") return false;
			if (isSessionArchived(ctx, id)) return false;
			const access = hostAccess(ctx);
			const uiWorkspace = probeService(access, "uiWorkspace");
			if (typeof uiWorkspace?.openSession === "function") try {
				uiWorkspace.openSession(id);
				return true;
			} catch {
				return false;
			}
			if (typeof access.sessions?.retain === "function") return false;
			if (typeof access.sessions?.open === "function") try {
				access.sessions.open(id);
				return true;
			} catch {
				return false;
			}
			return false;
		}
		async function withSessionBinding(sessions, sessionId, operation) {
			const host = sessions === void 0 ? void 0 : hostAccess({ sessions }).sessions;
			if (host === void 0) throw new UnknownSessionError();
			if (typeof host.using === "function") return host.using(sessionId, { source: "controllerOperation" }, async (reference) => {
				if (reference.ready !== void 0) await reference.ready;
				if (reference.binding === void 0) throw new UnknownSessionError();
				return operation(reference.binding);
			});
			const existing = host.binding?.(sessionId);
			if (existing !== void 0) return operation(existing);
			if (typeof host.retain !== "function") throw new UnknownSessionError();
			const reference = host.retain(sessionId, { source: "controllerOperation" });
			try {
				if (reference.ready !== void 0) await reference.ready;
				if (reference.binding === void 0) throw new UnknownSessionError();
				return await operation(reference.binding);
			} finally {
				reference.release?.();
			}
		}
		async function renameHostSession(ctx, sessionId, title) {
			await withSessionBinding(hostAccess(ctx).sessions, sessionId, async (binding) => {
				if (typeof binding.session?.rename !== "function") throw new UnknownSessionError();
				const result = await binding.session.rename(title);
				if (result.ok === false) throw result.error ?? /* @__PURE__ */ new Error("rename failed");
			});
		}
		async function forkHostSession(ctx, sessionId) {
			const access = hostAccess(ctx);
			const uiWorkspace = probeService(access, "uiWorkspace");
			if (typeof uiWorkspace?.forkSession === "function") {
				await uiWorkspace.forkSession(sessionId);
				return;
			}
			const childId = await access.sessions?.fork?.({
				sessionId,
				increaseTitle: true
			});
			if (typeof childId === "string" && childId !== "") openHostSession(access, childId);
		}
		async function archiveHostSession(ctx, sessionId) {
			const access = hostAccess(ctx);
			const uiWorkspace = probeService(access, "uiWorkspace");
			if (typeof uiWorkspace?.archiveSession === "function") {
				await uiWorkspace.archiveSession(sessionId);
				return;
			}
			await access.workspaces?.archiveSession?.(sessionId);
		}
		function mergePendingInteractions(legacy, status) {
			const next = new Map(legacy);
			for (const [id, row] of status) if (row?.pendingInteraction !== void 0) next.set(id, row.pendingInteraction);
			return next;
		}
		function sessionIsRunning(session, status) {
			if (status?.running !== void 0) return status.running === true;
			return session?.running === true;
		}
		//#endregion
		//#region src/client/session-navigation.ts
		function openConversation(host, layout, id) {
			const opened = openHostSession(host, id);
			if (opened) selectGlobalPanel(layout, null);
			return opened;
		}
		/** 统一检测旧宿主是否提供面板切换能力，保留宿主方法的 this。 */
		function selectGlobalPanel(layout, id) {
			if ("selectPanel" in layout && typeof layout.selectPanel === "function") layout.selectPanel(id);
		}
		//#endregion
		//#region src/client/workspace-shortcuts.ts
		function hasBindings(value) {
			const state = value.hooks?.workspaceShortcuts;
			return typeof state?.getSnapshot === "function" && typeof state.subscribe === "function" && typeof value.closeAddWorkspace === "function" && typeof value.setDirectoryBusy === "function" && typeof value.createWorkspace === "function";
		}
		/** Read the official, shadowed registration's public injected face; keep its command IDs and key bindings. */
		function createWorkspaceShortcutSource(slots) {
			let entry;
			let bindings;
			let lastSearch = 0;
			let snapshot = {
				searchRequest: 0,
				addRequested: false
			};
			const listeners = /* @__PURE__ */ new Set();
			let offState = () => {};
			const publish = () => {
				const state = bindings?.hooks.workspaceShortcuts.getSnapshot();
				const searchRequest = snapshot.searchRequest + (state !== void 0 && state.searchRequest !== lastSearch ? 1 : 0);
				lastSearch = state?.searchRequest ?? 0;
				const addRequested = state?.addRequested ?? false;
				if (snapshot.bindings === bindings && snapshot.searchRequest === searchRequest && snapshot.addRequested === addRequested) return;
				snapshot = {
					searchRequest,
					addRequested,
					bindings
				};
				for (const listener of listeners) listener();
			};
			const reconcile = () => {
				const next = slots.entries("sidebar.workspaces").find((row) => row.locale === "workspace");
				if (next === entry) return;
				offState();
				entry = next;
				const injected = next?.inject?.();
				bindings = injected && hasBindings(injected) ? injected : void 0;
				lastSearch = bindings?.hooks.workspaceShortcuts.getSnapshot().searchRequest ?? 0;
				offState = bindings?.hooks.workspaceShortcuts.subscribe(publish) ?? (() => {});
				publish();
			};
			reconcile();
			const offSlots = slots.subscribe("sidebar.workspaces", reconcile);
			return {
				getSnapshot: () => snapshot,
				subscribe: (listener) => {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				dispose: () => {
					offSlots();
					offState();
					listeners.clear();
				}
			};
		}
		//#endregion
		//#region src/client/workspace-directory-flow.ts
		const WORKSPACE_DIRECTORY_FLOW = "sidebar.codex.directoryFlow";
		/** Give the selected host picker an outlet owned by our sidebar, including while collapsed.
		* Directory pickers have no children; preserve their injected face, locale and store.
		* The registry has erased the original component's types, so only this forwarding boundary
		* uses the erased registration signature. No host implementation or private state is imported.
		*/
		function registerWorkspaceDirectoryFlow(ctx) {
			ctx.slots.inject(WORKSPACE_DIRECTORY_FLOW, () => {
				let entry;
				let offEntry = () => {};
				const register = ctx.slots.register.bind(ctx.slots);
				const reconcile = () => {
					const next = ctx.slots.entriesOfSlot("sidebar.workspaces.directoryFlow")[0];
					if (next === entry) return;
					offEntry();
					offEntry = () => {};
					entry = next;
					if (!next || Object.keys(next.children ?? {}).length > 0) return;
					offEntry = register({
						name: WORKSPACE_DIRECTORY_FLOW,
						inject: next.inject,
						store: next.store,
						locale: next.locale
					}, next.component);
				};
				reconcile();
				const off = ctx.slots.subscribe("sidebar.workspaces.directoryFlow", reconcile);
				return () => {
					off();
					offEntry();
				};
			});
		}
		//#endregion
		//#region src/client/tree-expansion.ts
		const WORKSPACE_EXPANSION_STORAGE_KEY = "dsh-codex-ui.workspace-expansion.v1";
		const MAX_EXPANSION_ENTRIES = 500;
		const MAX_EXPANSION_KEY_LENGTH = 512;
		function browserStorage() {
			if (typeof window === "undefined") return void 0;
			try {
				return window.localStorage;
			} catch {
				return;
			}
		}
		function parseTreeExpansionState(value) {
			if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
			const entries = Object.entries(value).filter(([key, expanded]) => key.length > 0 && key.length <= MAX_EXPANSION_KEY_LENGTH && typeof expanded === "boolean").slice(0, MAX_EXPANSION_ENTRIES);
			return Object.fromEntries(entries);
		}
		function readTreeExpansionState(storage, key) {
			if (storage === void 0) return {};
			try {
				return parseTreeExpansionState(JSON.parse(storage.getItem(key) ?? "{}"));
			} catch {
				return {};
			}
		}
		function writeTreeExpansionState(storage, key, state) {
			if (storage === void 0) return;
			try {
				storage.setItem(key, JSON.stringify(parseTreeExpansionState(state)));
			} catch {}
		}
		//#endregion
		//#region src/client/host-icons.ts
		/**
		* 优先使用 0.1.7 的 Medium 导出名，0.1.5 只有旧尺寸名时回退。
		* 必须动态读取，不能写成静态属性访问，否则旧宿主一加载客户端就会拿到 undefined。
		*/
		function resolveHostIcon(icons, modern, legacy) {
			const icon = icons[modern] ?? icons[legacy];
			if (!icon) throw new Error(`宿主缺少图标 ${modern}`);
			return icon;
		}
		function hostIcon(modern, legacy) {
			return resolveHostIcon(_deepseek_ai_dsh_client_ui_primitives, modern, legacy);
		}
		const IconArchiveOutlineMedium = hostIcon("IconArchiveOutlineMedium", "IconArchiveOutline20");
		const IconBranchOutlineMedium = hostIcon("IconBranchOutlineMedium", "IconBranchOutline16");
		hostIcon("IconChevronDownOutlineMedium", "IconChevronDownOutline14");
		const IconCopyOutlineMedium = hostIcon("IconCopyOutlineMedium", "IconCopyOutline16");
		const IconEditOutlineMedium = hostIcon("IconEditOutlineMedium", "IconEditOutline16");
		const IconEllipsisOutlineMedium = hostIcon("IconEllipsisOutlineMedium", "IconEllipsisOutline16");
		const IconFolderCloseMedium = hostIcon("IconFolderCloseMedium", "IconFolderClose16");
		const IconFolderOpenMedium = hostIcon("IconFolderOpenMedium", "IconFolderOpen16");
		const IconFolderOpenOutlineMedium = hostIcon("IconFolderOpenOutlineMedium", "IconFolderOpenOutline16");
		const IconLinkOutlineMedium = hostIcon("IconLinkOutlineMedium", "IconLinkOutline16");
		const IconProjectAddOutlineMedium = hostIcon("IconProjectAddOutlineMedium", "IconProjectAddOutline16");
		const IconSettingsOutlineMedium = hostIcon("IconSettingsOutlineMedium", "IconSettingsOutline16");
		const IconTrashOutlineMedium = hostIcon("IconTrashOutlineMedium", "IconTrashOutline16");
		/** DSH 会话头不能写 origin=im，频道会话只靠 id 前缀。 */
		function isChannelSession(id) {
			return id.startsWith("im:");
		}
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.39.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/mergeClasses.mjs
		/**
		* @license lucide-react v1.39.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const mergeClasses = (...classes) => classes.filter((className, index, array) => {
			return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
		}).join(" ").trim();
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.39.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/toKebabCase.mjs
		/**
		* @license lucide-react v1.39.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.39.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/toCamelCase.mjs
		/**
		* @license lucide-react v1.39.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const toCamelCase = (string) => string.replace(/^([A-Z])|[\s-_]+(\w)/g, (match, p1, p2) => p2 ? p2.toUpperCase() : p1.toLowerCase());
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.39.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/toPascalCase.mjs
		/**
		* @license lucide-react v1.39.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const toPascalCase = (string) => {
			const camelCase = toCamelCase(string);
			return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
		};
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.39.0_react@18.3.1/node_modules/lucide-react/dist/esm/defaultAttributes.mjs
		/**
		* @license lucide-react v1.39.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		var defaultAttributes = {
			xmlns: "http://www.w3.org/2000/svg",
			width: 24,
			height: 24,
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: 2,
			strokeLinecap: "round",
			strokeLinejoin: "round"
		};
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.39.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/hasA11yProp.mjs
		/**
		* @license lucide-react v1.39.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const hasA11yProp = (props) => {
			for (const prop in props) if (prop.startsWith("aria-") || prop === "role" || prop === "title") return true;
			return false;
		};
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.39.0_react@18.3.1/node_modules/lucide-react/dist/esm/context.mjs
		/**
		* @license lucide-react v1.39.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const LucideContext = (0, react.createContext)({});
		const useLucideContext = () => (0, react.useContext)(LucideContext);
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.39.0_react@18.3.1/node_modules/lucide-react/dist/esm/Icon.mjs
		/**
		* @license lucide-react v1.39.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const Icon = (0, react.forwardRef)(({ color, size, strokeWidth, absoluteStrokeWidth, className = "", children, iconNode, ...rest }, ref) => {
			const { size: contextSize = 24, strokeWidth: contextStrokeWidth = 2, absoluteStrokeWidth: contextAbsoluteStrokeWidth = false, color: contextColor = "currentColor", className: contextClass = "" } = useLucideContext() ?? {};
			const calculatedStrokeWidth = absoluteStrokeWidth ?? contextAbsoluteStrokeWidth ? Number(strokeWidth ?? contextStrokeWidth) * 24 / Number(size ?? contextSize) : strokeWidth ?? contextStrokeWidth;
			return (0, react.createElement)("svg", {
				ref,
				...defaultAttributes,
				width: size ?? contextSize ?? defaultAttributes.width,
				height: size ?? contextSize ?? defaultAttributes.height,
				stroke: color ?? contextColor,
				strokeWidth: calculatedStrokeWidth,
				className: mergeClasses("lucide", contextClass, className),
				...!children && !hasA11yProp(rest) && { "aria-hidden": "true" },
				...rest
			}, [...iconNode.map(([tag, attrs]) => (0, react.createElement)(tag, attrs)), ...Array.isArray(children) ? children : [children]]);
		});
		//#endregion
		//#region node_modules/.pnpm/lucide-react@1.39.0_react@18.3.1/node_modules/lucide-react/dist/esm/createLucideIcon.mjs
		/**
		* @license lucide-react v1.39.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const createLucideIcon = (iconName, iconNode) => {
			const Component = (0, react.forwardRef)(({ className, ...props }, ref) => (0, react.createElement)(Icon, {
				ref,
				iconNode,
				className: mergeClasses(`lucide-${toKebabCase(toPascalCase(iconName))}`, `lucide-${iconName}`, className),
				...props
			}));
			Component.displayName = toPascalCase(iconName);
			return Component;
		};
		/**
		* @license lucide-react v1.39.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const Archive = createLucideIcon("archive", [
			["rect", {
				width: "20",
				height: "5",
				x: "2",
				y: "3",
				rx: "1",
				key: "1wp1u1"
			}],
			["path", {
				d: "M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8",
				key: "1s80jp"
			}],
			["path", {
				d: "M10 12h4",
				key: "a56b0p"
			}]
		]);
		/**
		* @license lucide-react v1.39.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const EyeOff = createLucideIcon("eye-off", [
			["path", {
				d: "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49",
				key: "ct8e1f"
			}],
			["path", {
				d: "M14.084 14.158a3 3 0 0 1-4.242-4.242",
				key: "151rxh"
			}],
			["path", {
				d: "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143",
				key: "13bj9a"
			}],
			["path", {
				d: "m2 2 20 20",
				key: "1ooewy"
			}]
		]);
		/**
		* @license lucide-react v1.39.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const Eye = createLucideIcon("eye", [["path", {
			d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",
			key: "1nclc0"
		}], ["circle", {
			cx: "12",
			cy: "12",
			r: "3",
			key: "1v7zrd"
		}]]);
		/**
		* @license lucide-react v1.39.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const MessageCircle = createLucideIcon("message-circle", [["path", {
			d: "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719",
			key: "1sd12s"
		}]]);
		/**
		* @license lucide-react v1.39.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const Pin = createLucideIcon("pin", [["path", {
			d: "M12 17v5",
			key: "bb1du9"
		}], ["path", {
			d: "M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z",
			key: "1nkz8b"
		}]]);
		/**
		* @license lucide-react v1.39.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const Plus = createLucideIcon("plus", [["path", {
			d: "M5 12h14",
			key: "1ays0h"
		}], ["path", {
			d: "M12 5v14",
			key: "s699le"
		}]]);
		/**
		* @license lucide-react v1.39.0 - ISC
		*
		* This source code is licensed under the ISC license.
		* See the LICENSE file in the root directory of this source tree.
		*/
		const SquarePen = createLucideIcon("square-pen", [["path", {
			d: "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7",
			key: "1m0v6g"
		}], ["path", {
			d: "M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z",
			key: "ohrbg2"
		}]]);
		//#endregion
		//#region src/client/session-title-scroll.ts
		/** 会话行只展示标题第一行，避免换行把胶囊撑高。 */
		function sessionTitleLine(title) {
			return title.split(/\r?\n/)[0] ?? title;
		}
		/** 标题比可视槽多出来的像素；1px 内当作测量误差。 */
		function titleOverflowPx(scrollWidth, clientWidth) {
			const extra = Math.ceil(scrollWidth - clientWidth);
			return extra > 1 ? extra : 0;
		}
		const PX_PER_SECOND = 42;
		/** 按溢出长度估算单程时长，长标题更慢，避免一闪而过。 */
		function titleScrollDurationMs(overflowPx) {
			if (overflowPx <= 0) return 0;
			return Math.min(8e3, Math.max(1600, Math.round(overflowPx / PX_PER_SECOND * 1e3)));
		}
		//#endregion
		//#region src/client/session-tree.tsx
		function PinIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Pin, {
				"aria-hidden": "true",
				size: 16,
				strokeWidth: 1.5
			});
		}
		function QuickArchiveIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Archive, {
				"aria-hidden": "true",
				size: 16,
				strokeWidth: 1.5
			});
		}
		function sessionMenuItems(t, options) {
			const items = [
				{
					id: "rename",
					label: t("sessions.rename"),
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconEditOutlineMedium, { size: 16 })
				},
				{
					id: "unread",
					label: t(options.unread ? "sessions.markRead" : "sessions.markUnread"),
					icon: options.unread ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EyeOff, {
						"aria-hidden": "true",
						size: 16,
						strokeWidth: 1.5
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Eye, {
						"aria-hidden": "true",
						size: 16,
						strokeWidth: 1.5
					})
				},
				{
					id: "archive",
					label: t("sessions.archive"),
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconArchiveOutlineMedium, { size: 16 })
				},
				{
					type: "separator",
					id: "main-separator"
				},
				{
					id: "fork",
					label: t("sessions.fork"),
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconBranchOutlineMedium, { size: 16 })
				}
			];
			if (options.includePath === true) items.push({
				id: "openPath",
				label: t("sessions.openPath"),
				icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconFolderOpenOutlineMedium, { size: 16 }),
				disabled: options.path === void 0
			});
			if (options.moveTargets !== void 0) items.push({
				id: "moveWorkspace",
				label: t("sessions.moveWorkspace"),
				icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconFolderCloseMedium, { size: 16 }),
				disabled: options.moveTargets.length === 0,
				submenu: options.moveTargets.map((target) => ({
					id: target.id,
					label: target.label,
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconFolderCloseMedium, { size: 16 })
				}))
			});
			items.push({
				type: "separator",
				id: "copy-separator"
			}, {
				id: "copyId",
				label: t("sessions.copyId"),
				icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconLinkOutlineMedium, { size: 16 })
			}, {
				id: "copyTitle",
				label: t("sessions.copyTitle"),
				icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconCopyOutlineMedium, { size: 16 })
			}, ...options.includePath === true ? [{
				id: "copyPath",
				label: t("sessions.copyPath"),
				icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconCopyOutlineMedium, { size: 16 }),
				disabled: options.path === void 0
			}] : []);
			if (options.canDelete !== false) items.push({
				type: "separator",
				id: "delete-separator"
			}, {
				id: "delete",
				label: t("sessions.delete"),
				icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconTrashOutlineMedium, { size: 16 }),
				danger: true
			});
			return items;
		}
		/** 把右键落点收成 Menu 的锚点矩形，让列表贴着指针打开。 */
		function pointerMenuRect(x, y) {
			return new DOMRect(x, y, 0, 0);
		}
		function pendingLabel(kind, t) {
			switch (kind) {
				case "approval": return t("sessions.waitingApproval");
				case "plan-review": return t("sessions.planReview");
				case "question": return t("sessions.waitingAnswer");
			}
		}
		function SessionState({ pendingInteraction, unread, running, t }) {
			if (pendingInteraction !== void 0) {
				const label = pendingLabel(pendingInteraction, t);
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "dcu-wb-pending",
					"data-state": "warning",
					"data-pending-kind": pendingInteraction,
					"aria-label": label,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dcu-wb-pending-dot",
						"aria-hidden": "true"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dcu-wb-pending-label",
						children: label
					})]
				});
			}
			if (unread) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "dcu-wb-unread",
				"aria-label": t("sessions.unread")
			});
			if (running) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "dcu-wb-running",
				"aria-hidden": "true"
			});
			return null;
		}
		function SessionTime({ time }) {
			if (time === void 0 || time === "") return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "dcu-wb-session-time",
				children: time
			});
		}
		function SessionRowTitle({ title }) {
			const text = sessionTitleLine(title);
			const wrapRef = (0, react.useRef)(null);
			const textRef = (0, react.useRef)(null);
			const [shift, setShift] = (0, react.useState)(0);
			(0, react.useLayoutEffect)(() => {
				const wrap = wrapRef.current;
				const inner = textRef.current;
				if (wrap === null || inner === null) return;
				const measure = () => {
					setShift(titleOverflowPx(inner.scrollWidth, wrap.clientWidth));
				};
				measure();
				let cancelled = false;
				const fonts = typeof document === "undefined" ? void 0 : document.fonts;
				if (fonts !== void 0) fonts.ready.then(() => {
					if (!cancelled) measure();
				});
				if (typeof ResizeObserver === "undefined") return () => {
					cancelled = true;
				};
				const observer = new ResizeObserver(measure);
				observer.observe(wrap);
				return () => {
					cancelled = true;
					observer.disconnect();
				};
			}, [text]);
			const style = shift > 0 ? {
				"--dcu-title-shift": `${shift}px`,
				"--dcu-title-duration": `${titleScrollDurationMs(shift)}ms`
			} : void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				ref: wrapRef,
				className: "dcu-wb-session-title",
				"data-overflow": shift > 0 || void 0,
				style,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					ref: textRef,
					className: "dcu-wb-session-title-text",
					children: text
				})
			});
		}
		const SessionRow = (0, react.memo)(function SessionRow({ id, title, selected, menuOpen, unread, running, pendingInteraction, t, menuItems, onOpen, onMenuChange, onSelectAction, onArchive, onHover, onLeave, onContextMenu, menuPoint, subtitle, flat, draggable, dropActive, onDragStart, onDragEnd, onDragOver, onDrop, time }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-dcu-session": id,
				className: `dcu-wb-session${selected ? " dcu-wb-selected" : ""}${menuOpen ? " dcu-wb-menu-open" : ""}${dropActive === true ? " dcu-wb-drop" : ""}${flat === true ? " dcu-wb-session-flat" : ""}`,
				role: "treeitem",
				"aria-selected": selected,
				draggable,
				onDragStart,
				onDragEnd,
				onDragOver,
				onDrop,
				onClick: onOpen,
				onContextMenu,
				onMouseEnter: onHover,
				onMouseLeave: onLeave,
				children: [
					subtitle !== void 0 && subtitle !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "dcu-wb-session-copy",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionRowTitle, { title }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dcu-wb-session-sub",
							children: subtitle
						})]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionRowTitle, { title }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionState, {
						pendingInteraction,
						unread,
						running,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionTime, { time }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dcu-wb-quick-actions",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dcu-wb-more",
							"aria-label": t("sessions.archive"),
							onClick: (event) => {
								event.stopPropagation();
								onArchive();
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuickArchiveIcon, {})
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dcu-wb-actions",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
							open: menuOpen,
							onClose: () => {
								onMenuChange(false);
							},
							items: menuItems,
							onSelect: onSelectAction,
							portal: true,
							dense: true,
							getAnchorRect: menuPoint === void 0 ? void 0 : () => pointerMenuRect(menuPoint.x, menuPoint.y),
							anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dcu-wb-more dcu-wb-context-anchor",
								"aria-label": t("sessions.actions", { name: title }),
								onClick: (event) => {
									event.stopPropagation();
									onMenuChange(!menuOpen);
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconEllipsisOutlineMedium, { size: 16 })
							})
						})
					})
				]
			});
		});
		//#endregion
		//#region src/client/session-pending.ts
		const EMPTY_PENDING_INTERACTIONS = /* @__PURE__ */ new Map();
		const EMPTY_SESSION_STATUS = /* @__PURE__ */ new Map();
		function useEmptySessionPendingInteraction(selector) {
			return selector(EMPTY_PENDING_INTERACTIONS);
		}
		function useEmptySessionStatus(selector) {
			return selector(EMPTY_SESSION_STATUS);
		}
		function useHostSessionStatus(useSessionStatus) {
			return (useSessionStatus ?? useEmptySessionStatus)((state) => state);
		}
		/** 旧宿主订阅 pending Store；alpha.2 改走 useSessionStatus。两路都要订阅，避免条件 Hook。 */
		function useHostPendingInteractions(useSessionPendingInteraction, useSessionStatus) {
			return mergePendingInteractions((useSessionPendingInteraction ?? useEmptySessionPendingInteraction)((state) => state), (useSessionStatus ?? useEmptySessionStatus)((state) => state));
		}
		function visiblePendingKind(kind) {
			switch (kind) {
				case "approval":
				case "plan-review":
				case "question": return kind;
				default: return;
			}
		}
		/** 旧版 SessionSummary 的兼容读取；alpha.5 已将该状态迁移到独立 Store。 */
		function legacyPendingInteraction(summary) {
			if (typeof summary !== "object" || summary === null || !("pendingInteraction" in summary)) return void 0;
			return summary.pendingInteraction;
		}
		function pendingInteractionForSession(sessionId, pendingInteractions, summaryKind) {
			return visiblePendingKind(summaryKind) ?? visiblePendingKind(pendingInteractions.get(sessionId)?.kind);
		}
		//#endregion
		//#region src/business-api.ts
		const CODEX_UI_API_BASE = "/api/dsh-codex-ui";
		const CODEX_UI_API_ENDPOINTS = Object.freeze({
			connectors: `${CODEX_UI_API_BASE}/connectors`,
			dependencies: `${CODEX_UI_API_BASE}/dependencies`,
			openInExplorer: `${CODEX_UI_API_BASE}/open-in-explorer`,
			preferences: `${CODEX_UI_API_BASE}/preferences`,
			sessionMove: `${CODEX_UI_API_BASE}/session-move`
		});
		//#endregion
		//#region src/client/business-request-error.ts
		var BusinessRequestError = class extends Error {
			status;
			constructor(status) {
				super(`业务请求失败：HTTP ${status}`);
				this.status = status;
				this.name = "BusinessRequestError";
			}
		};
		function businessRequestErrorKey(error) {
			if (!(error instanceof BusinessRequestError)) return void 0;
			if (error.status === 401) return "errors.unauthorized";
			if (error.status === 403) return "errors.forbidden";
			if (error.status === 503) return "errors.serviceUnavailable";
		}
		const WORKSPACE_GROUP_ERROR_MESSAGES = {
			"group-invalid": "分组信息无效。",
			"workspace-invalid": "项目标识无效。",
			"group-missing": "目标分组不存在。",
			"order-anchor-missing": "排序锚点不存在。"
		};
		/** 以稳定错误码承载分组业务失败，诊断文案不参与界面控制逻辑。 */
		var WorkspaceGroupError = class extends Error {
			code;
			name = "WorkspaceGroupError";
			constructor(code, message = WORKSPACE_GROUP_ERROR_MESSAGES[code]) {
				super(message);
				this.code = code;
			}
		};
		/** 校验结构和归属；存储兼容模式保留旧 locale 下合法的大小写变体名称。 */
		function parseGroups(value, preserveCaseVariants) {
			if (!Array.isArray(value) || value.length > 100) return void 0;
			const groupIds = /* @__PURE__ */ new Set();
			const groupTitles = /* @__PURE__ */ new Set();
			const workspaceIds = /* @__PURE__ */ new Set();
			const groups = [];
			for (const valueGroup of value) {
				if (valueGroup === null || typeof valueGroup !== "object") return void 0;
				const group = valueGroup;
				const id = typeof group.id === "string" ? group.id.trim() : "";
				const title = typeof group.title === "string" ? group.title.trim() : "";
				if (id === "" || id.length > 128 || title === "" || title.length > 80) return void 0;
				const titleKey = preserveCaseVariants ? title : title.toLowerCase();
				if (groupIds.has(id) || groupTitles.has(titleKey)) return void 0;
				if (!Array.isArray(group.workspaceIds) || group.workspaceIds.length > 1e3) return void 0;
				const normalizedIds = [...new Set(group.workspaceIds)];
				if (!normalizedIds.every((workspaceId) => typeof workspaceId === "string" && workspaceId.trim() !== "" && workspaceId.length <= 256)) return void 0;
				if (normalizedIds.some((workspaceId) => workspaceIds.has(workspaceId))) return void 0;
				groupIds.add(id);
				groupTitles.add(titleKey);
				normalizedIds.forEach((workspaceId) => workspaceIds.add(workspaceId));
				groups.push({
					id,
					title,
					workspaceIds: normalizedIds
				});
			}
			return groups;
		}
		/** 旧数据可往返保存且不改名；新名称的大小写判重由创建、重命名操作执行。 */
		function parseStoredWorkspaceGroups(value) {
			return parseGroups(value, true);
		}
		/** 新建空分组；项目只有被显式移动后才会进入其中。 */
		function createWorkspaceGroup(groups, group) {
			if (groups.some((existing) => existing.title.toLowerCase() === group.title.trim().toLowerCase())) throw new WorkspaceGroupError("group-invalid");
			const next = parseStoredWorkspaceGroups([...groups, {
				...group,
				workspaceIds: []
			}]);
			if (next === void 0) throw new WorkspaceGroupError("group-invalid");
			return next;
		}
		/** 仅更改名称，保留分组标识、成员及其顺序。 */
		function renameWorkspaceGroup(groups, groupId, title) {
			if (!groups.some((group) => group.id === groupId)) throw new WorkspaceGroupError("group-missing");
			const normalizedTitle = title.trim();
			if (normalizedTitle === "" || normalizedTitle.length > 80 || groups.some((group) => group.id !== groupId && group.title.toLowerCase() === normalizedTitle.toLowerCase())) throw new WorkspaceGroupError("group-invalid");
			return groups.map((group) => group.id === groupId ? {
				...group,
				title: normalizedTitle
			} : group);
		}
		/** 将项目放入指定分组；未传分组时退回未分组区。 */
		function assignWorkspaceToGroup(groups, workspaceId, groupId) {
			if (workspaceId.trim() === "" || workspaceId.length > 256) throw new WorkspaceGroupError("workspace-invalid");
			if (groupId !== void 0 && !groups.some((group) => group.id === groupId)) throw new WorkspaceGroupError("group-missing");
			return groups.map((group) => ({
				...group,
				workspaceIds: group.id === groupId ? [...group.workspaceIds.filter((id) => id !== workspaceId), workspaceId] : group.workspaceIds.filter((id) => id !== workspaceId)
			}));
		}
		/** 将项目插入目标分组的指定位置，同时从原分组移除。 */
		function placeWorkspaceInGroup(groups, workspaceId, groupId, beforeId) {
			if (workspaceId.trim() === "" || workspaceId.length > 256) throw new WorkspaceGroupError("workspace-invalid");
			const target = groups.find((group) => group.id === groupId);
			if (target === void 0) throw new WorkspaceGroupError("group-missing");
			const targetIds = target.workspaceIds.filter((id) => id !== workspaceId);
			const index = beforeId === void 0 ? targetIds.length : targetIds.indexOf(beforeId);
			if (index < 0) throw new WorkspaceGroupError("order-anchor-missing");
			targetIds.splice(index, 0, workspaceId);
			return groups.map((group) => ({
				...group,
				workspaceIds: group.id === groupId ? targetIds : group.workspaceIds.filter((id) => id !== workspaceId)
			}));
		}
		/** 在同一分组内移动项目；省略锚点时放到分组末尾。 */
		function moveWorkspaceGroupMember(groups, workspaceId, groupId, beforeId) {
			const target = groups.find((group) => group.id === groupId);
			if (target === void 0) throw new WorkspaceGroupError("group-missing");
			if (!target.workspaceIds.includes(workspaceId)) return groups.map((group) => ({
				...group,
				workspaceIds: [...group.workspaceIds]
			}));
			const remaining = target.workspaceIds.filter((id) => id !== workspaceId);
			const index = beforeId === void 0 ? remaining.length : remaining.indexOf(beforeId);
			if (index < 0) throw new WorkspaceGroupError("order-anchor-missing");
			const workspaceIds = [...remaining];
			workspaceIds.splice(index, 0, workspaceId);
			return groups.map((group) => group.id === groupId ? {
				...group,
				workspaceIds
			} : {
				...group,
				workspaceIds: [...group.workspaceIds]
			});
		}
		/** 调整自定义分组顺序；省略锚点时移动到所有自定义分组末尾。 */
		function moveWorkspaceGroup(groups, groupId, beforeGroupId) {
			const moved = groups.find((group) => group.id === groupId);
			if (moved === void 0) throw new WorkspaceGroupError("group-missing");
			if (beforeGroupId === groupId) return groups.map((group) => ({
				...group,
				workspaceIds: [...group.workspaceIds]
			}));
			const remaining = groups.filter((group) => group.id !== groupId);
			const index = beforeGroupId === void 0 ? remaining.length : remaining.findIndex((group) => group.id === beforeGroupId);
			if (index < 0) throw new WorkspaceGroupError("order-anchor-missing");
			remaining.splice(index, 0, moved);
			return remaining.map((group) => ({
				...group,
				workspaceIds: [...group.workspaceIds]
			}));
		}
		/** 删除分组时仅解除归属，不影响工作区本身。 */
		function deleteWorkspaceGroup(groups, groupId) {
			return groups.filter((group) => group.id !== groupId).map((group) => ({
				...group,
				workspaceIds: [...group.workspaceIds]
			}));
		}
		/** 工作区清单变化后清理失效归属，但保留空分组供用户继续使用。 */
		function pruneWorkspaceGroups(groups, validIds) {
			const valid = new Set(validIds);
			return groups.map((group) => ({
				...group,
				workspaceIds: group.workspaceIds.filter((id) => valid.has(id))
			}));
		}
		function groupedWorkspaceIds(groups) {
			return groups.flatMap((group) => group.workspaceIds);
		}
		//#endregion
		//#region src/client/pinned-workspaces.ts
		/** 浏览器本地持久化键；用于工作区偏好的首帧恢复与 Host 故障兜底。 */
		const PINNED_WORKSPACES_STORAGE_KEY = "dsh-codex-ui.pinned-workspace-ids";
		const WORKSPACE_GROUPS_STORAGE_KEY = "dsh-codex-ui.workspace-groups.v1";
		const WORKSPACE_PREFERENCES_ENDPOINT = CODEX_UI_API_ENDPOINTS.preferences;
		/** 清理无效或重复的工作区标识。 */
		function normalizePinnedWorkspaceIds(ids) {
			return [...new Set(ids.filter((id) => id.trim() !== ""))];
		}
		/** 仅在宿主完整基线就绪后清理已经不存在的工作区，避免加载中的临时列表抹掉持久化置顶。 */
		function prunePinnedWorkspaceIds(ids, validIds) {
			const valid = new Set(validIds);
			const next = ids.filter((id) => valid.has(id));
			return next.length === ids.length ? [...ids] : next;
		}
		/** Host 数据优先；旧 Host 或待同步分组使用本地缓存，读取期间的用户操作始终优先。 */
		function resolveWorkspacePreferencesHydration(local, host, dirty, localWorkspaceGroupsPendingHostSync = false) {
			if (dirty !== void 0) return {
				pinnedWorkspaceIds: normalizePinnedWorkspaceIds(dirty.pinnedWorkspaceIds),
				workspaceGroups: dirty.workspaceGroups,
				writeHost: true
			};
			if (host.exists) {
				const preserveLocalGroups = host.workspaceGroupsSupported === false || localWorkspaceGroupsPendingHostSync;
				return {
					pinnedWorkspaceIds: normalizePinnedWorkspaceIds(host.pinnedWorkspaceIds),
					workspaceGroups: preserveLocalGroups ? local.workspaceGroups : host.workspaceGroups,
					writeHost: localWorkspaceGroupsPendingHostSync && host.workspaceGroupsSupported !== false
				};
			}
			const pinnedWorkspaceIds = normalizePinnedWorkspaceIds(local.pinnedWorkspaceIds);
			return {
				pinnedWorkspaceIds,
				workspaceGroups: local.workspaceGroups,
				writeHost: pinnedWorkspaceIds.length > 0 || local.workspaceGroups.length > 0
			};
		}
		async function readHostWorkspacePreferences(fetcher = fetch) {
			const response = await fetcher(WORKSPACE_PREFERENCES_ENDPOINT, {
				method: "GET",
				cache: "no-store",
				signal: AbortSignal.timeout(5e3)
			});
			if (!response.ok) throw new BusinessRequestError(response.status);
			const payload = await response.json();
			if (payload === null || typeof payload !== "object") throw new Error("置顶偏好响应格式无效。");
			const record = payload;
			const workspaceGroupsSupported = Object.prototype.hasOwnProperty.call(record, "workspaceGroups");
			const workspaceGroups = workspaceGroupsSupported ? parseStoredWorkspaceGroups(record.workspaceGroups) : [];
			if (typeof record.exists !== "boolean" || !Array.isArray(record.pinnedWorkspaceIds) || !record.pinnedWorkspaceIds.every((id) => typeof id === "string") || workspaceGroups === void 0) throw new Error("置顶偏好响应格式无效。");
			return {
				exists: record.exists,
				pinnedWorkspaceIds: normalizePinnedWorkspaceIds(record.pinnedWorkspaceIds),
				workspaceGroups,
				workspaceGroupsSupported
			};
		}
		async function writeHostWorkspacePreferences(pinnedWorkspaceIds, workspaceGroups, fetcher = fetch) {
			const groups = parseStoredWorkspaceGroups([...workspaceGroups]);
			if (groups === void 0) throw new Error("工作区分组数据无效。");
			const response = await fetcher(WORKSPACE_PREFERENCES_ENDPOINT, {
				method: "PUT",
				cache: "no-store",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					pinnedWorkspaceIds: normalizePinnedWorkspaceIds(pinnedWorkspaceIds),
					workspaceGroups: groups
				}),
				signal: AbortSignal.timeout(5e3)
			});
			if (!response.ok) throw new BusinessRequestError(response.status);
		}
		/** 兼容旧调用方；新代码应同时写入分组。 */
		async function readHostPinnedWorkspaceIds(fetcher = fetch) {
			return readHostWorkspacePreferences(fetcher);
		}
		/** 在置顶列表中切换一个工作区。 */
		/** 把工作区插入置顶列表的指定位置；省略锚点时追加到末尾。 */
		function insertPinnedWorkspace(ids, id, beforeId) {
			const next = ids.filter((item) => item !== id);
			if (beforeId === void 0) return [...next, id];
			if (beforeId === id) return ids.includes(id) ? [...ids] : [...next, id];
			const index = next.indexOf(beforeId);
			next.splice(index < 0 ? next.length : index, 0, id);
			return next;
		}
		function togglePinnedWorkspace(ids, workspaceId) {
			return ids.includes(workspaceId) ? ids.filter((id) => id !== workspaceId) : [...ids, workspaceId];
		}
		/** 从浏览器本地存储读取置顶工作区；损坏数据按空列表处理。 */
		function readPinnedWorkspaceIds(storage) {
			if (storage === void 0) return [];
			try {
				const value = JSON.parse(storage.getItem("dsh-codex-ui.pinned-workspace-ids") ?? "[]");
				return Array.isArray(value) && value.every((id) => typeof id === "string") ? normalizePinnedWorkspaceIds(value) : [];
			} catch {
				return [];
			}
		}
		/** 保存置顶工作区；存储不可用时不影响导航。 */
		function savePinnedWorkspaceIds(storage, ids) {
			if (storage === void 0) return;
			try {
				storage.setItem(PINNED_WORKSPACES_STORAGE_KEY, JSON.stringify(normalizePinnedWorkspaceIds(ids)));
			} catch {}
		}
		/** 分组缓存用于首帧恢复和 Host 暂时不可用时兜底，并记录尚未完成的 Host 迁移。 */
		function readWorkspaceGroupsCache(storage) {
			if (storage === void 0) return {
				workspaceGroups: [],
				pendingHostSync: false
			};
			try {
				const value = JSON.parse(storage.getItem("dsh-codex-ui.workspace-groups.v1") ?? "{\"version\":1,\"workspaceGroups\":[],\"pendingHostSync\":false}");
				if (value === null || typeof value !== "object") return {
					workspaceGroups: [],
					pendingHostSync: false
				};
				const record = value;
				const workspaceGroups = record.version === 1 ? parseStoredWorkspaceGroups(record.workspaceGroups) : void 0;
				if (workspaceGroups === void 0 || typeof record.pendingHostSync !== "boolean") return {
					workspaceGroups: [],
					pendingHostSync: false
				};
				return {
					workspaceGroups,
					pendingHostSync: record.pendingHostSync
				};
			} catch {
				return {
					workspaceGroups: [],
					pendingHostSync: false
				};
			}
		}
		function saveWorkspaceGroupsCache(storage, groups, pendingHostSync) {
			if (storage === void 0) return;
			const workspaceGroups = parseStoredWorkspaceGroups([...groups]);
			if (workspaceGroups === void 0) return;
			try {
				storage.setItem(WORKSPACE_GROUPS_STORAGE_KEY, JSON.stringify({
					version: 1,
					workspaceGroups,
					pendingHostSync
				}));
			} catch {}
		}
		//#endregion
		//#region src/client/session-manager.ts
		const SESSION_UNREAD_STORAGE_KEY = "dsh.session-unread.v1";
		function normalizeSessionIds(ids) {
			return [...new Set(ids.filter((id) => id.trim() !== ""))];
		}
		function toggleSessionId(ids, sessionId) {
			return ids.includes(sessionId) ? ids.filter((id) => id !== sessionId) : [sessionId, ...ids.filter((id) => id !== sessionId)];
		}
		/** 返回本次刷新中结束、且不在当前会话中的后台会话。 */
		function completedBackgroundSessionIds(previous, current, currentSessionId) {
			return Object.entries(current).flatMap(([id, running]) => previous[id] === true && running !== true && id !== currentSessionId ? [id] : []);
		}
		function readSessionIds(storage, key) {
			if (storage === void 0) return [];
			try {
				const value = JSON.parse(storage.getItem(key) ?? "{\"version\":1,\"ids\":[]}");
				if (value === null || typeof value !== "object") return [];
				const ids = value.ids;
				return Array.isArray(ids) && ids.every((id) => typeof id === "string") ? normalizeSessionIds(ids) : [];
			} catch {
				return [];
			}
		}
		function writeSessionIds(storage, key, ids) {
			if (storage === void 0) return;
			try {
				storage.setItem(key, JSON.stringify({
					version: 1,
					ids: normalizeSessionIds(ids)
				}));
			} catch {}
		}
		//#endregion
		//#region src/client/hover-tip.ts
		/** 把悬停卡片限制在视口内，避免贴边裁切。 */
		function clampHoverCardPosition(left, top, width, height, viewportWidth, viewportHeight) {
			const pad = 8;
			return {
				left: Math.min(Math.max(left, pad), Math.max(pad, viewportWidth - width - pad)),
				top: Math.min(Math.max(top, pad), Math.max(pad, viewportHeight - height - pad))
			};
		}
		/** 从行元素算出卡片出现在右侧的初始坐标。 */
		function hoverCardAnchor(rect) {
			return {
				left: rect.right + 8,
				top: rect.top
			};
		}
		const HOUR = 3600;
		const DAY = HOUR * 24;
		const WEEK = DAY * 7;
		const MONTH = DAY * 30;
		const YEAR = DAY * 365;
		function formatRelativeTime(updatedAt, t, now, justNow) {
			const seconds = Math.max(0, Math.floor((now - updatedAt) / 1e3));
			if (seconds < 60) return t(justNow);
			if (seconds < HOUR) return t("time.minutes", { count: Math.floor(seconds / 60) });
			if (seconds < DAY) return t("time.hours", { count: Math.floor(seconds / HOUR) });
			if (seconds < WEEK) return t("time.days", { count: Math.floor(seconds / DAY) });
			if (seconds < MONTH) return t("time.weeks", { count: Math.floor(seconds / WEEK) });
			if (seconds < YEAR) return t("time.months", { count: Math.floor(seconds / MONTH) });
			return t("time.years", { count: Math.floor(seconds / YEAR) });
		}
		/** 悬停卡片右上角。分档与 ChatGPT `$wa` 一致；英文刚刚用 Just now。 */
		function formatHoverTime(updatedAt, t, now = Date.now()) {
			return formatRelativeTime(updatedAt, t, now, "time.justNow");
		}
		/** 会话行右侧。分档相同；英文刚刚用 now，避免挤占标题。 */
		function formatCompactTime(updatedAt, t, now = Date.now()) {
			return formatRelativeTime(updatedAt, t, now, "time.justNowShort");
		}
		//#endregion
		//#region src/client/shared-now.ts
		const SHARED_NOW_INTERVAL_MS = 6e4;
		/** 对齐到下一个整档，避免「刚刚」在整分钟边界之后还多停将近一轮。 */
		function msUntilNextNowTick(now, intervalMs = SHARED_NOW_INTERVAL_MS) {
			const remainder = now % intervalMs;
			return remainder === 0 ? intervalMs : intervalMs - remainder;
		}
		const listeners = /* @__PURE__ */ new Set();
		let sharedNow = Date.now();
		let timeoutId = 0;
		let intervalId = 0;
		let cancelled = true;
		function publish(now) {
			sharedNow = now;
			for (const listener of listeners) listener();
		}
		function startClock() {
			cancelled = false;
			timeoutId = window.setTimeout(() => {
				if (cancelled) return;
				publish(Date.now());
				intervalId = window.setInterval(() => {
					publish(Date.now());
				}, SHARED_NOW_INTERVAL_MS);
				if (cancelled) {
					window.clearInterval(intervalId);
					intervalId = 0;
				}
			}, msUntilNextNowTick(Date.now()));
		}
		function stopClock() {
			cancelled = true;
			window.clearTimeout(timeoutId);
			window.clearInterval(intervalId);
			timeoutId = 0;
			intervalId = 0;
		}
		function subscribe(listener) {
			if (listeners.size === 0) {
				sharedNow = Date.now();
				startClock();
			}
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
				if (listeners.size === 0) stopClock();
			};
		}
		function getSnapshot() {
			return sharedNow;
		}
		/** 模块级当前时刻。几棵树挂着都只走一套定时器，每分钟刷新一次。 */
		function useSharedNow() {
			return (0, react.useSyncExternalStore)(subscribe, getSnapshot, getSnapshot);
		}
		const HEADER_PROJECT_TIP_EVENT = "dcu-header-project-tip";
		const HEADER_SESSION_MENU_EVENT = "dcu-header-session-menu";
		//#endregion
		//#region src/client/hover-shell.tsx
		const HOVER_TIP_SHOW_DELAY_MS = 1e3;
		const WORKSPACE_HOVER_CARD_ESTIMATED_HEIGHT = 152;
		const HoverDispatchContext = (0, react.createContext)({
			showTip: () => {},
			hideTip: () => {},
			dismissTip: () => {},
			keepTip: () => {},
			isShowing: () => false
		});
		const HoverValueContext = (0, react.createContext)(void 0);
		/** 悬停状态放在独立 Provider 里，读 tip 的卡片会更新，树组件只拿稳定的 dispatch。 */
		function HoverShell({ blocked = false, children }) {
			const [hoverTip, setHoverTip] = (0, react.useState)();
			const hideTipTimer = (0, react.useRef)();
			const showTipTimer = (0, react.useRef)();
			const pendingTip = (0, react.useRef)();
			const blockedRef = (0, react.useRef)(blocked);
			blockedRef.current = blocked;
			const tipRef = (0, react.useRef)(hoverTip);
			tipRef.current = hoverTip;
			const place = (tip) => ({
				...tip,
				...clampHoverCardPosition(tip.left, tip.top, tip.kind === "workspace" ? 316 : 248, tip.kind === "workspace" ? WORKSPACE_HOVER_CARD_ESTIMATED_HEIGHT : 148, window.innerWidth, window.innerHeight)
			});
			const dispatch = (0, react.useMemo)(() => ({
				showTip: (tip, options) => {
					if (blockedRef.current) return;
					if (hideTipTimer.current !== void 0) {
						window.clearTimeout(hideTipTimer.current);
						hideTipTimer.current = void 0;
					}
					pendingTip.current = tip;
					if (options?.immediate === true || tipRef.current !== void 0) {
						if (showTipTimer.current !== void 0) {
							window.clearTimeout(showTipTimer.current);
							showTipTimer.current = void 0;
						}
						setHoverTip(place(tip));
						return;
					}
					if (showTipTimer.current !== void 0) window.clearTimeout(showTipTimer.current);
					showTipTimer.current = window.setTimeout(() => {
						showTipTimer.current = void 0;
						const next = pendingTip.current;
						if (blockedRef.current || next === void 0) return;
						setHoverTip(place(next));
					}, HOVER_TIP_SHOW_DELAY_MS);
				},
				hideTip: () => {
					pendingTip.current = void 0;
					if (showTipTimer.current !== void 0) {
						window.clearTimeout(showTipTimer.current);
						showTipTimer.current = void 0;
					}
					if (hideTipTimer.current !== void 0) window.clearTimeout(hideTipTimer.current);
					hideTipTimer.current = window.setTimeout(() => {
						setHoverTip(void 0);
					}, 120);
				},
				dismissTip: () => {
					pendingTip.current = void 0;
					if (showTipTimer.current !== void 0) {
						window.clearTimeout(showTipTimer.current);
						showTipTimer.current = void 0;
					}
					if (hideTipTimer.current !== void 0) {
						window.clearTimeout(hideTipTimer.current);
						hideTipTimer.current = void 0;
					}
					setHoverTip(void 0);
				},
				keepTip: () => {
					if (hideTipTimer.current !== void 0) {
						window.clearTimeout(hideTipTimer.current);
						hideTipTimer.current = void 0;
					}
				},
				isShowing: (kind, id) => tipRef.current?.kind === kind && tipRef.current.id === id
			}), []);
			(0, react.useEffect)(() => () => {
				if (hideTipTimer.current !== void 0) window.clearTimeout(hideTipTimer.current);
				if (showTipTimer.current !== void 0) window.clearTimeout(showTipTimer.current);
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(HoverDispatchContext.Provider, {
				value: dispatch,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(HoverValueContext.Provider, {
					value: hoverTip,
					children
				})
			});
		}
		function useHoverDispatch() {
			return (0, react.useContext)(HoverDispatchContext);
		}
		function useHoverValue() {
			return (0, react.useContext)(HoverValueContext);
		}
		//#endregion
		//#region src/client/workspace-hover-card.tsx
		/** 只订阅悬停值，避免工作区树随鼠标移动整树重绘。 */
		function WorkspaceHoverCard({ t, onEditWorkspace, onToggleWorkspacePin }) {
			const hoverTip = useHoverValue();
			const { keepTip, hideTip, dismissTip } = useHoverDispatch();
			(0, react.useEffect)(() => {
				if (hoverTip === void 0) return;
				const onPointerDown = (event) => {
					const target = event.target;
					if (!(target instanceof Element)) return;
					if (target.closest(".dcu-wb-tip") !== null || target.closest("[data-dcu-title-folder]") !== null || target.closest(".dcu-wb-project-head") !== null) return;
					dismissTip();
				};
				window.addEventListener("pointerdown", onPointerDown, true);
				return () => {
					window.removeEventListener("pointerdown", onPointerDown, true);
				};
			}, [hoverTip, dismissTip]);
			if (hoverTip === void 0) return null;
			const workspace = hoverTip.kind === "workspace";
			const workspaceId = workspace ? hoverTip.id : void 0;
			const taskSummary = hoverTip.unreadCount !== void 0 && hoverTip.unreadCount > 0 ? t("workspace.taskSummary", {
				count: hoverTip.count ?? 0,
				unreadCount: hoverTip.unreadCount
			}) : t("workspace.taskCount", { count: hoverTip.count ?? 0 });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: `dcu-wb-tip${workspace ? " dcu-wb-tip-workspace" : ""}`,
				style: {
					left: hoverTip.left,
					top: hoverTip.top
				},
				onMouseEnter: keepTip,
				onMouseLeave: hideTip,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dcu-wb-tip-title",
						children: [
							workspace && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dcu-wb-folder",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconFolderCloseMedium, { size: 16 })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dcu-wb-tip-title-main",
								children: hoverTip.title
							}),
							workspaceId !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dcu-wb-tip-pin",
								"aria-label": t(hoverTip.pinned === true ? "workspace.unpin" : "workspace.pin"),
								onClick: () => {
									onToggleWorkspacePin(workspaceId);
									dismissTip();
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PinIcon, {})
							}) : hoverTip.time !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dcu-wb-tip-time",
								children: hoverTip.time
							})
						]
					}),
					workspace && hoverTip.count !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dcu-wb-tip-meta",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MessageCircle, {
							"aria-hidden": "true",
							size: 16,
							strokeWidth: 1.5
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: taskSummary })]
					}),
					workspace && hoverTip.path !== void 0 && hoverTip.path !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dcu-wb-tip-row dcu-wb-tip-path",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dcu-wb-folder",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconFolderCloseMedium, { size: 16 })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dcu-wb-tip-path-copy",
							children: hoverTip.path
						})]
					}),
					!workspace && hoverTip.project !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dcu-wb-tip-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dcu-wb-folder",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconFolderCloseMedium, { size: 16 })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: hoverTip.project })]
					}),
					!workspace && hoverTip.branch !== void 0 && hoverTip.branch !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dcu-wb-tip-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dcu-wb-folder",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconBranchOutlineMedium, { size: 16 })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: hoverTip.branch })]
					}),
					workspaceId !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "dcu-wb-tip-sep" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "dcu-wb-tip-edit",
						onClick: () => {
							onEditWorkspace(workspaceId, hoverTip.title);
							dismissTip();
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconSettingsOutlineMedium, { size: 16 }), t("workspace.edit")]
					})] })
				]
			});
		}
		//#endregion
		//#region src/client/schedule-sessions.ts
		const AUTOMATION_SESSION_PREFIX = "dsh-automation-session-";
		function isScheduleSession(id, _title) {
			return id.startsWith(AUTOMATION_SESSION_PREFIX);
		}
		//#endregion
		//#region src/client/workspace-browser.ts
		/** 任务树只保留普通会话，频道和定时会话各走自己的页签。 */
		function isTaskSession(session) {
			if (session.origin === "subagent" || session.origin === "im" || session.blank === true) return false;
			if (isChannelSession(session.id)) return false;
			return !isScheduleSession(session.id, session.displayTitle ?? session.title ?? "");
		}
		/**
		* 对齐本机 Codex 26.915.4065.0 的项目会话列表。
		* 未展开时显示 5 条；展开后每次再加 10 条。按钮文案保持「展开显示」，全部露出后消失。
		* 当前会话落在窗口外时追加到末尾。
		*/
		function projectSessionWindow(ids, state, forcedId) {
			const page = state.page < 1 ? 1 : state.page;
			const limit = state.expanded ? 5 + 10 * page : 5;
			const head = ids.slice(0, limit);
			const visible = forcedId !== void 0 && ids.includes(forcedId) && !head.includes(forcedId) ? [...head, forcedId] : head;
			return {
				ids: visible,
				showMore: visible.length < ids.length
			};
		}
		/**
		* 折叠项目文件夹时清掉「展开显示」。
		* 安装包 i$n：文件夹从展开变为折叠时，对 `project:${id}` 调用 sE(..., false)。
		*/
		function collapseProjectSessionWindow() {
			return {
				expanded: false,
				page: 1
			};
		}
		/** 第一次展开把页码设为 1（可见 15 条），之后每点一次页码加 1。 */
		function nextProjectSessionWindow(state) {
			const current = state ?? {
				expanded: false,
				page: 1
			};
			if (!current.expanded) return {
				expanded: true,
				page: 1
			};
			return {
				expanded: true,
				page: current.page + 1
			};
		}
		/**
		* 会话行蓝线的落点：只在被悬停的那一行下方，且仅当它后面那条会话被折起或不存在。
		* 下一行仍可见时交给它自己的 before 线，避免两条平行蓝线。
		*/
		function sessionDropAfterRowId(drop, renderedIds) {
			const hoveredId = drop?.hoveredId;
			if (hoveredId === void 0 || !renderedIds.includes(hoveredId)) return void 0;
			const beforeId = drop?.beforeId;
			if (beforeId !== void 0 && renderedIds.includes(beforeId)) return void 0;
			return hoveredId;
		}
		/** 过滤不应出现在工作区树中的会话。 */
		function visibleSessionIds(ids, byId, archivedIds) {
			const archived = new Set(archivedIds);
			return ids.filter((id) => {
				const session = byId[id];
				return session !== void 0 && !archived.has(id) && isTaskSession({
					...session,
					id: session.id || id
				});
			});
		}
		/** 没有归属任何项目的普通会话，放到「最近」。 */
		function ungroupedSessionIds(ids, byId, assignedIds, archivedIds) {
			const assigned = new Set(assignedIds);
			return visibleSessionIds(ids, byId, archivedIds).filter((id) => !assigned.has(id));
		}
		/** 将一个项目或会话移到指定项之前；省略锚点时追加到末尾。 */
		function moveBefore(ids, id, beforeId) {
			if (!ids.includes(id) || beforeId === id) return [...ids];
			const next = ids.filter((item) => item !== id);
			const index = beforeId === void 0 ? next.length : next.indexOf(beforeId);
			next.splice(index < 0 ? next.length : index, 0, id);
			return next;
		}
		/**
		* 复刻 Codex 的排序落点：先从当前列表移除被拖项，再把落点表示成“插到谁之前”。
		* null 表示悬停自身或最终顺序不变，此时不显示蓝线，也不执行排序。
		*/
		function reorderDropBeforeId(ids, draggedId, hoveredId, after) {
			if (draggedId === hoveredId || !ids.includes(hoveredId)) return null;
			const remaining = ids.filter((id) => id !== draggedId);
			const hoveredIndex = remaining.indexOf(hoveredId);
			if (hoveredIndex < 0) return null;
			const beforeId = after ? remaining[hoveredIndex + 1] : hoveredId;
			if (!ids.includes(draggedId)) return beforeId;
			return moveBefore(ids, draggedId, beforeId).every((id, index) => id === ids[index]) ? null : beforeId;
		}
		/**
		* 置顶标题区与首项目的上半区都表示“插到第一项之前”，因此必须共用同一条指示线。
		* 非空列表把指示线贴到首项目顶部；空列表才使用独立的起始占位线。
		*/
		function pinnedHeaderDropIndicator(ids) {
			const workspaceId = ids[0];
			return workspaceId === void 0 ? { kind: "empty" } : {
				kind: "workspace",
				workspaceId
			};
		}
		/**
		* 空置顶没有项目行可自行计算落点，松手时 dragleave 又常把 relatedTarget 置空并清掉蓝线。
		* 只要这次 drop 发生在置顶区，空列表也必须把项目置顶。
		*/
		function resolvePinnedSectionDrop(draggedWorkspace, target, pinnedEmpty) {
			if (draggedWorkspace === void 0) return void 0;
			if (target?.zone === "pinned") return {
				id: draggedWorkspace,
				beforeId: target.beforeId
			};
			return pinnedEmpty ? { id: draggedWorkspace } : void 0;
		}
		/** 按指定 id 顺序取出对应项；未出现在 ids 中的项丢弃。 */
		function orderByIds(items, ids, idOf) {
			const byId = new Map(items.map((item) => [idOf(item), item]));
			return ids.flatMap((id) => {
				const item = byId.get(id);
				return item === void 0 ? [] : [item];
			});
		}
		/** 展开移动目标的全部父级，保证页面重载并选中会话后该行仍然可见。 */
		function expandedForSessionMove(current, target) {
			const next = { ...current };
			if (target.pinned) {
				next["section:pinned"] = true;
				next[`pin:${target.workspaceId}`] = true;
				return next;
			}
			next["section:projects"] = true;
			next[target.workspaceId] = true;
			if (target.groupId !== void 0) next[`workspace-group:${target.groupId}`] = true;
			else if (target.hasGroups) next["workspace-group:ungrouped"] = true;
			return next;
		}
		function workspaceIdForSession(workspaces, sessionId) {
			return workspaces.find((workspace) => workspace.sessionIds.some((id) => String(id) === sessionId))?.workspaceId;
		}
		/** 打开或闭合只跟展开状态走；当前会话所在项目额外使用当前色。 */
		function projectFolderPresentation(isExpanded, containsCurrent) {
			return {
				open: isExpanded,
				current: containsCurrent
			};
		}
		/** 当前会话变化时展开所属项目或「最近」；会话尚未进入树则保持原展开状态。 */
		function expandedForCurrentSession(current, sessionId, tree) {
			if (sessionId === void 0 || sessionId === "") return { ...current };
			const workspaceId = workspaceIdForSession(tree.workspaces, sessionId);
			if (workspaceId !== void 0) return expandedForSessionMove(current, {
				workspaceId: String(workspaceId),
				pinned: tree.pinnedWorkspaceIds.includes(String(workspaceId)),
				groupId: tree.groups.find((group) => group.workspaceIds.includes(String(workspaceId)))?.id,
				hasGroups: tree.groups.length > 0
			});
			if (tree.recentIds.includes(sessionId)) return {
				...current,
				"section:recent": true
			};
			return { ...current };
		}
		/** 仅提供真正改变归属的目标；未分组目标固定排在自定义分组之后。 */
		function workspaceGroupMoveTargets(groups, workspaceId) {
			const currentGroupId = groups.find((group) => group.workspaceIds.includes(workspaceId))?.id;
			const targets = groups.filter((group) => group.id !== currentGroupId).map((group) => ({
				groupId: group.id,
				title: group.title
			}));
			if (currentGroupId !== void 0) targets.push({
				groupId: void 0,
				title: void 0
			});
			return targets;
		}
		const SESSION_DRAG_TYPE = "application/x-dcu-session";
		const WORKSPACE_DRAG_TYPE = "application/x-dcu-workspace";
		const WORKSPACE_GROUP_DRAG_TYPE = "application/x-dcu-workspace-group";
		const SESSION_DRAG_PREFIX = "dcu-session:";
		const WORKSPACE_DRAG_PREFIX = "dcu-workspace:";
		const WORKSPACE_GROUP_DRAG_PREFIX = "dcu-workspace-group:";
		function textPayload(data) {
			try {
				return data?.getData("text/plain") ?? "";
			} catch {
				return "";
			}
		}
		/** 写入会话拖拽载荷；drop 时以这个为准，不依赖尚未刷新的 React 状态。 */
		function writeSessionDrag(data, sessionId, title) {
			data.effectAllowed = "move";
			data.setData("text/plain", `${SESSION_DRAG_PREFIX}${sessionId}`);
			data.setData(SESSION_DRAG_TYPE, sessionId);
		}
		function writeWorkspaceDrag(data, workspaceId, title) {
			data.effectAllowed = "move";
			data.setData("text/plain", `${WORKSPACE_DRAG_PREFIX}${workspaceId}`);
			data.setData(WORKSPACE_DRAG_TYPE, workspaceId);
		}
		function writeWorkspaceGroupDrag(data, groupId, title) {
			data.effectAllowed = "move";
			data.setData("text/plain", `${WORKSPACE_GROUP_DRAG_PREFIX}${groupId}`);
			data.setData(WORKSPACE_GROUP_DRAG_TYPE, groupId);
		}
		function readSessionDrag(data, fallback) {
			try {
				const typed = data?.getData(SESSION_DRAG_TYPE);
				if (typed !== void 0 && typed.trim() !== "") return typed;
			} catch {}
			const text = textPayload(data);
			if (text.startsWith(SESSION_DRAG_PREFIX)) return text.slice(12);
			return fallback !== void 0 && fallback.trim() !== "" ? fallback : void 0;
		}
		function sessionDropAction(sourceWorkspaceId, targetWorkspaceId) {
			return sourceWorkspaceId !== void 0 && sourceWorkspaceId === targetWorkspaceId ? "reorder" : "move";
		}
		function readWorkspaceGroupDrag(data, fallback) {
			if (readSessionDrag(data) !== void 0) return void 0;
			try {
				const typed = data?.getData(WORKSPACE_GROUP_DRAG_TYPE);
				if (typed !== void 0 && typed.trim() !== "") return typed;
			} catch {}
			const text = textPayload(data);
			if (text.startsWith(WORKSPACE_GROUP_DRAG_PREFIX)) return text.slice(20);
			return fallback !== void 0 && fallback.trim() !== "" ? fallback : void 0;
		}
		/** 会话拖拽优先；有会话载荷时不得再把父项目置顶。 */
		function readWorkspaceDrag(data, fallback) {
			if (readSessionDrag(data) !== void 0) return void 0;
			if (readWorkspaceGroupDrag(data) !== void 0) return void 0;
			try {
				const typed = data?.getData(WORKSPACE_DRAG_TYPE);
				if (typed !== void 0 && typed.trim() !== "") return typed;
			} catch {}
			const text = textPayload(data);
			if (text.startsWith(WORKSPACE_DRAG_PREFIX)) return text.slice(14);
			return fallback !== void 0 && fallback.trim() !== "" ? fallback : void 0;
		}
		//#endregion
		//#region src/client/workspace-compat.ts
		function hasStartSession(value) {
			return value !== null && typeof value === "object" && "startSession" in value && typeof value.startSession === "function";
		}
		/** 旧版提供聚合字段；alpha.5 起由工作区和会话两个 Store 分别报告基线阶段。 */
		function workspaceBaselinesReady(workspaces, sessions) {
			if ("baselinesReady" in workspaces) return workspaces.baselinesReady === true;
			return "phase" in workspaces && workspaces.phase === "ready" && "phase" in sessions && sessions.phase === "ready";
		}
		//#endregion
		//#region src/client/user-error.ts
		const WORKSPACE_GROUP_ERROR_KEYS = {
			"group-invalid": "errors.groupInvalid",
			"workspace-invalid": "errors.workspaceInvalid",
			"group-missing": "errors.groupMissing",
			"order-anchor-missing": "errors.orderAnchorMissing"
		};
		const HOST_ACTION_DEFAULT_KEYS = {
			rename: "sessions.renameFailed",
			delete: "sessions.deleteFailed",
			archive: "sessions.archiveFailed",
			fork: "sessions.forkFailed"
		};
		const HOST_ACTION_ERROR_KEYS = {
			rename: {
				"session/not-found": "sessions.unknown",
				"session/title-invalid": "sessions.renameInvalid"
			},
			delete: { "session/not-found": "sessions.unknown" },
			archive: { "session/not-found": "sessions.unknown" },
			fork: {
				"session/not-found": "sessions.unknown",
				"session/fork-unavailable": "sessions.forkUnavailable"
			}
		};
		/** 仅显式构造的本地化错误允许原样进入界面。 */
		var UserFacingError = class extends Error {};
		/** 保留 Host 结构化失败及操作语境，界面只消费受控映射。 */
		var HostActionError = class extends Error {
			action;
			reason;
			name = "HostActionError";
			constructor(action, reason) {
				super(`Host ${action} 操作失败`);
				this.action = action;
				this.reason = reason;
			}
		};
		function objectRecord(value) {
			return value !== null && typeof value === "object" ? value : void 0;
		}
		/** DSH 明确要求跨 bundle 按结构标记识别 RemoteFailure，不能使用 instanceof。 */
		function remoteFailureCode(value) {
			const seen = /* @__PURE__ */ new Set();
			let current = value;
			while (true) {
				const record = objectRecord(current);
				if (record === void 0 || seen.has(record)) return void 0;
				seen.add(record);
				if (record.isDSHRemoteError === true && typeof record.code === "string") return record.code;
				current = record.rpcError;
			}
		}
		function diagnosticMessage(value) {
			if (value instanceof Error) return value.message;
			const record = objectRecord(value);
			return typeof record?.message === "string" ? record.message : void 0;
		}
		function hostActionErrorKey(error) {
			const code = remoteFailureCode(error.reason);
			if (code !== void 0) {
				const key = HOST_ACTION_ERROR_KEYS[error.action][code];
				if (key !== void 0) return key;
			}
			if (error.action === "delete" && diagnosticMessage(error.reason)?.includes("UNKNOWN_SESSION") === true) return "sessions.unknown";
			return HOST_ACTION_DEFAULT_KEYS[error.action];
		}
		/** 将业务错误映射为当前语言，未知底层错误统一脱敏。 */
		function userErrorText(error, t) {
			const requestKey = businessRequestErrorKey(error);
			if (requestKey !== void 0) return t(requestKey);
			if (error instanceof UserFacingError) return error.message;
			if (error instanceof WorkspaceGroupError) return t(WORKSPACE_GROUP_ERROR_KEYS[error.code]);
			if (error instanceof HostActionError) return t(hostActionErrorKey(error));
			return t("errors.generic");
		}
		const MOVE_ACTION_PREFIX = "move-session:";
		function parseMoveSessionActionId(actionId) {
			if (!actionId.startsWith(MOVE_ACTION_PREFIX)) return void 0;
			try {
				const workspaceId = decodeURIComponent(actionId.slice(13));
				return workspaceId === "" ? void 0 : workspaceId;
			} catch {
				return;
			}
		}
		//#endregion
		//#region src/client/workspace-archive.ts
		/** 按项目顺序归档会话；失败后停止，交由调用方显示并允许用户重试。 */
		async function archiveWorkspaceSessions(sessionIds, archiveSession) {
			for (const sessionId of new Set(sessionIds)) await archiveSession(sessionId);
		}
		//#endregion
		//#region src/client/workspace-drop-indicator.ts
		const ROWS = ".dcu-wb-section-head,.dcu-wb-collection-head,.dcu-wb-project-head,.dcu-wb-session,.dcu-wb-nochat,.dcu-wb-empty";
		const TARGETS = ".dcu-wb-drop,.dcu-wb-group-order-drop";
		function measureWorkspaceDropIndicator(root, onTargets) {
			const measured = Array.from(root.querySelectorAll(TARGETS)).filter((node) => node.closest("[data-open=false]") === null).map((target) => ({
				target,
				rect: measureTarget(root, target)
			})).filter((item) => item.rect !== void 0);
			const unique = measured.filter((item, index) => !measured.slice(0, index).some((previous) => previous.rect.top === item.rect.top && previous.rect.left === item.rect.left && previous.rect.width === item.rect.width));
			onTargets?.(unique.map((item) => item.target));
			return unique[0]?.rect;
		}
		function measureTarget(root, target) {
			const section = target.closest(".dcu-wb-section") ?? root;
			const rows = Array.from(section.querySelectorAll(ROWS)).filter((node) => node.closest("[data-open=false]") === null).map((node) => ({
				node,
				rect: node.getBoundingClientRect()
			})).filter((row) => row.rect.height > 0 && row.rect.width > 0);
			const owned = rows.filter((row) => row.node === target || target.contains(row.node));
			const after = target.classList.contains("dcu-wb-drop-after");
			let upper;
			let lower;
			let anchor = target.getBoundingClientRect();
			if (owned.length > 0) {
				const edge = after ? owned[owned.length - 1] : owned[0];
				const index = rows.indexOf(edge);
				anchor = edge.rect;
				upper = after ? edge.rect.bottom : rows[index - 1]?.rect.bottom;
				lower = after ? rows[index + 1]?.rect.top : edge.rect.top;
			} else if (target.matches(".dcu-wb-pin-start,.dcu-wb-pin-end")) {
				if (anchor.width <= 0 || anchor.height <= 0) return void 0;
				const itemRows = rows.filter((row) => !row.node.matches(".dcu-wb-section-head,.dcu-wb-empty,.dcu-wb-nochat"));
				if (target.matches(".dcu-wb-pin-end") && itemRows.length > 0) {
					const last = itemRows[itemRows.length - 1];
					anchor = last.rect;
					upper = last.rect.bottom;
					lower = rows.find((row) => row.rect.top >= last.rect.bottom - .5)?.rect.top;
				} else if (target.matches(".dcu-wb-pin-start") && itemRows.length > 0) {
					const first = itemRows[0];
					anchor = first.rect;
					lower = first.rect.top;
					upper = rows.filter((row) => row.rect.bottom <= first.rect.top + .5).at(-1)?.rect.bottom;
				} else {
					upper = rows.filter((row) => row.rect.bottom <= anchor.top).at(-1)?.rect.bottom;
					lower = rows.find((row) => row.rect.top >= anchor.bottom)?.rect.top;
					if (lower === void 0) lower = anchor.bottom;
					if (upper === void 0) upper = anchor.top;
				}
			} else return void 0;
			const center = upper === void 0 ? lower - 4 : lower === void 0 ? upper + 4 : (upper + lower) / 2;
			const box = root.getBoundingClientRect();
			return {
				top: center - box.top - root.clientTop + root.scrollTop - 4,
				left: anchor.left - box.left - root.clientLeft + root.scrollLeft + 4,
				width: Math.max(0, anchor.width - 12)
			};
		}
		/** 仅拖拽期间刷新，滚动、折叠动画和尺寸变化都使用当前帧的布局；结束时完整清理。 */
		function mountWorkspaceDropIndicator(root) {
			const line = root.ownerDocument.createElement("div");
			line.className = "dcu-wb-drop-indicator";
			line.setAttribute("aria-hidden", "true");
			root.append(line);
			root.dataset.dropIndicator = "measured";
			const view = root.ownerDocument.defaultView;
			let frame = 0;
			let previous = "";
			let previousConflict = [];
			const update = () => {
				const rect = measureWorkspaceDropIndicator(root, (targets) => {
					const conflict = targets.length > 1 ? targets : [];
					if (conflict.length > 1 && (conflict.length !== previousConflict.length || conflict.some((target, index) => target !== previousConflict[index]))) console.warn("Codex UI 拖拽存在多个有效落点，请检查跨区状态清理。", { count: conflict.length });
					previousConflict = conflict;
				});
				const next = rect === void 0 ? "" : `${rect.top},${rect.left},${rect.width}`;
				line.hidden = rect === void 0;
				if (rect !== void 0 && next !== previous) {
					line.style.top = `${rect.top}px`;
					line.style.left = `${rect.left}px`;
					line.style.width = `${rect.width}px`;
				}
				previous = next;
				frame = view.requestAnimationFrame(update);
			};
			update();
			return () => {
				view.cancelAnimationFrame(frame);
				line.remove();
				delete root.dataset.dropIndicator;
			};
		}
		//#endregion
		//#region src/client/CodexWorkspaceBrowser.tsx
		const DISCLOSURE_EXIT_MS = 180;
		function NewSessionIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SquarePen, {
				"aria-hidden": "true",
				size: 16,
				strokeWidth: 1.5
			});
		}
		function CreateGroupIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconProjectAddOutlineMedium, { size: 16 });
		}
		function AddWorkspaceIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Plus, {
				"aria-hidden": "true",
				size: 16,
				strokeWidth: 1.5
			});
		}
		/** 使用独立节点生成稳定的拖拽预览，避免浏览器把目标高亮和操作按钮截入默认快照。 */
		function setDragPreview(dataTransfer, title, icon) {
			const preview = document.createElement("div");
			preview.className = "dcu-wb-drag-ghost";
			if (icon !== void 0 && icon !== null) {
				const previewIcon = icon.cloneNode(true);
				previewIcon.className = "dcu-wb-drag-ghost-icon";
				previewIcon.setAttribute("aria-hidden", "true");
				preview.appendChild(previewIcon);
			}
			const previewTitle = document.createElement("span");
			previewTitle.className = "dcu-wb-drag-ghost-title";
			previewTitle.textContent = sessionTitleLine(title);
			preview.appendChild(previewTitle);
			document.body.appendChild(preview);
			preview.offsetWidth;
			dataTransfer.setDragImage(preview, 16, 15);
			window.requestAnimationFrame(() => {
				preview.remove();
			});
		}
		function animateDisclosure(body, wasOpen, open) {
			if (wasOpen === open || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return void 0;
			const height = `${body.scrollHeight}px`;
			const from = wasOpen ? {
				height,
				opacity: 1,
				transform: "translateY(0)"
			} : {
				height: "0px",
				opacity: 0,
				transform: "translateY(-2px)"
			};
			const to = open ? {
				height,
				opacity: 1,
				transform: "translateY(0)"
			} : {
				height: "0px",
				opacity: 0,
				transform: "translateY(-2px)"
			};
			return body.animate([from, to], {
				duration: DISCLOSURE_EXIT_MS,
				easing: "cubic-bezier(.16, 1, .3, 1)",
				fill: "none"
			});
		}
		/** 所有可折叠层级使用同一套原生高度动画，兼容宿主内核对 auto 高度过渡的差异。 */
		function DisclosureBody({ className, children, open }) {
			const bodyRef = (0, react.useRef)(null);
			const previousOpen = (0, react.useRef)(open);
			(0, react.useLayoutEffect)(() => {
				const body = bodyRef.current;
				if (body === null) return;
				body.inert = !open;
				const animation = animateDisclosure(body, previousOpen.current, open);
				previousOpen.current = open;
				return () => {
					animation?.cancel();
				};
			}, [open]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref: bodyRef,
				className,
				"data-open": open,
				"aria-hidden": !open,
				children
			});
		}
		/** 顶层分区使用已有结构，通过统一监听器复用与项目、分组一致的原生动画。 */
		function useSectionDisclosureMotion(rootRef) {
			const previousOpen = (0, react.useRef)(/* @__PURE__ */ new WeakMap());
			(0, react.useLayoutEffect)(() => {
				const bodies = rootRef.current?.querySelectorAll(".dcu-wb-section-body") ?? [];
				for (const body of bodies) {
					const open = body.dataset.open === "true";
					const previous = previousOpen.current.get(body);
					previousOpen.current.set(body, open);
					body.inert = !open;
					if (previous !== void 0) animateDisclosure(body, previous, open);
				}
			});
		}
		function sameWorkspaceDropTarget(left, right) {
			if (left === void 0 || right === void 0) return left === right;
			if (left.zone !== right.zone) return false;
			if (left.zone === "group" && right.zone === "group") return left.groupId === right.groupId && left.beforeId === right.beforeId && left.ontoGroup === right.ontoGroup && left.crossGroup === right.crossGroup;
			if (left.zone === "ungrouped" && right.zone === "ungrouped") return left.beforeId === right.beforeId && left.ontoSection === right.ontoSection && left.crossGroup === right.crossGroup;
			return "beforeId" in left && "beforeId" in right && left.beforeId === right.beforeId;
		}
		function sameWorkspaceGroups(left, right) {
			return left.length === right.length && left.every((group, index) => group.id === right[index]?.id && group.title === right[index]?.title && sameIds(group.workspaceIds, right[index]?.workspaceIds ?? []));
		}
		function newWorkspaceGroupId() {
			if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `group-${crypto.randomUUID()}`;
			return `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
		}
		function workspaceGroupMoveActionId(groupId) {
			return `moveWorkspaceToGroup:${groupId ?? ""}`;
		}
		const stylesheet$4 = `
.dcu-wb{--dcu-wb-inset:8px;display:flex;flex:1;min-height:0;flex-direction:column;padding:4px var(--dcu-wb-inset) 8px;color:var(--dcu-sidebar-primary)}
.dcu-wb *{box-sizing:border-box}
.dcu-wb-tree{flex:1;min-height:0;overflow-x:hidden;overflow-y:auto;padding-bottom:16px;scrollbar-gutter:auto;scrollbar-width:none;user-select:none;-webkit-user-select:none}
.dcu-wb-tree::-webkit-scrollbar{display:none}
.dcu-wb-section+.dcu-wb-section{margin-top:12px}
.dcu-wb-section-head{position:relative;display:flex;align-items:center;min-height:24px;padding:0;border-radius:6px}.dcu-wb-section-head:hover .dcu-wb-actions{display:flex}.dcu-wb-section-label{position:relative;display:flex;align-items:center;gap:4px;flex:1;min-width:0;min-height:24px;border:0;padding:2px 4px 2px 12px;background:transparent;color:var(--dcu-sidebar-tertiary);font:13px/20px var(--dsw-font-family);font-weight:400;letter-spacing:0;text-align:left;cursor:pointer}.dcu-wb-section-caret{display:grid;place-items:center;flex:none;width:12px;height:12px;color:currentColor;opacity:0;transform:rotate(0deg);transform-origin:50% 50%;transition:opacity 120ms ease,transform 160ms ease}.dcu-wb-section-head .dcu-wb-section-caret{position:absolute;left:0;top:6px}.dcu-wb-section-caret svg{display:block}.dcu-wb-section-head:hover .dcu-wb-section-caret,.dcu-wb-section-label:focus-visible .dcu-wb-section-caret{opacity:.78}.dcu-wb-section-label[aria-expanded=true] .dcu-wb-section-caret{transform:rotate(90deg)}.dcu-wb-section-body{display:block}.dcu-wb-section-body[data-open=false]{display:none}.dcu-wb-section-body>div{min-height:0}.dcu-wb-section-body[data-open=true]>div{animation:dcu-wb-section-in 140ms cubic-bezier(.16,1,.3,1)}@keyframes dcu-wb-section-in{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.dcu-wb-section-caret{transition:none}.dcu-wb-section-body[data-open=true]>div{animation:none}}
.dcu-wb-project{position:relative;min-width:0}
.dcu-wb-collection-head .dcu-wb-more{opacity:0;pointer-events:none}
.dcu-wb-collection-head:hover .dcu-wb-more,.dcu-wb-collection-head:focus-within .dcu-wb-more,.dcu-wb-collection-head .dcu-wb-more[aria-expanded=true]{opacity:1;pointer-events:auto}
@media (pointer:coarse){.dcu-wb-collection-head .dcu-wb-more{opacity:1;pointer-events:auto}}
.dcu-wb-collection-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dcu-wb-collection-actions{flex-shrink:0;width:20px}
.dcu-wb-collections{display:grid;min-width:0;gap:4px}.dcu-wb-collection,.dcu-wb-ungrouped{position:relative;min-width:0;overflow:visible}.dcu-wb-collection-head{display:flex;align-items:center;min-height:28px;padding:0 4px;border-radius:6px;transition:background 120ms ease}.dcu-wb-collection-head:hover,.dcu-wb-collection-head:focus-within,.dcu-wb-collection-head.dcu-wb-group-drop{background:var(--dcu-sidebar-hover)}.dcu-wb-collection-head.dcu-wb-group-drop{outline:1px solid var(--dsw-alias-state-business-primary)}.dcu-wb-collection-head[draggable=true],.dcu-wb-collection-head[draggable=true] .dcu-wb-collection-label{cursor:grab}.dcu-wb-collection-head[draggable=true]:active,.dcu-wb-collection-head[draggable=true]:active .dcu-wb-collection-label{cursor:grabbing}.dcu-wb-collection-label{display:flex;align-items:center;gap:5px;min-width:0;flex:1;border:0;padding:4px;background:transparent;color:var(--dcu-sidebar-primary);font:13px/20px var(--dsw-font-family);text-align:left;cursor:pointer}.dcu-wb-collection-label .dcu-wb-section-caret{position:static;order:-1;opacity:.78}.dcu-wb-collection-label[aria-expanded=true] .dcu-wb-section-caret{transform:rotate(90deg)}.dcu-wb-collection-count{margin-left:auto;color:var(--dcu-sidebar-secondary);font-variant-numeric:tabular-nums}.dcu-wb-collection-body{position:relative;min-width:0;padding-left:12px}.dcu-wb-collection-body::before{content:"";position:absolute;left:31px;top:0;bottom:8px;width:1px;background:var(--dcu-sidebar-border)}.dcu-wb-group-member{position:relative}.dcu-wb-group-member.dcu-wb-drop::before,.dcu-wb-collection.dcu-wb-group-order-drop::before,.dcu-wb-ungrouped.dcu-wb-group-order-drop::before{content:"";position:absolute;z-index:2;left:7px;right:8px;top:-8px;height:8px;pointer-events:none;background:radial-gradient(circle at 4px 50%,transparent 1.75px,var(--dsw-alias-state-business-primary) 2px 3.75px,transparent 4px),linear-gradient(var(--dsw-alias-state-business-primary),var(--dsw-alias-state-business-primary)) 10px 50%/calc(100% - 10px) 2px no-repeat}.dcu-wb-group-member.dcu-wb-drop-after::before{top:auto;bottom:-8px}.dcu-wb-collection-body .dcu-wb-project-head{padding-left:12px}
.dcu-wb-collection.dcu-wb-workspace-move-drop,.dcu-wb-ungrouped.dcu-wb-workspace-move-drop{border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 9%,transparent);outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}
.dcu-wb-project-head,.dcu-wb-session{position:relative;display:flex;align-items:center;gap:6px;width:100%;min-width:0;border-radius:10px;padding:0 8px;color:var(--dcu-sidebar-primary);cursor:pointer}
.dcu-wb-collection-body::before{left:calc(4px + 4px + 6px)}
.dcu-wb-project-head{height:30px;background:transparent;font:inherit;text-align:left}
.dcu-wb-project-head:hover,.dcu-wb-project-head.dcu-wb-menu-open,.dcu-wb-session:hover,.dcu-wb-session.dcu-wb-selected,.dcu-wb-session.dcu-wb-menu-open{background:var(--dcu-sidebar-hover)}.dcu-wb-project.dcu-wb-session-drop>.dcu-wb-project-head{border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 9%,transparent);outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}.dcu-wb-project.dcu-wb-session-move-drop{border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 9%,transparent);outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}.dcu-wb-project.dcu-wb-session-move-drop>.dcu-wb-project-head{background:transparent;outline:0}.dcu-wb-project-body>.dcu-wb-session:first-child,.dcu-wb-project-body>.dcu-wb-nochat:first-child{margin-top:4px}.dcu-wb-session+.dcu-wb-session{margin-top:2px}
.dcu-wb-project-head[draggable=true],.dcu-wb-session[draggable=true]{cursor:grab}
.dcu-wb-project-head[draggable=true]:active,.dcu-wb-session[draggable=true]:active{cursor:grabbing}
.dcu-wb-section,.dcu-wb-section:focus,.dcu-wb-section:focus-visible,.dcu-wb-project-head:focus,.dcu-wb-session:focus{outline:0}.dcu-wb-pinned-list{position:relative}.dcu-wb-pin-end,.dcu-wb-pin-start{position:absolute;left:0;right:0;height:8px;z-index:2;pointer-events:none}.dcu-wb-pin-end.dcu-wb-drop,.dcu-wb-pin-start.dcu-wb-drop{pointer-events:auto}.dcu-wb-pin-start{top:0}.dcu-wb-pin-end{bottom:-8px}.dcu-wb-project.dcu-wb-drop::before,.dcu-wb-session.dcu-wb-drop::before,.dcu-wb-pin-end.dcu-wb-drop::before,.dcu-wb-pin-start.dcu-wb-drop::before{content:"";position:absolute;z-index:2;left:7px;right:8px;top:-8px;height:8px;pointer-events:none;background:radial-gradient(circle at 4px 50%,transparent 1.75px,var(--dsw-alias-state-business-primary) 2px 3.75px,transparent 4px),linear-gradient(var(--dsw-alias-state-business-primary),var(--dsw-alias-state-business-primary)) 10px 50%/calc(100% - 10px) 2px no-repeat}.dcu-wb-pin-start.dcu-wb-drop::before{top:0}.dcu-wb-pinned-list>.dcu-wb-project:first-child.dcu-wb-drop::before{top:-4px}.dcu-wb-project.dcu-wb-drop-after::before,.dcu-wb-session.dcu-wb-drop-after::before{top:auto;bottom:-8px}.dcu-wb-dragging{opacity:.28}.dcu-wb-drag-ghost{position:fixed;top:8px;left:-9999px;z-index:10040;display:flex;align-items:center;gap:8px;max-width:220px;height:30px;padding:0 10px;border:1px solid var(--dcu-sidebar-border);border-radius:8px;background:var(--dcu-sidebar-hover);box-shadow:0 4px 12px rgba(0,0,0,.24);color:var(--dcu-sidebar-primary);font:14px/20px var(--dsw-font-family);white-space:nowrap;pointer-events:none}.dcu-wb-drag-ghost-icon{display:grid;place-items:center;flex:none;width:16px;height:16px;color:var(--dcu-sidebar-icon)}.dcu-wb-drag-ghost-icon svg{display:block;width:16px;height:16px}.dcu-wb-drag-ghost-title{min-width:0;overflow:hidden;text-overflow:ellipsis}
.dcu-wb-folder{display:grid;place-items:center;flex:none;width:16px;height:20px;color:var(--dcu-sidebar-icon)}.dcu-wb-folder.dcu-wb-folder-current{color:var(--dsw-alias-state-business-primary)}.dcu-wb-brand{display:block;width:16px;height:16px}
.dcu-wb-project-title,.dcu-wb-session-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:20px}
.dcu-wb-project-title{flex:1;font-weight:400;color:var(--dcu-sidebar-primary)}
.dcu-wb-session{position:relative;min-width:0;min-height:30px;gap:0;overflow:hidden;padding-left:30px;padding-right:28px}
.dcu-wb-session-title{flex:1;margin-left:0}.dcu-wb-session-title-text{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@media (prefers-reduced-motion:no-preference){.dcu-wb-session:hover .dcu-wb-session-title[data-overflow] .dcu-wb-session-title-text,.dcu-wb-session.dcu-wb-menu-open .dcu-wb-session-title[data-overflow] .dcu-wb-session-title-text{display:inline-block;width:max-content;max-width:none;overflow:visible;text-overflow:clip;animation:dcu-wb-title-scroll var(--dcu-title-duration,2.4s) linear 320ms infinite alternate}}@keyframes dcu-wb-title-scroll{0%,18%{transform:translateX(0)}82%,100%{transform:translateX(calc(-1 * var(--dcu-title-shift,0px)))}}.dcu-wb-session-time{position:absolute;right:8px;top:50%;transform:translateY(-50%);color:var(--dcu-sidebar-tertiary);font-size:12px;line-height:18px;font-weight:400;font-variant-numeric:tabular-nums;white-space:nowrap;pointer-events:none}.dcu-wb-session:has(.dcu-wb-session-time){padding-right:64px}.dcu-wb-session:has(.dcu-wb-unread) .dcu-wb-session-time{right:22px}.dcu-wb-session:has(.dcu-wb-unread):has(.dcu-wb-session-time){padding-right:78px}.dcu-wb-session-copy{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center}.dcu-wb-session-sub{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dcu-sidebar-tertiary);font-size:12px;line-height:16px}.dcu-wb-session-flat,.dcu-wb-session-top{padding-left:8px}.dcu-wb-session-flat:has(.dcu-wb-running),.dcu-wb-session-top:has(.dcu-wb-running){padding-left:30px}
.dcu-wb-actions{display:none;align-items:center;gap:8px;flex:none}
.dcu-wb-quick-actions{position:absolute;right:8px;top:50%;display:flex;align-items:center;gap:2px;opacity:0;pointer-events:none;transform:translateY(-50%);background:var(--dcu-sidebar-hover);border-radius:6px}
.dcu-wb-project-head:hover .dcu-wb-actions,.dcu-wb-project-head.dcu-wb-menu-open .dcu-wb-actions,.dcu-wb-session.dcu-wb-menu-open .dcu-wb-actions{display:flex}
.dcu-wb-session:hover .dcu-wb-quick-actions,.dcu-wb-session.dcu-wb-menu-open .dcu-wb-quick-actions{opacity:1;pointer-events:auto}.dcu-wb-session:hover .dcu-wb-pending,.dcu-wb-session.dcu-wb-menu-open .dcu-wb-pending,.dcu-wb-session:hover .dcu-wb-unread,.dcu-wb-session.dcu-wb-menu-open .dcu-wb-unread,.dcu-wb-session:hover .dcu-wb-session-time,.dcu-wb-session.dcu-wb-menu-open .dcu-wb-session-time{visibility:hidden}.dcu-wb-session:has(.dcu-wb-pending) .dcu-wb-session-time{display:none}
.dcu-wb-more{display:grid;place-items:center;width:20px;height:20px;border:0;border-radius:4px;padding:0;background:transparent;color:var(--dcu-sidebar-tertiary);cursor:pointer}
.dcu-wb-more:hover{color:var(--dcu-sidebar-primary)}
.dcu-wb-context-anchor{opacity:0;pointer-events:none}
.dcu-wb-tip{position:fixed;z-index:10050;min-width:220px;max-width:280px;padding:10px 12px;border:1px solid var(--dcu-sidebar-border);border-radius:12px;background:var(--dcu-tip-bg,#fff);box-shadow:var(--dcu-tip-shadow,0 8px 28px rgba(31,39,36,.16));color:var(--dcu-sidebar-primary);animation:dcu-tip-in 180ms cubic-bezier(.16,1,.3,1)}.dcu-wb-tip-workspace{width:316px;min-width:0;max-width:calc(100vw - 16px);padding:10px 8px 8px}@keyframes dcu-tip-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.dcu-wb-tip{animation:none}}.dcu-wb-tip-title{display:flex;align-items:center;gap:6px;min-width:0;min-height:20px;font-size:14px;line-height:20px;font-weight:500}.dcu-wb-tip-title-main{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dcu-wb-tip-time{flex:none;margin-left:auto;color:var(--dcu-sidebar-tertiary);font-size:12px;line-height:18px;font-weight:400}.dcu-wb-tip-pin{display:grid;place-items:center;flex:none;width:20px;height:20px;border:0;border-radius:4px;padding:0;background:transparent;color:var(--dcu-sidebar-tertiary);cursor:pointer}.dcu-wb-tip-pin:hover{background:var(--dcu-sidebar-hover);color:var(--dcu-sidebar-primary)}.dcu-wb-tip-meta,.dcu-wb-tip-row{display:flex;align-items:center;gap:6px;min-width:0;margin-top:4px;color:var(--dcu-sidebar-secondary);font-size:14px;line-height:20px}.dcu-wb-tip-meta svg,.dcu-wb-tip-row svg{flex:none}.dcu-wb-tip-row>span:not(.dcu-wb-folder){min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dcu-wb-tip-path{align-items:flex-start;margin-top:8px}.dcu-wb-tip-path-copy{min-width:0;overflow-wrap:anywhere;white-space:normal}.dcu-wb-tip-sep{height:1px;margin:8px 0 4px;background:var(--dcu-sidebar-border)}.dcu-wb-tip-edit{display:flex;align-items:center;gap:6px;width:100%;min-height:24px;border:0;padding:2px 0;background:transparent;color:var(--dcu-sidebar-primary);font:14px/20px var(--dsw-font-family);text-align:left;cursor:pointer}.dcu-wb-tip-edit svg{flex:none;color:var(--dcu-sidebar-secondary)}
.dcu-wb-session:has(.dcu-wb-pending){padding-right:112px}.dcu-wb-unread{position:absolute;right:13px;top:50%;width:7px;height:7px;margin:-3.5px 0 0;border-radius:50%;background:var(--dsw-alias-state-business-primary)}
.dcu-wb-pending{position:absolute;right:10px;top:50%;display:flex;align-items:center;gap:4px;max-width:88px;margin:0;transform:translateY(-50%);color:var(--dsw-alias-state-warn-label,#b45309);font-size:11px;line-height:16px;white-space:nowrap}.dcu-wb-pending-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-warn-primary,#f59e0b)}.dcu-wb-pending-label{min-width:0;overflow:hidden;text-overflow:ellipsis}
.dcu-wb-empty{padding:14px 8px;color:var(--dcu-sidebar-tertiary);font-size:13px}
.dcu-wb-error{margin:4px 0;padding:6px 8px;border-radius:6px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);color:var(--dsw-alias-state-error-primary);font-size:12px}
.dcu-wb-rail{display:none}
.dcu-wb-rename-actions{display:flex;justify-content:flex-end;gap:8px}
.dcu-wb-delete-button{color:var(--dsw-alias-state-error-primary)!important}
.dcu-wb-delete-copy{margin:0;color:var(--dcu-sidebar-secondary);font-size:13px;line-height:20px}
.dcu-wb-move-target{display:flex;min-width:0;align-items:center;gap:8px;margin-top:4px;color:var(--dcu-sidebar-primary);font:14px/20px var(--dsw-font-family)}.dcu-wb-move-target svg{flex:none;color:var(--dcu-sidebar-secondary)}.dcu-wb-move-target-copy{min-width:0}.dcu-wb-move-project,.dcu-wb-move-path{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dcu-wb-move-path{color:var(--dcu-sidebar-tertiary);font-size:12px}
.dcu-wb-rename-input{box-sizing:border-box;width:100%;height:36px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:7px 10px;outline:0;background:var(--dsw-alias-background-secondary);color:var(--dsw-alias-label-primary);font:14px/20px var(--dsw-font-family);caret-color:var(--dsw-alias-state-business-primary);transition:border-color 120ms ease,box-shadow 120ms ease}
.dcu-wb-rename-input:hover{border-color:color-mix(in srgb,var(--dsw-alias-label-primary) 32%,var(--dsw-alias-border-l2))}
.dcu-wb-rename-input:focus{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 1px color-mix(in srgb,var(--dsw-alias-state-business-primary) 28%,transparent)}
`;
		const runningStyles = `.dcu-wb-running{position:absolute;left:8px;top:50%;display:grid;place-items:center;flex:none;width:16px;height:20px;margin-top:-10px;border:0;background:transparent}.dcu-wb-running::after{content:"";box-sizing:border-box;width:12px;height:12px;border:2px solid color-mix(in srgb,var(--dcu-sidebar-secondary) 25%,transparent);border-top-color:var(--dcu-sidebar-secondary);border-radius:50%;animation:dcu-wb-spin .8s linear infinite}@keyframes dcu-wb-spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.dcu-wb-running::after{animation:none}}`;
		const typographyStyles = `.dcu-wb{--dcu-wb-disclosure-duration:180ms;--dcu-wb-disclosure-ease:cubic-bezier(.16,1,.3,1);font:14px/20px var(--dsw-font-family)}.dcu-wb-section-label{color:var(--dcu-sidebar-secondary);font:13px/20px var(--dsw-font-family);font-weight:400;letter-spacing:0;padding-left:0}.dcu-wb-section-caret{transition:opacity var(--dcu-wb-disclosure-duration) var(--dcu-wb-disclosure-ease),transform var(--dcu-wb-disclosure-duration) var(--dcu-wb-disclosure-ease)}.dcu-wb-section-head .dcu-wb-section-caret{position:static;left:auto;top:auto;opacity:.78}.dcu-wb-section-body,.dcu-wb-project-body,.dcu-wb-collection-body{display:block;min-height:0;height:auto;overflow:clip;opacity:1;transform:none;visibility:visible}.dcu-wb-section-body[data-open=false],.dcu-wb-project-body[data-open=false],.dcu-wb-collection-body[data-open=false]{display:block;height:0;opacity:0;transform:translateY(-2px);pointer-events:none}.dcu-wb-section-body[data-open=true]:has(.dcu-wb-drop),.dcu-wb-project-body[data-open=true]:has(.dcu-wb-drop),.dcu-wb-collection-body[data-open=true]:has(.dcu-wb-drop){overflow:visible}.dcu-wb-section-body[data-open=true]>div{animation:none}@media (prefers-reduced-motion:reduce){.dcu-wb-section-caret{transition:none}}.dcu-wb-project-title{font-size:14px;line-height:20px;font-weight:400;color:var(--dcu-sidebar-primary)}.dcu-wb-session-title{font-size:14px;line-height:20px;font-weight:400;color:var(--dcu-sidebar-secondary)}.dcu-wb-session.dcu-wb-selected .dcu-wb-session-title,.dcu-wb-session:hover .dcu-wb-session-title{color:var(--dcu-sidebar-primary)}.dcu-wb-empty{color:var(--dcu-sidebar-tertiary);font-size:13px;line-height:18px}.dcu-wb-search{display:flex;align-items:center;gap:2px;flex:1;min-width:0}.dcu-wb-search-input{flex:1;min-width:0;height:26px;border:.5px solid var(--dsw-alias-border-l4);border-radius:6px;padding:0 6px;background:transparent;color:var(--dcu-sidebar-primary);font:13px/20px var(--dsw-font-family);outline:none;appearance:none;-webkit-appearance:none}.dcu-wb-search-input::placeholder{color:var(--dcu-sidebar-tertiary)}.dcu-wb-search-input:focus{border-color:var(--dsw-alias-state-business-primary)}.dcu-wb-search-input::-webkit-search-cancel-button{display:none}.dcu-wb-search-toggle{display:grid;place-items:center;flex:none;width:24px;height:24px;border:0;border-radius:4px;padding:0;background:transparent;color:var(--dcu-sidebar-tertiary);cursor:pointer}.dcu-wb-search-toggle:hover{background:var(--dcu-sidebar-hover);color:var(--dcu-sidebar-primary)}.dcu-wb-section-head.dcu-wb-searching .dcu-wb-section-label,.dcu-wb-section-head.dcu-wb-searching .dcu-wb-actions{display:none}`;
		const collectionLayoutStyles = `
.dcu-wb-tree{position:relative}
.dcu-wb-tree[data-drop-indicator=measured] .dcu-wb-drop::before,.dcu-wb-tree[data-drop-indicator=measured] .dcu-wb-group-order-drop::before{display:none}
.dcu-wb-drop-indicator{position:absolute;z-index:3;height:8px;pointer-events:none;color:var(--dsw-alias-state-business-primary)}
.dcu-wb-drop-indicator::before{content:"";position:absolute;left:6px;right:0;top:3px;height:2px;border-radius:999px;background:currentColor}
.dcu-wb-drop-indicator::after{content:"";position:absolute;box-sizing:border-box;left:0;top:0;width:8px;height:8px;border:2px solid currentColor;border-radius:50%}
.dcu-wb-project-body:has(>.dcu-wb-session)::after{content:"";display:block;height:4px;pointer-events:none}
.dcu-wb-section-body[data-open=true]:has(.dcu-wb-group-order-drop),.dcu-wb-section-body[data-open=true]:has(.dcu-wb-pin-end),.dcu-wb-section-body[data-open=true]:has(.dcu-wb-pin-start){overflow:visible}
.dcu-wb-collection-body{padding-left:0}
.dcu-wb-collection-body>.dcu-wb-group-member:first-child{padding-top:4px}
.dcu-wb-collection-body .dcu-wb-project-head{padding-left:8px}
.dcu-wb-collection-body>.dcu-wb-empty{padding:8px 8px 8px 26px}
.dcu-wb-collection-body>.dcu-wb-empty,.dcu-wb-nochat{font-size:13px;line-height:18px;color:var(--dcu-sidebar-tertiary)}
.dcu-wb-nochat{padding:1px 8px 5px 30px}
.dcu-wb-session-more{display:flex;gap:4px;padding:2px 8px 2px 30px}
.dcu-wb-session-more button{height:28px;border:0;border-radius:8px;padding:0 8px;background:transparent;color:var(--dcu-sidebar-tertiary);font:13px/20px var(--dsw-font-family);cursor:pointer}
.dcu-wb-session-more button:hover{color:var(--dcu-sidebar-secondary)}
.dcu-wb-collection:has(+.dcu-wb-collection)>.dcu-wb-collection-body>.dcu-wb-empty,.dcu-wb-collection:has(+.dcu-wb-ungrouped)>.dcu-wb-collection-body>.dcu-wb-empty{padding-top:14px;padding-bottom:2px}
.dcu-wb-collection-body::before,.dcu-wb-group-member::after{display:none}
.dcu-wb-collections{gap:12px}
.dcu-wb-collections:has(>.dcu-wb-project){gap:0}
.dcu-wb-collection-head{min-height:32px}
.dcu-wb-collection-head:hover{background:var(--dcu-sidebar-hover)}
.dcu-wb-collection-head.dcu-wb-group-drop{background:var(--dcu-sidebar-hover)}
.dcu-wb-collection-head{background:color-mix(in srgb,var(--dcu-sidebar-hover) 55%,transparent)}
.dcu-wb-collection-label{gap:4px;min-height:32px;font-size:14px;font-weight:600}
.dcu-wb-collection-label .dcu-wb-section-caret{width:14px;height:14px;opacity:1;color:var(--dcu-sidebar-primary)}
.dcu-wb-collection-label .dcu-wb-section-caret svg{width:14px;height:14px}
.dcu-wb-collection-label .dcu-wb-section-caret svg path{stroke-width:2}
.dcu-wb-collection-count{flex:none;font-size:12px;font-weight:400;padding-left:8px}
.dcu-wb-ungrouped .dcu-wb-collection-label{color:var(--dcu-sidebar-secondary)}
.dcu-wb-collection-head:focus-within,.dcu-wb-collection-head:has(.dcu-wb-more[aria-expanded=true]){background:var(--dcu-sidebar-hover)}
.dcu-wb-workspace-move-drop>.dcu-wb-collection-head{background:transparent}
.dcu-wb-collection-label:focus-visible,.dcu-wb-project-head:focus-visible,.dcu-wb-session:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px;border-radius:6px}
@media (pointer:coarse){.dcu-wb-collection-head,.dcu-wb-collection-label{min-height:36px}.dcu-wb-collection-actions{width:28px}.dcu-wb-collection-actions .dcu-wb-more{width:28px;height:28px}}
`;
		function storage$1() {
			return browserStorage();
		}
		function sameIds(left, right) {
			return left.length === right.length && left.every((id, index) => id === right[index]);
		}
		function optionalText(value, key) {
			if (!(key in value)) return void 0;
			const next = value[key];
			return typeof next === "string" && next !== "" ? next : void 0;
		}
		/** 插件自有的工作区树：复刻原生层级和拖拽行为，并在每个会话菜单中增加管理操作。 */
		const noSubscription = () => () => {};
		const noBindings = () => void 0;
		const emptyShortcutRows = [];
		const noShortcuts$1 = () => emptyShortcutRows;
		function CodexWorkspaceBrowser(props) {
			const snapshot = (0, react.useSyncExternalStore)(props.workspaceShortcuts?.subscribe ?? noSubscription, props.workspaceShortcuts?.getSnapshot ?? noBindings);
			const catalog = snapshot?.bindings?.hooks.shortcuts;
			const shortcuts = (0, react.useSyncExternalStore)(catalog?.subscribe ?? noSubscription, catalog?.getSnapshot ?? noShortcuts$1);
			const requestAddWorkspace = props.workspaceShortcuts ? snapshot?.bindings?.requestAddWorkspace : props.requestAddWorkspace;
			const addWorkspaceShortcutAria = shortcuts.find((row) => row.id === "workspace.add")?.aria ?? props.addWorkspaceShortcutAria;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(HoverShell, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexWorkspaceTree, {
				...props,
				requestAddWorkspace,
				addWorkspaceShortcutAria
			}) });
		}
		function CodexWorkspaceTree({ wide, searchSignal = 0, useSessions, useSessionPendingInteraction, useSessionStatus, useWorkspaces, t, archiveSession, deleteSession, deleteWorkspace, forkSession, insertSessionBefore, insertWorkspaceBefore, moveSession, openPath, openSession, renameSession, renameWorkspace, startSession, canDeleteSession, panelActive = false, requestAddWorkspace, addWorkspaceShortcutAria }) {
			const sessions = useSessions((state) => state);
			const now = useSharedNow();
			const pendingInteractions = useHostPendingInteractions(useSessionPendingInteraction, useSessionStatus);
			const sessionStatus = useHostSessionStatus(useSessionStatus);
			const selectedId = visibleSelectedSessionId(sessions, panelActive);
			const workspaces = useWorkspaces((state) => state);
			const baselinesReady = workspaceBaselinesReady(workspaces, sessions);
			const [expanded, setExpanded] = (0, react.useState)(() => readTreeExpansionState(storage$1(), WORKSPACE_EXPANSION_STORAGE_KEY));
			const [sessionWindows, setSessionWindows] = (0, react.useState)({});
			const [searchExpanded, setSearchExpanded] = (0, react.useState)(false);
			const [searchQuery, setSearchQuery] = (0, react.useState)("");
			const searchInputRef = (0, react.useRef)();
			const closeSearch = () => {
				setSearchExpanded(false);
				setSearchQuery("");
			};
			(0, react.useEffect)(() => {
				if (!searchExpanded) return;
				const input = searchInputRef.current;
				if (input !== void 0 && input !== null) {
					input.focus();
					input.select?.();
				}
			}, [searchExpanded]);
			(0, react.useEffect)(() => {
				if (searchSignal === 0) return;
				setSearchExpanded(true);
			}, [searchSignal]);
			const revealMoreSessions = (workspaceId) => {
				setSessionWindows((current) => ({
					...current,
					[workspaceId]: nextProjectSessionWindow(current[workspaceId])
				}));
			};
			const [pinnedWorkspaceIds, setPinnedWorkspaceIdsState] = (0, react.useState)(() => readPinnedWorkspaceIds(storage$1()));
			const initialWorkspaceGroups = (0, react.useMemo)(() => readWorkspaceGroupsCache(storage$1()), []);
			const [workspaceGroups, setWorkspaceGroupsState] = (0, react.useState)(() => initialWorkspaceGroups.workspaceGroups);
			const pinnedWorkspaceIdsRef = (0, react.useRef)(pinnedWorkspaceIds);
			pinnedWorkspaceIdsRef.current = pinnedWorkspaceIds;
			const workspaceGroupsRef = (0, react.useRef)(workspaceGroups);
			workspaceGroupsRef.current = workspaceGroups;
			const workspaceGroupsPendingHostSyncRef = (0, react.useRef)(initialWorkspaceGroups.pendingHostSync);
			const pinnedHostSupportsWorkspaceGroupsRef = (0, react.useRef)(false);
			const pinnedHostHydratedRef = (0, react.useRef)(false);
			const pinnedHostDirtyRef = (0, react.useRef)(false);
			const pinnedHostSkipWriteRef = (0, react.useRef)();
			const pinnedHostWriteRef = (0, react.useRef)(Promise.resolve());
			const [preferencesFailure, setPreferencesFailure] = (0, react.useState)();
			const workspaceBaselineRef = (0, react.useRef)({
				ready: false,
				validIds: []
			});
			workspaceBaselineRef.current = {
				ready: baselinesReady,
				validIds: workspaces.items.map((workspace) => String(workspace.workspaceId))
			};
			const queuePinnedHostWrite = (ids, groups) => {
				const snapshot = {
					pinnedWorkspaceIds: [...ids],
					workspaceGroups: groups.map((group) => ({
						...group,
						workspaceIds: [...group.workspaceIds]
					}))
				};
				const pending = pinnedHostWriteRef.current.then(async () => {
					await writeHostWorkspacePreferences(snapshot.pinnedWorkspaceIds, snapshot.workspaceGroups);
					setPreferencesFailure(void 0);
					if (!pinnedHostSupportsWorkspaceGroupsRef.current) return;
					if (!sameIds(pinnedWorkspaceIdsRef.current, snapshot.pinnedWorkspaceIds) || !sameWorkspaceGroups(workspaceGroupsRef.current, snapshot.workspaceGroups)) return;
					workspaceGroupsPendingHostSyncRef.current = false;
					saveWorkspaceGroupsCache(storage$1(), snapshot.workspaceGroups, false);
				});
				pinnedHostWriteRef.current = pending.catch((reason) => {
					setPreferencesFailure(reason);
				});
			};
			const setPinnedWorkspaceIds = (update) => {
				pinnedHostDirtyRef.current = true;
				const current = pinnedWorkspaceIdsRef.current;
				const next = typeof update === "function" ? update(current) : update;
				pinnedWorkspaceIdsRef.current = next;
				setPinnedWorkspaceIdsState(next);
			};
			const setWorkspaceGroups = (update) => {
				const current = workspaceGroupsRef.current;
				const next = typeof update === "function" ? update(current) : update;
				pinnedHostDirtyRef.current = true;
				workspaceGroupsPendingHostSyncRef.current = true;
				workspaceGroupsRef.current = next;
				setWorkspaceGroupsState(next);
			};
			const [unreadSessionIds, setUnreadSessionIds] = (0, react.useState)(() => readSessionIds(storage$1(), SESSION_UNREAD_STORAGE_KEY));
			const rowUnread = (id) => sessionRowUnread(unreadSessionIds.includes(id), sessionStatus.get(id), selectedId === id);
			const rowRunning = (id, session) => sessionIsRunning(session ?? sessions.byId[id], sessionStatus.get(id));
			const previousSessionRunningRef = (0, react.useRef)();
			const [menu, setMenu] = (0, react.useState)();
			const [renameTarget, setRenameTarget] = (0, react.useState)();
			const [deleteTarget, setDeleteTarget] = (0, react.useState)();
			const [archiveWorkspaceTarget, setArchiveWorkspaceTarget] = (0, react.useState)();
			const [sessionMoveTarget, setSessionMoveTarget] = (0, react.useState)();
			const { showTip: publishTip, hideTip, dismissTip, isShowing } = useHoverDispatch();
			const showTip = (tip, options) => {
				if (menu !== void 0) return;
				publishTip(tip, options);
			};
			const [renameDraft, setRenameDraft] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)();
			const busyRef = (0, react.useRef)();
			const [error, setError] = (0, react.useState)();
			const [workspaceDragId, setWorkspaceDragId] = (0, react.useState)();
			const [workspaceDropTarget, setWorkspaceDropTargetState] = (0, react.useState)();
			const [workspaceGroupDragId, setWorkspaceGroupDragId] = (0, react.useState)();
			const [workspaceGroupDropTarget, setWorkspaceGroupDropTargetState] = (0, react.useState)();
			const setWorkspaceGroupDropTarget = (target) => {
				setWorkspaceGroupDropTargetState((current) => {
					if (current === void 0 || target === void 0) return current === target ? current : target;
					return current.beforeId === target.beforeId ? current : target;
				});
			};
			const workspaceDropTargetRef = (0, react.useRef)();
			const setWorkspaceDropTarget = (target) => {
				if (sameWorkspaceDropTarget(workspaceDropTargetRef.current, target)) return;
				workspaceDropTargetRef.current = target;
				setWorkspaceDropTargetState(target);
			};
			const [headerMenu, setHeaderMenu] = (0, react.useState)();
			const headerMenuRef = (0, react.useRef)();
			headerMenuRef.current = headerMenu;
			const headerMenuPointerAt = (0, react.useRef)(0);
			const [sessionDrag, setSessionDrag] = (0, react.useState)();
			const [sessionDropTarget, setSessionDropTarget] = (0, react.useState)();
			const [createGroupOpen, setCreateGroupOpen] = (0, react.useState)(false);
			const [groupTitleDraft, setGroupTitleDraft] = (0, react.useState)("");
			const [deleteGroupId, setDeleteGroupId] = (0, react.useState)();
			const [groupMenuId, setGroupMenuId] = (0, react.useState)();
			const [renameGroupId, setRenameGroupId] = (0, react.useState)();
			const [renameGroupDraft, setRenameGroupDraft] = (0, react.useState)("");
			const [renameGroupError, setRenameGroupError] = (0, react.useState)();
			const groupActionTriggerRef = (0, react.useRef)();
			const projectsSectionButtonRef = (0, react.useRef)(null);
			const lastRevealedSessionIdRef = (0, react.useRef)();
			const pendingRevealScrollRef = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				writeTreeExpansionState(storage$1(), WORKSPACE_EXPANSION_STORAGE_KEY, expanded);
			}, [expanded]);
			(0, react.useEffect)(() => {
				savePinnedWorkspaceIds(storage$1(), pinnedWorkspaceIds);
				saveWorkspaceGroupsCache(storage$1(), workspaceGroups, workspaceGroupsPendingHostSyncRef.current);
				if (!pinnedHostHydratedRef.current) return;
				const skippedHydration = pinnedHostSkipWriteRef.current;
				pinnedHostSkipWriteRef.current = void 0;
				if (skippedHydration !== void 0 && sameIds(skippedHydration.pinnedWorkspaceIds, pinnedWorkspaceIds) && sameWorkspaceGroups(skippedHydration.workspaceGroups, workspaceGroups)) return;
				queuePinnedHostWrite(pinnedWorkspaceIds, workspaceGroups);
			}, [pinnedWorkspaceIds, workspaceGroups]);
			(0, react.useEffect)(() => {
				let alive = true;
				const local = {
					pinnedWorkspaceIds: [...pinnedWorkspaceIdsRef.current],
					workspaceGroups: workspaceGroupsRef.current
				};
				readHostPinnedWorkspaceIds().then((host) => {
					if (!alive) return;
					const dirty = pinnedHostDirtyRef.current ? {
						pinnedWorkspaceIds: pinnedWorkspaceIdsRef.current,
						workspaceGroups: workspaceGroupsRef.current
					} : void 0;
					const hydration = resolveWorkspacePreferencesHydration(local, host, dirty, workspaceGroupsPendingHostSyncRef.current);
					const baseline = workspaceBaselineRef.current;
					const ids = baseline.ready ? prunePinnedWorkspaceIds(hydration.pinnedWorkspaceIds, baseline.validIds) : hydration.pinnedWorkspaceIds;
					const groups = baseline.ready ? pruneWorkspaceGroups(hydration.workspaceGroups, baseline.validIds) : hydration.workspaceGroups;
					const writeHost = hydration.writeHost || !sameIds(ids, hydration.pinnedWorkspaceIds) || !sameWorkspaceGroups(groups, hydration.workspaceGroups);
					pinnedHostSupportsWorkspaceGroupsRef.current = host.workspaceGroupsSupported !== false;
					workspaceGroupsPendingHostSyncRef.current = workspaceGroupsPendingHostSyncRef.current || host.workspaceGroupsSupported === false && groups.length > 0 || !host.exists && local.workspaceGroups.length > 0;
					pinnedHostHydratedRef.current = true;
					if (!sameIds(pinnedWorkspaceIdsRef.current, ids) || !sameWorkspaceGroups(workspaceGroupsRef.current, groups)) {
						pinnedHostSkipWriteRef.current = {
							pinnedWorkspaceIds: [...ids],
							workspaceGroups: groups
						};
						pinnedWorkspaceIdsRef.current = ids;
						workspaceGroupsRef.current = groups;
						setPinnedWorkspaceIdsState(ids);
						setWorkspaceGroupsState(groups);
					}
					savePinnedWorkspaceIds(storage$1(), ids);
					if (writeHost) queuePinnedHostWrite(ids, groups);
				}).catch((reason) => {
					if (!alive) return;
					setPreferencesFailure(reason);
					pinnedHostHydratedRef.current = true;
				});
				return () => {
					alive = false;
				};
			}, []);
			(0, react.useEffect)(() => {
				writeSessionIds(storage$1(), SESSION_UNREAD_STORAGE_KEY, unreadSessionIds);
			}, [unreadSessionIds]);
			(0, react.useEffect)(() => {
				if (!baselinesReady) return;
				const validIds = workspaces.items.map((workspace) => String(workspace.workspaceId));
				const nextPinned = prunePinnedWorkspaceIds(pinnedWorkspaceIdsRef.current, validIds);
				const nextGroups = pruneWorkspaceGroups(workspaceGroupsRef.current, validIds);
				if (!sameIds(pinnedWorkspaceIdsRef.current, nextPinned)) {
					pinnedWorkspaceIdsRef.current = nextPinned;
					setPinnedWorkspaceIdsState(nextPinned);
				}
				if (!sameWorkspaceGroups(workspaceGroupsRef.current, nextGroups)) {
					workspaceGroupsRef.current = nextGroups;
					setWorkspaceGroupsState(nextGroups);
				}
			}, [baselinesReady, workspaces.items]);
			(0, react.useEffect)(() => {
				if (selectedId !== void 0) setUnreadSessionIds((ids) => ids.filter((id) => id !== selectedId));
			}, [selectedId]);
			(0, react.useEffect)(() => {
				const next = sessionRunningFlags(sessions.byId, sessionStatus);
				const previous = previousSessionRunningRef.current;
				previousSessionRunningRef.current = next;
				if (previous === void 0) return;
				const completed = completedBackgroundSessionIds(previous, next, selectedId);
				if (completed.length > 0) setUnreadSessionIds((ids) => [...completed, ...ids.filter((id) => !completed.includes(id))]);
			}, [
				selectedId,
				sessionStatus,
				sessions.byId
			]);
			const groups = (0, react.useMemo)(() => {
				const archived = workspaces.archivedSessionIds;
				const visible = (ids) => visibleSessionIds(ids, sessions.byId, archived);
				return { items: workspaces.items.map((workspace) => ({
					...workspace,
					visibleIds: visible(workspace.sessionIds)
				})) };
			}, [
				sessions.byId,
				sessions.ids,
				workspaces.archivedSessionIds,
				workspaces.items
			]);
						const searchNeedle = searchQuery.trim().toLocaleLowerCase();
			const searching = searchExpanded && searchNeedle !== "";
			const matchesNeedle = (value) => typeof value === "string" && value.toLocaleLowerCase().includes(searchNeedle);
			const searchedItems = (0, react.useMemo)(() => {
				if (!searching) return groups.items;
				return groups.items.map((workspace) => {
					const titleMatches = matchesNeedle(workspace.title);
					const visibleIds = titleMatches ? workspace.visibleIds : workspace.visibleIds.filter((id) => matchesNeedle(sessions.byId[id]?.displayTitle));
					return titleMatches || visibleIds.length > 0 ? {
						...workspace,
						visibleIds
					} : void 0;
				}).filter((workspace) => workspace !== void 0);
			}, [
				groups.items,
				searching,
				searchNeedle,
				sessions.byId
			]);
			const sourceWorkspaceIdForSession = (sessionId) => {
				if (sessionDrag?.sessionId === sessionId && sessionDrag.workspaceId !== "") return sessionDrag.workspaceId;
				const source = groups.items.find((workspace) => workspace.sessionIds.some((id) => String(id) === sessionId));
				return source === void 0 ? void 0 : String(source.workspaceId);
			};
			(0, react.useEffect)(() => {
				const onPointerDown = () => {
					if (headerMenuRef.current !== void 0) headerMenuPointerAt.current = performance.now();
				};
				window.addEventListener("pointerdown", onPointerDown, true);
				return () => {
					window.removeEventListener("pointerdown", onPointerDown, true);
				};
			}, []);
			(0, react.useEffect)(() => {
				const onProject = (event) => {
					const detail = event.detail;
					const current = selectedId;
					const workspace = groups.items.find((item) => current !== void 0 && item.visibleIds.includes(String(current)));
					if (workspace === void 0 || detail === void 0) return;
					if (detail.toggle === true && isShowing("workspace", workspace.workspaceId)) {
						dismissTip();
						return;
					}
					showTip({
						kind: "workspace",
						id: workspace.workspaceId,
						title: workspace.title,
						path: workspace.path,
						count: workspace.visibleIds.length,
						unreadCount: workspace.visibleIds.filter((id) => rowUnread(String(id))).length,
						pinned: pinnedWorkspaceIds.includes(String(workspace.workspaceId)),
						left: detail.left,
						top: detail.top
					}, { immediate: true });
				};
				const onMenu = (event) => {
					const detail = event.detail;
					const current = selectedId;
					if (current === void 0 || detail === void 0) return;
					dismissTip();
					if (performance.now() - headerMenuPointerAt.current < 500) {
						headerMenuPointerAt.current = 0;
						setHeaderMenu(void 0);
						return;
					}
					setHeaderMenu({
						id: current,
						getRect: detail.getRect
					});
				};
				window.addEventListener(HEADER_PROJECT_TIP_EVENT, onProject);
				window.addEventListener(HEADER_SESSION_MENU_EVENT, onMenu);
				return () => {
					window.removeEventListener(HEADER_PROJECT_TIP_EVENT, onProject);
					window.removeEventListener(HEADER_SESSION_MENU_EVENT, onMenu);
				};
			}, [
				groups.items,
				menu,
				pinnedWorkspaceIds,
				selectedId,
				unreadSessionIds
			]);
			const projectPinned = (id) => pinnedWorkspaceIds.includes(String(id));
			const pinnedGroups = searching ? [] : orderByIds(searchedItems, pinnedWorkspaceIds, (workspace) => String(workspace.workspaceId));
			const regularGroups = searching ? searchedItems : searchedItems.filter((workspace) => !projectPinned(workspace.workspaceId));
			const pinDragActive = workspaceDragId !== void 0;
			const pinnedGroupIds = pinnedGroups.map((workspace) => String(workspace.workspaceId));
			const regularGroupIds = regularGroups.map((workspace) => String(workspace.workspaceId));
			const groupedIds = new Set(groupedWorkspaceIds(workspaceGroups));
			const workspaceGroupIds = workspaceGroups.map((group) => group.id);
			const ungroupedGroups = regularGroups.filter((workspace) => !groupedIds.has(String(workspace.workspaceId)));
			const ungroupedGroupIds = ungroupedGroups.map((workspace) => String(workspace.workspaceId));
			const workspaceById = new Map(regularGroups.map((workspace) => [String(workspace.workspaceId), workspace]));
			const pinnedHeaderDrop = workspaceDropTarget?.zone === "pinned" && workspaceDropTarget.beforeId === pinnedGroupIds[0] ? pinnedHeaderDropIndicator(pinnedGroupIds) : void 0;
			const assignedIds = workspaces.items.flatMap((workspace) => workspace.sessionIds.map((id) => String(id)));
			const allRecentIds = ungroupedSessionIds(sessions.ids ?? Object.keys(sessions.byId), sessions.byId, assignedIds, workspaces.archivedSessionIds).sort((left, right) => (sessions.byId[right]?.updatedAt ?? 0) - (sessions.byId[left]?.updatedAt ?? 0));
			const recentIds = searching ? allRecentIds.filter((id) => matchesNeedle(sessions.byId[id]?.displayTitle)) : allRecentIds;
			const run = async (key, action) => {
				if (busyRef.current !== void 0) return;
				busyRef.current = key;
				setBusy(key);
				setError(void 0);
				try {
					await action();
					setMenu(void 0);
				} catch (reason) {
					setError(userErrorText(reason, t));
				} finally {
					busyRef.current = void 0;
					setBusy(void 0);
				}
			};
			const beginRename = (kind, id, title) => {
				setRenameTarget({
					kind,
					id,
					title
				});
				setRenameDraft(title);
				setMenu(void 0);
			};
			const submitRename = () => {
				if (renameTarget === void 0 || renameDraft.trim() === "") return;
				run("rename", async () => {
					if (renameTarget.kind === "workspace") await renameWorkspace(renameTarget.id, renameDraft.trim());
					else await renameSession(renameTarget.id, renameDraft.trim());
					setRenameTarget(void 0);
				});
			};
			const submitDelete = () => {
				if (deleteTarget === void 0) return;
				const target = deleteTarget;
				const operation = target.kind === "session" ? "delete-session" : "delete-workspace";
				run(operation, async () => {
					if (target.kind === "session") {
						await deleteSession(target.id);
						setUnreadSessionIds((ids) => ids.filter((id) => id !== target.id));
					} else {
						await deleteWorkspace(target.id);
						setPinnedWorkspaceIds((ids) => ids.filter((id) => id !== target.id));
					}
					setDeleteTarget(void 0);
				});
			};
			const submitArchiveWorkspace = () => {
				if (archiveWorkspaceTarget === void 0) return;
				const target = archiveWorkspaceTarget;
				run("archive-workspace", async () => {
					await archiveWorkspaceSessions(target.sessionIds, (sessionId) => archiveSession(sessionId));
					setUnreadSessionIds((ids) => ids.filter((id) => !target.sessionIds.includes(id)));
					setArchiveWorkspaceTarget(void 0);
				});
			};
			const copy = (value) => {
				if (value === void 0 || value === "") return;
				run("copy", async () => {
					await (0, _deepseek_ai_dsh_client_ui_primitives.writeClipboard)(value);
				});
			};
			const openPathImmediately = (path) => {
				setMenu(void 0);
				setHeaderMenu(void 0);
				run("open-path", () => openPath(path));
			};
			const toggleGroup = (key, defaultOpen = true) => {
				setExpanded((current) => ({
					...current,
					[key]: !(current[key] ?? defaultOpen)
				}));
			};
			const toggleProject = (expandKey, id) => {
				if (expanded[expandKey] ?? true) setSessionWindows((current) => ({
					...current,
					[id]: collapseProjectSessionWindow()
				}));
				toggleGroup(expandKey, true);
			};
			const submitCreateGroup = () => {
				if (groupTitleDraft.trim() === "") return;
				try {
					setWorkspaceGroups((current) => createWorkspaceGroup(current, {
						id: newWorkspaceGroupId(),
						title: groupTitleDraft
					}));
					setCreateGroupOpen(false);
					setGroupTitleDraft("");
				} catch (reason) {
					setError(userErrorText(reason, t));
				}
			};
			const closeRenameGroup = () => {
				setRenameGroupId(void 0);
				setRenameGroupDraft("");
				setRenameGroupError(void 0);
				const trigger = groupActionTriggerRef.current;
				const focusTarget = trigger?.isConnected ? trigger : projectsSectionButtonRef.current;
				groupActionTriggerRef.current = void 0;
				focusTarget?.focus();
			};
			const submitRenameGroup = () => {
				if (renameGroupId === void 0 || renameGroupDraft.trim() === "") return;
				if (workspaceGroupsRef.current.find((group) => group.id === renameGroupId)?.title === renameGroupDraft.trim()) {
					closeRenameGroup();
					return;
				}
				try {
					setWorkspaceGroups((current) => renameWorkspaceGroup(current, renameGroupId, renameGroupDraft));
					closeRenameGroup();
				} catch (reason) {
					setRenameGroupError(userErrorText(reason, t));
				}
			};
			const triggerAddWorkspace = () => {
				requestAddWorkspace?.();
			};
			const sectionOpen = (id) => expanded[`section:${id}`] ?? true;
			const toggleSection = (id) => {
				setExpanded((current) => ({
					...current,
					[`section:${id}`]: !(current[`section:${id}`] ?? true)
				}));
			};
			const workspaceGroupIdFor = (workspaceId) => workspaceGroups.find((group) => group.workspaceIds.includes(workspaceId))?.id;
			const moveWorkspaceToGroup = (workspaceId, groupId) => {
				setWorkspaceGroups((current) => assignWorkspaceToGroup(current, workspaceId, groupId));
				if (pinnedWorkspaceIdsRef.current.includes(workspaceId)) setPinnedWorkspaceIds((ids) => ids.filter((id) => id !== workspaceId));
			};
			const projectMenu = (workspace) => {
				const workspaceId = String(workspace.workspaceId);
				const moveTargets = workspaceGroupMoveTargets(workspaceGroups, workspaceId).map((target) => ({
					id: workspaceGroupMoveActionId(target.groupId),
					label: target.title ?? t("workspace.removeFromGroup"),
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconFolderCloseMedium, { size: 16 })
				}));
				return [
					{
						id: "pin",
						label: t(projectPinned(workspace.workspaceId) ? "workspace.unpin" : "workspace.pin"),
						icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PinIcon, {})
					},
					{
						id: "rename",
						label: t("workspace.rename"),
						icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconEditOutlineMedium, { size: 16 })
					},
					{
						type: "separator",
						id: "project-main-separator"
					},
					{
						id: "moveToGroup",
						label: t("workspace.moveToGroup"),
						icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconFolderCloseMedium, { size: 16 }),
						disabled: moveTargets.length === 0,
						submenu: moveTargets
					},
					{
						id: "openPath",
						label: t("workspace.openPath"),
						icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconFolderOpenOutlineMedium, { size: 16 })
					},
					{
						type: "separator",
						id: "project-archive-separator"
					},
					{
						id: "archiveWorkspace",
						label: t("workspace.archive"),
						icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconArchiveOutlineMedium, { size: 16 }),
						disabled: workspace.visibleIds.length === 0
					},
					{
						type: "separator",
						id: "project-delete-separator"
					},
					{
						id: "delete",
						label: t("workspace.delete"),
						icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconTrashOutlineMedium, { size: 16 }),
						danger: true
					}
				];
			};
			const handleProjectMenuAction = (workspace, id) => {
				if (busy !== void 0) return;
				const workspaceId = String(workspace.workspaceId);
				const targetGroup = workspaceGroups.find((group) => id === workspaceGroupMoveActionId(group.id));
				if (targetGroup !== void 0 || id === workspaceGroupMoveActionId()) {
					moveWorkspaceToGroup(workspaceId, targetGroup?.id);
					setMenu(void 0);
					return;
				}
				if (id === "rename") beginRename("workspace", workspace.workspaceId, workspace.title);
				if (id === "pin") {
					setPinnedWorkspaceIds((ids) => togglePinnedWorkspace(ids, workspace.workspaceId));
					setMenu(void 0);
				}
				if (id === "archiveWorkspace") {
					setArchiveWorkspaceTarget({
						id: workspaceId,
						title: workspace.title,
						sessionIds: [...workspace.visibleIds]
					});
					setError(void 0);
					setMenu(void 0);
				}
				if (id === "openPath") openPathImmediately(workspace.path);
				if (id === "delete") {
					setDeleteTarget({
						id: workspace.workspaceId,
						kind: "workspace",
						title: workspace.title
					});
					setError(void 0);
					setMenu(void 0);
				}
			};
			const canDelete = canDeleteSession?.() === true;
			const sessionMenu = (sessionId, path) => sessionMenuItems(t, {
				unread: rowUnread(sessionId),
				path,
				includePath: true,
				moveTargets: [],
				canDelete
			});
			const requestSessionMove = (sessionId, targetWorkspaceId) => {
				const targetWorkspace = groups.items.find((workspace) => String(workspace.workspaceId) === targetWorkspaceId);
				const session = sessions.byId[sessionId];
				if (targetWorkspace === void 0 || session === void 0) {
					setError(t("sessions.moveNotFound"));
					return;
				}
				setMenu(void 0);
				setHeaderMenu(void 0);
				setError(void 0);
				setSessionMoveTarget({
					sessionId,
					sessionTitle: session.displayTitle,
					targetWorkspaceId,
					targetWorkspaceTitle: targetWorkspace.title,
					targetPath: targetWorkspace.path
				});
			};
			const runSessionMoveAction = (action, sessionId) => {
				const targetWorkspaceId = parseMoveSessionActionId(action);
				if (targetWorkspaceId === void 0) return false;
				requestSessionMove(sessionId, targetWorkspaceId);
				return true;
			};
			const submitSessionMove = () => {
				const target = sessionMoveTarget;
				if (target === void 0) return;
				run("session-move", async () => {
					const nextExpanded = expandedForSessionMove(expanded, {
						workspaceId: target.targetWorkspaceId,
						pinned: projectPinned(target.targetWorkspaceId),
						groupId: workspaceGroupIdFor(target.targetWorkspaceId),
						hasGroups: workspaceGroups.length > 0
					});
					setExpanded(nextExpanded);
					writeTreeExpansionState(storage$1(), WORKSPACE_EXPANSION_STORAGE_KEY, nextExpanded);
					await moveSession(target.sessionId, target.targetWorkspaceId);
					setSessionMoveTarget(void 0);
				});
			};
			const pinWorkspaceAt = (id, beforeId) => {
				setPinnedWorkspaceIds((ids) => insertPinnedWorkspace(ids, id, beforeId));
			};
			const renderGroup = (workspace, zone) => {
				const expandKey = zone === "pinned" ? `pin:${workspace.workspaceId}` : String(workspace.workspaceId);
				const isExpanded = expanded[expandKey] ?? true;
				const currentSessionId = selectedId;
				const folder = projectFolderPresentation(isExpanded, workspace.visibleIds.some((id) => id === currentSessionId));
				const shownIds = workspace.visibleIds;
				const menuOpen = menu?.type === "workspace" && menu.id === workspace.workspaceId;
				const menuAt = menuOpen && menu.x !== void 0 && menu.y !== void 0 ? {
					x: menu.x,
					y: menu.y
				} : void 0;
				const isPinnedHeaderDrop = zone === "pinned" && pinnedHeaderDrop?.kind === "workspace" && pinnedHeaderDrop.workspaceId === String(workspace.workspaceId);
				const workspaceId = String(workspace.workspaceId);
				const sessionWindow = projectSessionWindow(shownIds, sessionWindows[workspaceId] ?? {
					expanded: false,
					page: 1
				}, currentSessionId !== void 0 && shownIds.includes(currentSessionId) ? currentSessionId : void 0);
				const renderedIds = sessionWindow.ids;
				const dropAfterSessionId = sessionDropTarget?.workspaceId === workspaceId && sessionDropTarget.ontoProject !== true ? sessionDropAfterRowId(sessionDropTarget, renderedIds) : void 0;
				const zoneIds = zone === "pinned" ? pinnedGroupIds : regularGroupIds;
				const dropsBefore = workspaceDropTarget?.zone === zone && workspaceDropTarget.beforeId === workspaceId;
				const dropsAfterLast = zone === "projects" && workspaceDropTarget?.zone === zone && workspaceDropTarget.beforeId === void 0 && zoneIds[zoneIds.length - 1] === workspaceId;
				const projectSessionDrop = sessionDropTarget?.workspaceId === workspaceId && sessionDropTarget.ontoProject === true;
				const projectSessionMoveDrop = projectSessionDrop && sessionDropTarget.crossWorkspace === true;
				const handleProjectDragOver = (event) => {
					const draggedWorkspace = readWorkspaceDrag(event.dataTransfer, workspaceDragId);
					if (draggedWorkspace !== void 0) {
						event.preventDefault();
						event.stopPropagation();
						event.dataTransfer.dropEffect = "move";
						const rect = event.currentTarget.getBoundingClientRect();
						const beforeId = reorderDropBeforeId(zoneIds, draggedWorkspace, workspaceId, event.clientY > rect.top + rect.height / 2);
						setSessionDropTarget(void 0);
						setWorkspaceDropTarget(beforeId === null ? void 0 : {
							zone,
							beforeId
						});
						return;
					}
					const draggedSessionId = readSessionDrag(event.dataTransfer, sessionDrag?.sessionId);
					if (draggedSessionId === void 0) return;
					event.preventDefault();
					event.stopPropagation();
					event.dataTransfer.dropEffect = "move";
					const action = sessionDropAction(sourceWorkspaceIdForSession(draggedSessionId), workspaceId);
					setWorkspaceDropTarget(void 0);
					setSessionDropTarget({
						workspaceId,
						beforeId: action === "reorder" ? shownIds[0] : void 0,
						ontoProject: true,
						crossWorkspace: action === "move"
					});
				};
				const handleProjectDrop = (event) => {
					const draggedWorkspace = readWorkspaceDrag(event.dataTransfer, workspaceDragId);
					if (draggedWorkspace !== void 0) {
						event.preventDefault();
						event.stopPropagation();
						const rect = event.currentTarget.getBoundingClientRect();
						const beforeId = reorderDropBeforeId(zoneIds, draggedWorkspace, workspaceId, event.clientY > rect.top + rect.height / 2);
						setWorkspaceDragId(void 0);
						setWorkspaceDropTarget(void 0);
						if (beforeId === null) return;
						if (zone === "pinned") {
							pinWorkspaceAt(draggedWorkspace, beforeId);
							return;
						}
						const hostIds = groups.items.map((item) => String(item.workspaceId));
						if (moveBefore(hostIds, draggedWorkspace, beforeId).some((id, index) => id !== hostIds[index])) run("workspace-order", () => insertWorkspaceBefore(draggedWorkspace, beforeId));
						return;
					}
					const draggedSessionId = readSessionDrag(event.dataTransfer, sessionDrag?.sessionId);
					if (draggedSessionId === void 0) return;
					event.preventDefault();
					event.stopPropagation();
					const action = sessionDropAction(sourceWorkspaceIdForSession(draggedSessionId), workspaceId);
					setSessionDrag(void 0);
					setSessionDropTarget(void 0);
					setWorkspaceDropTarget(void 0);
					if (action === "move") {
						requestSessionMove(draggedSessionId, workspaceId);
						return;
					}
					run("session-order", () => insertSessionBefore(workspace.workspaceId, draggedSessionId, shownIds[0]));
				};
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: `dcu-wb-project${isPinnedHeaderDrop || dropsBefore ? " dcu-wb-drop" : ""}${dropsAfterLast ? " dcu-wb-drop dcu-wb-drop-after" : ""}${projectSessionDrop ? " dcu-wb-session-drop" : ""}${projectSessionMoveDrop ? " dcu-wb-session-move-drop" : ""}`,
					onDragOver: handleProjectDragOver,
					onDragLeave: (event) => {
						if (event.currentTarget.contains(event.relatedTarget)) return;
						setWorkspaceDropTarget(void 0);
						setSessionDropTarget(void 0);
					},
					onDrop: handleProjectDrop,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: `dcu-wb-project-head${menuOpen ? " dcu-wb-menu-open" : ""}${workspaceDragId === workspaceId ? " dcu-wb-dragging" : ""}`,
						role: "treeitem",
						"aria-expanded": isExpanded,
						tabIndex: 0,
						draggable: true,
						onDragStart: (event) => {
							event.stopPropagation();
							setSessionDrag(void 0);
							setSessionDropTarget(void 0);
							setWorkspaceGroupDragId(void 0);
							setWorkspaceGroupDropTarget(void 0);
							writeWorkspaceDrag(event.dataTransfer, workspaceId, workspace.title);
							setDragPreview(event.dataTransfer, workspace.title, event.currentTarget.querySelector(".dcu-wb-folder"));
							setWorkspaceDragId(workspaceId);
						},
						onDragEnd: () => {
							setWorkspaceDragId(void 0);
							setWorkspaceDropTarget(void 0);
							setWorkspaceGroupDropTarget(void 0);
						},
						onClick: () => {
							toggleProject(expandKey, workspaceId);
						},
						onContextMenu: (event) => {
							event.preventDefault();
							event.stopPropagation();
							dismissTip();
							setMenu({
								id: workspace.workspaceId,
								type: "workspace",
								x: event.clientX,
								y: event.clientY
							});
						},
						onMouseEnter: (event) => {
							const box = hoverCardAnchor(event.currentTarget.getBoundingClientRect());
							showTip({
								kind: "workspace",
								id: workspace.workspaceId,
								title: workspace.title,
								path: workspace.path,
								count: workspace.visibleIds.length,
								unreadCount: workspace.visibleIds.filter((id) => rowUnread(String(id))).length,
								pinned: projectPinned(workspace.workspaceId),
								left: box.left,
								top: box.top
							});
						},
						onMouseLeave: hideTip,
						onKeyDown: (event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								toggleProject(expandKey, workspaceId);
							}
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: `dcu-wb-folder${folder.current ? " dcu-wb-folder-current" : ""}`,
								onClick: (event) => {
									event.stopPropagation();
									const box = hoverCardAnchor(event.currentTarget.getBoundingClientRect());
									if (isShowing("workspace", workspace.workspaceId)) {
										dismissTip();
										return;
									}
									showTip({
										kind: "workspace",
										id: workspace.workspaceId,
										title: workspace.title,
										path: workspace.path,
										count: workspace.visibleIds.length,
										unreadCount: workspace.visibleIds.filter((id) => rowUnread(String(id))).length,
										pinned: projectPinned(workspace.workspaceId),
										left: box.left,
										top: box.top
									}, { immediate: true });
								},
								children: folder.open ? folder.current ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconFolderOpenMedium, { size: 16 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconFolderOpenOutlineMedium, { size: 16 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconFolderCloseMedium, { size: 16 })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dcu-wb-project-title",
								children: workspace.title
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dcu-wb-actions",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
									open: menuOpen,
									onClose: () => {
										setMenu(void 0);
									},
									items: projectMenu(workspace),
									onSelect: (id) => {
										handleProjectMenuAction(workspace, id);
									},
									portal: true,
									dense: true,
									getAnchorRect: menuAt === void 0 ? void 0 : () => pointerMenuRect(menuAt.x, menuAt.y),
									anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "dcu-wb-more",
										"aria-label": t("workspace.actions", { name: workspace.title }),
										onClick: (event) => {
											event.stopPropagation();
											dismissTip();
											setMenu((current) => current?.id === workspace.workspaceId && current?.type === "workspace" ? void 0 : {
												id: workspace.workspaceId,
												type: "workspace"
											});
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconEllipsisOutlineMedium, { size: 16 })
									})
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dcu-wb-actions",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dcu-wb-more",
									"aria-label": t("workspace.newSession"),
									onClick: (event) => {
										event.stopPropagation();
										startSession(workspace.workspaceId);
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NewSessionIcon, {})
								})
							})
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(DisclosureBody, {
						className: "dcu-wb-project-body",
						open: isExpanded,
						children: [
							shownIds.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dcu-wb-nochat",
								children: t("workspace.noChat")
							}),
							renderedIds.map((id) => {
								const session = sessions.byId[id];
								if (session === void 0) return null;
								const pendingInteraction = pendingInteractionForSession(id, pendingInteractions, legacyPendingInteraction(session));
								const path = session.cwd ?? workspace.path;
								const selected = selectedId === id;
								const sessionMenuOpen = menu?.type === "session" && menu.id === id;
								const sessionMenuAt = sessionMenuOpen && menu.x !== void 0 && menu.y !== void 0 ? {
									x: menu.x,
									y: menu.y
								} : void 0;
								const dropsBeforeSession = sessionDropTarget?.workspaceId === workspaceId && sessionDropTarget.ontoProject !== true && sessionDropTarget.beforeId === id;
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									"data-dcu-session": id,
									className: `dcu-wb-session${selected ? " dcu-wb-selected" : ""}${sessionMenuOpen ? " dcu-wb-menu-open" : ""}${dropsBeforeSession ? " dcu-wb-drop" : ""}${dropAfterSessionId !== void 0 && id === dropAfterSessionId ? " dcu-wb-drop dcu-wb-drop-after" : ""}`,
									role: "treeitem",
									"aria-selected": selected,
									draggable: true,
									onDragStart: (event) => {
										event.stopPropagation();
										setWorkspaceDragId(void 0);
										setWorkspaceDropTarget(void 0);
										setWorkspaceGroupDragId(void 0);
										setWorkspaceGroupDropTarget(void 0);
										writeSessionDrag(event.dataTransfer, id, session.displayTitle);
										setDragPreview(event.dataTransfer, session.displayTitle);
										setSessionDrag({
											sessionId: id,
											workspaceId
										});
									},
									onDragEnd: () => {
										setSessionDrag(void 0);
										setSessionDropTarget(void 0);
										setWorkspaceGroupDropTarget(void 0);
									},
									onDragOver: (event) => {
										const drag = sessionDrag;
										if (drag === void 0 || drag.workspaceId !== workspaceId) return;
										event.preventDefault();
										event.stopPropagation();
										event.dataTransfer.dropEffect = "move";
										const rect = event.currentTarget.getBoundingClientRect();
										const beforeId = reorderDropBeforeId(shownIds, drag.sessionId, id, event.clientY > rect.top + rect.height / 2);
										setSessionDropTarget(beforeId === null ? void 0 : {
											workspaceId,
											beforeId,
											hoveredId: id
										});
									},
									onDragLeave: (event) => {
										if (event.currentTarget.contains(event.relatedTarget)) return;
										setSessionDropTarget(void 0);
									},
									onDrop: (event) => {
										const drag = sessionDrag;
										if (drag === void 0 || drag.workspaceId !== workspaceId) return;
										event.preventDefault();
										event.stopPropagation();
										const rect = event.currentTarget.getBoundingClientRect();
										setSessionDrag(void 0);
										setSessionDropTarget(void 0);
										const beforeId = reorderDropBeforeId(shownIds, drag.sessionId, id, event.clientY > rect.top + rect.height / 2);
										if (beforeId !== null) run("session-order", () => insertSessionBefore(workspace.workspaceId, drag.sessionId, beforeId));
									},
									onClick: () => {
										if (openSession(id) !== false) setUnreadSessionIds((ids) => ids.filter((item) => item !== id));
									},
									onContextMenu: (event) => {
										event.preventDefault();
										event.stopPropagation();
										dismissTip();
										setMenu({
											id,
											type: "session",
											x: event.clientX,
											y: event.clientY
										});
									},
									onMouseEnter: (event) => {
										const box = hoverCardAnchor(event.currentTarget.getBoundingClientRect());
										const branch = optionalText(session, "branch");
										showTip({
											kind: "session",
											id,
											title: session.displayTitle,
											project: workspace.title,
											path,
											branch,
											time: formatHoverTime(session.updatedAt, t, now),
											left: box.left,
											top: box.top
										});
									},
									onMouseLeave: hideTip,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionRowTitle, { title: session.displayTitle }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionState, {
											pendingInteraction,
											unread: rowUnread(id),
											running: rowRunning(id, session),
											t
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionTime, { time: formatCompactTime(session.updatedAt, t, now) }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dcu-wb-quick-actions",
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: "dcu-wb-more",
												"aria-label": t("sessions.archive"),
												onClick: (event) => {
													event.stopPropagation();
													run("archive", () => archiveSession(id));
												},
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuickArchiveIcon, {})
											})
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dcu-wb-actions",
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
												open: sessionMenuOpen,
												onClose: () => {
													setMenu(void 0);
												},
												items: sessionMenu(id, path),
												onSelect: (action) => {
													if (busy !== void 0 || runSessionMoveAction(action, id)) return;
													if (action === "rename") beginRename("session", id, session.displayTitle);
													if (action === "unread") {
														setUnreadSessionIds((ids) => toggleSessionId(ids, id));
														setMenu(void 0);
													}
													if (action === "archive") run("archive", () => archiveSession(id));
													if (action === "delete") {
														setDeleteTarget({
															id,
															kind: "session",
															title: session.displayTitle
														});
														setError(void 0);
														setMenu(void 0);
													}
													if (action === "fork") run("fork", () => forkSession(id));
													if (action === "openPath" && path !== void 0) openPathImmediately(path);
													if (action === "copyPath") copy(path);
													if (action === "copyTitle") copy(session.displayTitle);
													if (action === "copyId") copy(id);
												},
												portal: true,
												dense: true,
												getAnchorRect: sessionMenuAt === void 0 ? void 0 : () => pointerMenuRect(sessionMenuAt.x, sessionMenuAt.y),
												anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: "dcu-wb-more dcu-wb-context-anchor",
													"aria-label": t("sessions.actions", { name: session.displayTitle }),
													onClick: (event) => {
														event.stopPropagation();
														setMenu((current) => current?.id === id && current?.type === "session" ? void 0 : {
															id,
															type: "session"
														});
													},
													children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconEllipsisOutlineMedium, { size: 16 })
												})
											})
										})
									]
								}, id);
							}),
							sessionWindow.showMore && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dcu-wb-session-more",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: (event) => {
										event.stopPropagation();
										revealMoreSessions(workspaceId);
									},
									children: t("workspace.showMore")
								})
							})
						]
					})]
				}, workspace.workspaceId);
			};
			const renderWorkspaceCollection = (group) => {
				const groupId = group.id;
				const expandKey = `workspace-group:${group.id}`;
				const isExpanded = expanded[expandKey] ?? true;
				const members = group.workspaceIds.flatMap((id) => {
					const workspace = workspaceById.get(id);
					return workspace === void 0 ? [] : [workspace];
				});
				const memberIds = members.map((workspace) => String(workspace.workspaceId));
				const groupWorkspaceMoveDrop = workspaceDropTarget?.zone === "group" && workspaceDropTarget.groupId === group.id && workspaceDropTarget.crossGroup === true;
				const groupOrderDrop = workspaceGroupDropTarget?.beforeId === groupId;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: `dcu-wb-collection${groupOrderDrop ? " dcu-wb-group-order-drop" : ""}${groupWorkspaceMoveDrop ? " dcu-wb-workspace-move-drop" : ""}`,
					onDragOver: (event) => {
						const draggedGroupId = readWorkspaceGroupDrag(event.dataTransfer, workspaceGroupDragId);
						if (draggedGroupId !== void 0) {
							event.preventDefault();
							event.stopPropagation();
							event.dataTransfer.dropEffect = "move";
							setWorkspaceDropTarget(void 0);
							const rect = event.currentTarget.querySelector(":scope > .dcu-wb-collection-head")?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
							const beforeId = reorderDropBeforeId(workspaceGroupIds, draggedGroupId, groupId, event.clientY > rect.top + rect.height / 2);
							setWorkspaceGroupDropTarget(beforeId === null ? void 0 : { beforeId });
							return;
						}
						const dragged = readWorkspaceDrag(event.dataTransfer, workspaceDragId);
						if (dragged === void 0) return;
						event.preventDefault();
						event.stopPropagation();
						event.dataTransfer.dropEffect = "move";
						setWorkspaceGroupDropTarget(void 0);
						if (workspaceGroupIdFor(dragged) === groupId) {
							const lastId = memberIds[memberIds.length - 1];
							const beforeId = lastId === void 0 ? null : reorderDropBeforeId(memberIds, dragged, lastId, true);
							setWorkspaceDropTarget(beforeId === null ? void 0 : {
								zone: "group",
								groupId,
								beforeId
							});
							return;
						}
						setWorkspaceDropTarget({
							zone: "group",
							groupId,
							ontoGroup: true,
							crossGroup: true
						});
					},
					onDragLeave: (event) => {
						if (event.currentTarget.contains(event.relatedTarget)) return;
						setWorkspaceDropTarget(void 0);
						setWorkspaceGroupDropTarget(void 0);
					},
					onDrop: (event) => {
						const draggedGroupId = readWorkspaceGroupDrag(event.dataTransfer, workspaceGroupDragId);
						if (draggedGroupId !== void 0) {
							event.preventDefault();
							event.stopPropagation();
							const rect = event.currentTarget.querySelector(":scope > .dcu-wb-collection-head")?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
							const beforeId = reorderDropBeforeId(workspaceGroupIds, draggedGroupId, groupId, event.clientY > rect.top + rect.height / 2);
							setWorkspaceGroupDragId(void 0);
							setWorkspaceGroupDropTarget(void 0);
							if (beforeId !== null) setWorkspaceGroups((current) => moveWorkspaceGroup(current, draggedGroupId, beforeId));
							return;
						}
						const dragged = readWorkspaceDrag(event.dataTransfer, workspaceDragId);
						if (dragged === void 0) return;
						event.preventDefault();
						event.stopPropagation();
						setWorkspaceDragId(void 0);
						setWorkspaceDropTarget(void 0);
						setWorkspaceGroups((current) => current.find((candidate) => candidate.workspaceIds.includes(dragged))?.id === groupId ? moveWorkspaceGroupMember(current, dragged, groupId) : assignWorkspaceToGroup(current, dragged, groupId));
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: `dcu-wb-collection-head${workspaceGroupDragId === groupId ? " dcu-wb-dragging" : ""}`,
						draggable: true,
						onDragStart: (event) => {
							event.stopPropagation();
							setSessionDrag(void 0);
							setSessionDropTarget(void 0);
							setWorkspaceDragId(void 0);
							setWorkspaceDropTarget(void 0);
							setWorkspaceGroupDropTarget(void 0);
							writeWorkspaceGroupDrag(event.dataTransfer, groupId, group.title);
							setDragPreview(event.dataTransfer, group.title);
							setWorkspaceGroupDragId(groupId);
						},
						onDragEnd: () => {
							setWorkspaceGroupDragId(void 0);
							setWorkspaceGroupDropTarget(void 0);
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "dcu-wb-collection-label",
							"aria-expanded": isExpanded,
							onClick: () => {
								toggleGroup(expandKey, true);
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dcu-wb-section-caret",
									"aria-hidden": "true",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
										viewBox: "0 0 16 16",
										width: "12",
										height: "12",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
											d: "M6.25 4.25 10.25 8 6.25 11.75",
											fill: "none",
											stroke: "currentColor",
											strokeWidth: "1.5",
											strokeLinecap: "round",
											strokeLinejoin: "round"
										})
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dcu-wb-collection-title",
									children: group.title
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dcu-wb-collection-count",
									children: members.length
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dcu-wb-collection-actions",
							onClick: (event) => {
								event.stopPropagation();
							},
							onDragStart: (event) => {
								event.preventDefault();
								event.stopPropagation();
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
								open: groupMenuId === groupId,
								onClose: () => {
									setGroupMenuId(void 0);
								},
								items: [
									{
										id: "rename",
										label: t("workspace.renameGroup"),
										icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconEditOutlineMedium, { size: 16 })
									},
									{
										type: "separator",
										id: "group-delete-separator"
									},
									{
										id: "delete",
										label: t("workspace.deleteGroupAction"),
										icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconTrashOutlineMedium, { size: 16 }),
										danger: true
									}
								],
								onSelect: (action) => {
									setGroupMenuId(void 0);
									if (action === "rename") {
										setRenameGroupId(groupId);
										setRenameGroupDraft(group.title);
										setRenameGroupError(void 0);
									}
									if (action === "delete") setDeleteGroupId(groupId);
								},
								portal: true,
								dense: true,
								anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dcu-wb-more",
									draggable: false,
									"aria-haspopup": "menu",
									"aria-expanded": groupMenuId === groupId,
									"aria-label": t("workspace.groupActions", { name: group.title }),
									title: t("workspace.groupActions", { name: group.title }),
									onClick: (event) => {
										groupActionTriggerRef.current = event.currentTarget;
										setGroupMenuId((current) => current === groupId ? void 0 : groupId);
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconEllipsisOutlineMedium, { size: 16 })
								})
							})
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(DisclosureBody, {
						className: "dcu-wb-collection-body",
						open: isExpanded,
						children: [members.map((workspace) => {
							const workspaceId = String(workspace.workspaceId);
							const preciseTarget = workspaceDropTarget?.zone === "group" && workspaceDropTarget.groupId === groupId && workspaceDropTarget.ontoGroup !== true && workspaceDropTarget.crossGroup !== true;
							const orderDrop = preciseTarget && workspaceDropTarget.beforeId === workspaceId;
							const orderDropAfter = preciseTarget && workspaceDropTarget.beforeId === void 0 && memberIds[memberIds.length - 1] === workspaceId;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								"data-dcu-group-member": true,
								className: `dcu-wb-group-member${orderDrop ? " dcu-wb-drop" : ""}${orderDropAfter ? " dcu-wb-drop dcu-wb-drop-after" : ""}`,
								onDragOverCapture: (event) => {
									const dragged = readWorkspaceDrag(event.dataTransfer, workspaceDragId);
									if (dragged === void 0) return;
									event.preventDefault();
									event.stopPropagation();
									event.dataTransfer.dropEffect = "move";
									const rect = event.currentTarget.getBoundingClientRect();
									const beforeId = reorderDropBeforeId(memberIds, dragged, workspaceId, event.clientY > rect.top + rect.height / 2);
									setWorkspaceDropTarget(beforeId === null ? void 0 : {
										zone: "group",
										groupId,
										beforeId,
										crossGroup: workspaceGroupIdFor(dragged) !== groupId
									});
								},
								onDropCapture: (event) => {
									const dragged = readWorkspaceDrag(event.dataTransfer, workspaceDragId);
									if (dragged === void 0) return;
									event.preventDefault();
									event.stopPropagation();
									const rect = event.currentTarget.getBoundingClientRect();
									const beforeId = reorderDropBeforeId(memberIds, dragged, workspaceId, event.clientY > rect.top + rect.height / 2);
									setWorkspaceDragId(void 0);
									setWorkspaceDropTarget(void 0);
									if (beforeId === null) return;
									setWorkspaceGroups((current) => current.find((candidate) => candidate.workspaceIds.includes(dragged))?.id === groupId ? moveWorkspaceGroupMember(current, dragged, groupId, beforeId) : placeWorkspaceInGroup(current, dragged, groupId, beforeId));
								},
								children: renderGroup(workspace, "projects")
							}, workspaceId);
						}), members.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dcu-wb-empty",
							children: t("workspace.empty")
						})]
					})]
				}, group.id);
			};
			const renderUngroupedCollection = () => {
				const ungroupedExpandKey = "workspace-group:ungrouped";
				const ungroupedExpanded = expanded[ungroupedExpandKey] ?? true;
				const ungroupedWorkspaceMoveDrop = workspaceDropTarget?.zone === "ungrouped" && workspaceDropTarget.crossGroup === true;
				const groupOrderDrop = workspaceGroupDropTarget !== void 0 && workspaceGroupDropTarget.beforeId === void 0;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: `dcu-wb-ungrouped${groupOrderDrop ? " dcu-wb-group-order-drop" : ""}${ungroupedWorkspaceMoveDrop ? " dcu-wb-workspace-move-drop" : ""}`,
					onDragOver: (event) => {
						const draggedGroupId = readWorkspaceGroupDrag(event.dataTransfer, workspaceGroupDragId);
						if (draggedGroupId !== void 0) {
							event.preventDefault();
							event.stopPropagation();
							event.dataTransfer.dropEffect = "move";
							setWorkspaceDropTarget(void 0);
							const lastGroupId = workspaceGroupIds[workspaceGroupIds.length - 1];
							const beforeId = lastGroupId === void 0 ? null : reorderDropBeforeId(workspaceGroupIds, draggedGroupId, lastGroupId, true);
							setWorkspaceGroupDropTarget(beforeId === null ? void 0 : { beforeId: void 0 });
							return;
						}
						const dragged = readWorkspaceDrag(event.dataTransfer, workspaceDragId);
						if (dragged === void 0) return;
						event.preventDefault();
						event.stopPropagation();
						event.dataTransfer.dropEffect = "move";
						setWorkspaceGroupDropTarget(void 0);
						if (workspaceGroupIdFor(dragged) === void 0) {
							const lastId = ungroupedGroupIds[ungroupedGroupIds.length - 1];
							const beforeId = lastId === void 0 ? null : reorderDropBeforeId(ungroupedGroupIds, dragged, lastId, true);
							setWorkspaceDropTarget(beforeId === null ? void 0 : {
								zone: "ungrouped",
								beforeId
							});
							return;
						}
						setWorkspaceDropTarget({
							zone: "ungrouped",
							ontoSection: true,
							crossGroup: true
						});
					},
					onDragLeave: (event) => {
						if (event.currentTarget.contains(event.relatedTarget)) return;
						setWorkspaceDropTarget(void 0);
						setWorkspaceGroupDropTarget(void 0);
					},
					onDrop: (event) => {
						const draggedGroupId = readWorkspaceGroupDrag(event.dataTransfer, workspaceGroupDragId);
						if (draggedGroupId !== void 0) {
							event.preventDefault();
							event.stopPropagation();
							const lastGroupId = workspaceGroupIds[workspaceGroupIds.length - 1];
							const beforeId = lastGroupId === void 0 ? null : reorderDropBeforeId(workspaceGroupIds, draggedGroupId, lastGroupId, true);
							setWorkspaceGroupDragId(void 0);
							setWorkspaceGroupDropTarget(void 0);
							if (beforeId !== null) setWorkspaceGroups((current) => moveWorkspaceGroup(current, draggedGroupId));
							return;
						}
						const dragged = readWorkspaceDrag(event.dataTransfer, workspaceDragId);
						if (dragged === void 0) return;
						event.preventDefault();
						event.stopPropagation();
						setWorkspaceDragId(void 0);
						setWorkspaceDropTarget(void 0);
						setWorkspaceGroups((current) => assignWorkspaceToGroup(current, dragged));
						run("workspace-order", () => insertWorkspaceBefore(dragged));
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dcu-wb-collection-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "dcu-wb-collection-label",
							"aria-expanded": ungroupedExpanded,
							onClick: () => {
								toggleGroup(ungroupedExpandKey, true);
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dcu-wb-section-caret",
									"aria-hidden": "true",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
										viewBox: "0 0 16 16",
										width: "12",
										height: "12",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
											d: "M6.25 4.25 10.25 8 6.25 11.75",
											fill: "none",
											stroke: "currentColor",
											strokeWidth: "1.5",
											strokeLinecap: "round",
											strokeLinejoin: "round"
										})
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("workspace.ungrouped") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dcu-wb-collection-count",
									children: ungroupedGroups.length
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dcu-wb-collection-actions",
							"aria-hidden": "true"
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DisclosureBody, {
						className: "dcu-wb-collection-body",
						open: ungroupedExpanded,
						children: ungroupedGroups.map((workspace) => {
							const workspaceId = String(workspace.workspaceId);
							const preciseTarget = workspaceDropTarget?.zone === "ungrouped" && workspaceDropTarget.ontoSection !== true && workspaceDropTarget.crossGroup !== true;
							const orderDrop = preciseTarget && workspaceDropTarget.beforeId === workspaceId;
							const orderDropAfter = preciseTarget && workspaceDropTarget.beforeId === void 0 && ungroupedGroupIds[ungroupedGroupIds.length - 1] === workspaceId;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								"data-dcu-ungrouped-member": true,
								className: `dcu-wb-group-member dcu-wb-ungrouped-member${orderDrop ? " dcu-wb-drop" : ""}${orderDropAfter ? " dcu-wb-drop dcu-wb-drop-after" : ""}`,
								onDragOverCapture: (event) => {
									const dragged = readWorkspaceDrag(event.dataTransfer, workspaceDragId);
									if (dragged === void 0) return;
									event.preventDefault();
									event.stopPropagation();
									event.dataTransfer.dropEffect = "move";
									const rect = event.currentTarget.getBoundingClientRect();
									const beforeId = reorderDropBeforeId(ungroupedGroupIds, dragged, workspaceId, event.clientY > rect.top + rect.height / 2);
									setWorkspaceDropTarget(beforeId === null ? void 0 : {
										zone: "ungrouped",
										beforeId,
										crossGroup: workspaceGroupIdFor(dragged) !== void 0
									});
								},
								onDropCapture: (event) => {
									const dragged = readWorkspaceDrag(event.dataTransfer, workspaceDragId);
									if (dragged === void 0) return;
									event.preventDefault();
									event.stopPropagation();
									const rect = event.currentTarget.getBoundingClientRect();
									const beforeId = reorderDropBeforeId(ungroupedGroupIds, dragged, workspaceId, event.clientY > rect.top + rect.height / 2);
									setWorkspaceDragId(void 0);
									setWorkspaceDropTarget(void 0);
									if (beforeId === null) return;
									if (groupedIds.has(dragged)) setWorkspaceGroups((current) => assignWorkspaceToGroup(current, dragged));
									run("workspace-order", () => insertWorkspaceBefore(dragged, beforeId));
								},
								children: renderGroup(workspace, "projects")
							}, workspaceId);
						})
					})]
				});
			};
			const treeRef = (0, react.useRef)(null);
			useSectionDisclosureMotion(treeRef);
			const sorting = workspaceDragId !== void 0 || workspaceGroupDragId !== void 0 || sessionDrag !== void 0;
			(0, react.useLayoutEffect)(() => {
				if (!wide || !sorting || treeRef.current === null) return;
				return mountWorkspaceDropIndicator(treeRef.current);
			}, [wide, sorting]);
			(0, react.useEffect)(() => {
				const current = selectedId;
				if (current === void 0 || lastRevealedSessionIdRef.current === current) return;
				const tree = {
					workspaces: workspaces.items.map((item) => ({
						workspaceId: String(item.workspaceId),
						sessionIds: item.sessionIds.map((id) => String(id))
					})),
					pinnedWorkspaceIds,
					groups: workspaceGroups.map((group) => ({
						id: group.id,
						workspaceIds: group.workspaceIds
					})),
					recentIds
				};
				if (!(tree.workspaces.some((item) => item.sessionIds.includes(current)) || tree.recentIds.includes(current))) return;
				lastRevealedSessionIdRef.current = current;
				pendingRevealScrollRef.current = true;
				setExpanded((currentExpanded) => expandedForCurrentSession(currentExpanded, current, tree));
			}, [
				pinnedWorkspaceIds,
				recentIds,
				selectedId,
				workspaceGroups,
				workspaces.items
			]);
			(0, react.useLayoutEffect)(() => {
				if (!pendingRevealScrollRef.current) return;
				pendingRevealScrollRef.current = false;
				treeRef.current?.querySelector(".dcu-wb-session.dcu-wb-selected")?.scrollIntoView?.({ block: "nearest" });
			}, [expanded]);
			if (!wide) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dcu-wb dcu-wb-rail",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: stylesheet$4 })
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "dcu-wb",
				"aria-label": t("workspace.label"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("style", { children: [
						stylesheet$4,
						runningStyles,
						typographyStyles,
						collectionLayoutStyles
					] }),
					preferencesFailure !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dcu-wb-error",
						role: "status",
						children: [t("workspace.preferencesLocalOnly"), businessRequestErrorKey(preferencesFailure) !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [" ", userErrorText(preferencesFailure, t)] })]
					}),
					error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dcu-wb-error",
						role: "alert",
						children: t("sessions.failed", { message: error })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						ref: treeRef,
						className: "dcu-wb-tree",
						role: "tree",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: "dcu-wb-section",
								style: searching ? { display: "none" } : void 0,
								"aria-label": t("workspace.pinned"),
								onDragOver: (event) => {
									if (!pinDragActive) return;
									event.preventDefault();
									event.dataTransfer.dropEffect = "move";
									if (pinnedGroups.length === 0 || event.target === event.currentTarget || event.target instanceof Element && event.target.closest(".dcu-wb-section-head") !== null) {
										const firstId = pinnedGroupIds[0];
										const beforeId = firstId === void 0 ? void 0 : reorderDropBeforeId(pinnedGroupIds, workspaceDragId, firstId, false);
										setWorkspaceDropTarget(beforeId === null ? void 0 : {
											zone: "pinned",
											beforeId
										});
									}
								},
								onDrop: (event) => {
									event.preventDefault();
									const draggedWorkspace = readWorkspaceDrag(event.dataTransfer, workspaceDragId);
									const target = workspaceDropTargetRef.current;
									setWorkspaceDragId(void 0);
									setWorkspaceDropTarget(void 0);
									const drop = resolvePinnedSectionDrop(draggedWorkspace, target, pinnedGroups.length === 0);
									if (drop !== void 0) pinWorkspaceAt(drop.id, drop.beforeId);
								},
								onDragLeave: (event) => {
									if (!(event.relatedTarget instanceof Node) || event.currentTarget.contains(event.relatedTarget)) return;
									setWorkspaceDropTarget(void 0);
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "dcu-wb-section-head",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: "dcu-wb-section-label",
										"aria-expanded": sectionOpen("pinned"),
										onClick: () => {
											toggleSection("pinned");
										},
										children: [t("workspace.pinned"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dcu-wb-section-caret",
											"aria-hidden": "true",
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
												viewBox: "0 0 16 16",
												width: "12",
												height: "12",
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
													d: "M6.25 4.25 10.25 8 6.25 11.75",
													fill: "none",
													stroke: "currentColor",
													strokeWidth: "1.5",
													strokeLinecap: "round",
													strokeLinejoin: "round"
												})
											})
										})]
									})
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "dcu-wb-section-body",
									"data-open": sectionOpen("pinned"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dcu-wb-pinned-list",
										children: [
											pinDragActive && pinnedGroups.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: `dcu-wb-pin-start${pinnedHeaderDrop?.kind === "empty" ? " dcu-wb-drop" : ""}`,
												onDragOver: (event) => {
													event.preventDefault();
													event.stopPropagation();
													event.dataTransfer.dropEffect = "move";
													setWorkspaceDropTarget({
														zone: "pinned",
														beforeId: void 0
													});
												},
												onDrop: (event) => {
													event.preventDefault();
													event.stopPropagation();
													const draggedWorkspace = readWorkspaceDrag(event.dataTransfer, workspaceDragId);
													setWorkspaceDragId(void 0);
													setWorkspaceDropTarget(void 0);
													if (draggedWorkspace !== void 0) pinWorkspaceAt(draggedWorkspace);
												}
											}),
											pinnedGroups.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "dcu-wb-empty",
												onDragOver: (event) => {
													if (!pinDragActive) return;
													event.preventDefault();
													event.stopPropagation();
													event.dataTransfer.dropEffect = "move";
													setWorkspaceDropTarget({
														zone: "pinned",
														beforeId: void 0
													});
												},
												onDrop: (event) => {
													event.preventDefault();
													event.stopPropagation();
													const draggedWorkspace = readWorkspaceDrag(event.dataTransfer, workspaceDragId);
													setWorkspaceDragId(void 0);
													setWorkspaceDropTarget(void 0);
													if (draggedWorkspace !== void 0) pinWorkspaceAt(draggedWorkspace);
												},
												children: t("workspace.pinnedEmpty")
											}),
											pinnedGroups.map((workspace) => renderGroup(workspace, "pinned")),
											pinDragActive && pinnedGroups.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: `dcu-wb-pin-end${workspaceDropTarget?.zone === "pinned" && workspaceDropTarget.beforeId === void 0 ? " dcu-wb-drop" : ""}`,
												onDragOver: (event) => {
													if (!pinDragActive) return;
													event.preventDefault();
													event.stopPropagation();
													event.dataTransfer.dropEffect = "move";
													const lastId = pinnedGroupIds[pinnedGroupIds.length - 1];
													if (lastId === void 0 || workspaceDragId === void 0) return;
													const beforeId = reorderDropBeforeId(pinnedGroupIds, workspaceDragId, lastId, true);
													setWorkspaceDropTarget(beforeId === null ? void 0 : {
														zone: "pinned",
														beforeId
													});
												}
											})
										]
									})
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: "dcu-wb-section",
								"aria-label": t("workspace.projects"),
								onDropCapture: (event) => {
									const dragged = readWorkspaceDrag(event.dataTransfer, workspaceDragId);
									if (dragged !== void 0 && projectPinned(dragged)) setPinnedWorkspaceIds((ids) => ids.filter((id) => id !== dragged));
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: searchExpanded ? "dcu-wb-section-head dcu-wb-searching" : "dcu-wb-section-head",
									children: [
									searchExpanded && (0, react_jsx_runtime.jsxs)("span", {
										className: "dcu-wb-search",
										children: [(0, react_jsx_runtime.jsx)("input", {
											ref: searchInputRef,
											className: "dcu-wb-search-input",
											type: "search",
											value: searchQuery,
											placeholder: t("workspace.searchPlaceholder"),
											"aria-label": t("workspace.searchPlaceholder"),
											onChange: (event) => setSearchQuery(event.target.value),
											onKeyDown: (event) => {
												if (event.key === "Escape") {
													event.stopPropagation();
													closeSearch();
												}
											}
										}), (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "dcu-wb-more",
											"aria-label": t("workspace.searchClose"),
											title: t("workspace.searchClose"),
											onClick: (event) => {
												event.stopPropagation();
												closeSearch();
											},
											children: (0, react_jsx_runtime.jsx)("svg", {
												viewBox: "0 0 16 16",
												width: "12",
												height: "12",
												children: (0, react_jsx_runtime.jsx)("path", {
													d: "M4 4 12 12 M12 4 4 12",
													fill: "none",
													stroke: "currentColor",
													strokeWidth: "1.5",
													strokeLinecap: "round"
												})
											})
										})]
									}),/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: "dcu-wb-section-label",
										ref: projectsSectionButtonRef,
										"aria-expanded": sectionOpen("projects"),
										onClick: () => {
											toggleSection("projects");
										},
										children: [t("workspace.projects"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dcu-wb-section-caret",
											"aria-hidden": "true",
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
												viewBox: "0 0 16 16",
												width: "12",
												height: "12",
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
													d: "M6.25 4.25 10.25 8 6.25 11.75",
													fill: "none",
													stroke: "currentColor",
													strokeWidth: "1.5",
													strokeLinecap: "round",
													strokeLinejoin: "round"
												})
											})
										})]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "dcu-wb-actions",
										children: [
										(0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "dcu-wb-search-toggle",
											"aria-label": t("workspace.search"),
											title: t("workspace.search"),
											onClick: (event) => {
												event.stopPropagation();
												setSearchExpanded(true);
											},
											children: (0, react_jsx_runtime.jsx)("svg", {
												viewBox: "0 0 16 16",
												width: "14",
												height: "14",
												children: [(0, react_jsx_runtime.jsx)("circle", {
													cx: "7",
													cy: "7",
													r: "4.25",
													fill: "none",
													stroke: "currentColor",
													strokeWidth: "1.5"
												}), (0, react_jsx_runtime.jsx)("path", {
													d: "M10.25 10.25 13.5 13.5",
													fill: "none",
													stroke: "currentColor",
													strokeWidth: "1.5",
													strokeLinecap: "round"
												})]
											})
										}),/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "dcu-wb-more",
											"aria-label": t("workspace.createGroup"),
											title: t("workspace.createGroup"),
											onClick: (event) => {
												event.stopPropagation();
												setGroupTitleDraft("");
												setError(void 0);
												setCreateGroupOpen(true);
											},
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CreateGroupIcon, {})
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "dcu-wb-more",
											"aria-label": t("workspace.add"),
											title: t("workspace.add"),
											"aria-keyshortcuts": addWorkspaceShortcutAria,
											disabled: requestAddWorkspace === void 0,
											onClick: (event) => {
												event.stopPropagation();
												triggerAddWorkspace();
											},
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AddWorkspaceIcon, {})
										})]
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "dcu-wb-section-body",
									"data-open": sectionOpen("projects"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dcu-wb-collections",
										children: [
											(searching ? workspaceGroups.filter((group) => group.workspaceIds.some((id) => workspaceById.has(String(id)))) : workspaceGroups).map(renderWorkspaceCollection),
											(!searching || ungroupedGroups.length > 0) && workspaceGroups.length > 0 && renderUngroupedCollection(),
											workspaceGroups.length === 0 && ungroupedGroups.map((workspace) => renderGroup(workspace, "projects")),
											(searching ? regularGroups.length === 0 && recentIds.length === 0 : workspaceGroups.length === 0 && ungroupedGroups.length === 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "dcu-wb-empty",
												children: searching ? t("workspace.searchEmpty") : t("workspace.empty")
											})
										]
									})
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: "dcu-wb-section",
								style: searching && recentIds.length === 0 ? { display: "none" } : void 0,
								"aria-label": t("workspace.recent"),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "dcu-wb-section-head",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: "dcu-wb-section-label",
										"aria-expanded": sectionOpen("recent"),
										onClick: () => {
											toggleSection("recent");
										},
										children: [t("workspace.recent"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dcu-wb-section-caret",
											"aria-hidden": "true",
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
												viewBox: "0 0 16 16",
												width: "12",
												height: "12",
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
													d: "M6.25 4.25 10.25 8 6.25 11.75",
													fill: "none",
													stroke: "currentColor",
													strokeWidth: "1.5",
													strokeLinecap: "round",
													strokeLinejoin: "round"
												})
											})
										})]
									})
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "dcu-wb-section-body",
									"data-open": sectionOpen("recent"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [recentIds.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "dcu-wb-empty",
										children: t("workspace.recentEmpty")
									}), recentIds.map((id) => {
										const session = sessions.byId[id];
										if (session === void 0) return null;
										const title = session.displayTitle;
										const unread = rowUnread(id);
										const pendingInteraction = pendingInteractionForSession(id, pendingInteractions, legacyPendingInteraction(session));
										return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionRow, {
											id,
											title,
											selected: selectedId === id,
											menuOpen: menu?.type === "session" && menu.id === id,
											unread,
											running: rowRunning(id, session),
											pendingInteraction,
											time: formatCompactTime(session.updatedAt, t, now),
											t,
											menuItems: sessionMenu(id, session.cwd),
											draggable: true,
											onDragStart: (event) => {
												event.stopPropagation();
												setWorkspaceDragId(void 0);
												setWorkspaceDropTarget(void 0);
												setWorkspaceGroupDragId(void 0);
												setWorkspaceGroupDropTarget(void 0);
												writeSessionDrag(event.dataTransfer, id, title);
												setDragPreview(event.dataTransfer, title);
												setSessionDrag({
													sessionId: id,
													workspaceId: ""
												});
											},
											onDragEnd: () => {
												setSessionDrag(void 0);
												setSessionDropTarget(void 0);
												setWorkspaceDropTarget(void 0);
												setWorkspaceGroupDropTarget(void 0);
											},
											menuPoint: menu?.type === "session" && menu.id === id && menu.x !== void 0 && menu.y !== void 0 ? {
												x: menu.x,
												y: menu.y
											} : void 0,
											onOpen: () => {
												if (openSession(id) !== false) setUnreadSessionIds((ids) => ids.filter((item) => item !== id));
											},
											onMenuChange: (open) => {
												setMenu(open ? {
													id,
													type: "session"
												} : void 0);
											},
											onArchive: () => {
												run("archive", () => archiveSession(id));
											},
											onHover: (event) => {
												const box = hoverCardAnchor(event.currentTarget.getBoundingClientRect());
												showTip({
													kind: "session",
													id,
													title,
													time: formatHoverTime(session.updatedAt, t, now),
													left: box.left,
													top: box.top
												});
											},
											onLeave: hideTip,
											onContextMenu: (event) => {
												event.preventDefault();
												event.stopPropagation();
												dismissTip();
												setMenu({
													id,
													type: "session",
													x: event.clientX,
													y: event.clientY
												});
											},
											onSelectAction: (action) => {
												if (busy !== void 0 || runSessionMoveAction(action, id)) return;
												if (action === "rename") beginRename("session", id, title);
												if (action === "unread") {
													setUnreadSessionIds((ids) => toggleSessionId(ids, id));
													setMenu(void 0);
												}
												if (action === "archive") run("archive", () => archiveSession(id));
												if (action === "delete") {
													setDeleteTarget({
														id,
														kind: "session",
														title
													});
													setError(void 0);
													setMenu(void 0);
												}
												if (action === "fork") run("fork", () => forkSession(id));
												if (action === "openPath" && session.cwd !== void 0) openPathImmediately(session.cwd);
												if (action === "copyPath") copy(session.cwd);
												if (action === "copyTitle") copy(title);
												if (action === "copyId") copy(id);
											}
										}, id);
									})] })
								})]
							})
						]
					}),
					headerMenu !== void 0 && sessions.byId[headerMenu.id] !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
						open: true,
						onClose: () => {
							setHeaderMenu(void 0);
						},
						items: sessionMenu(headerMenu.id, sessions.byId[headerMenu.id].cwd ?? groups.items.find((item) => item.visibleIds.includes(headerMenu.id))?.path),
						onSelect: (action) => {
							const id = headerMenu.id;
							const session = sessions.byId[id];
							if (session === void 0 || busy !== void 0 || runSessionMoveAction(action, id)) return;
							const path = session.cwd ?? groups.items.find((item) => item.visibleIds.includes(id))?.path;
							if (action === "rename") beginRename("session", id, session.displayTitle);
							if (action === "unread") setUnreadSessionIds((ids) => toggleSessionId(ids, id));
							if (action === "archive") run("archive", () => archiveSession(id));
							if (action === "delete") {
								setDeleteTarget({
									id,
									kind: "session",
									title: session.displayTitle
								});
								setError(void 0);
							}
							if (action === "fork") run("fork", () => forkSession(id));
							if (action === "openPath" && path !== void 0) openPathImmediately(path);
							if (action === "copyPath") copy(path);
							if (action === "copyTitle") copy(session.displayTitle);
							if (action === "copyId") copy(id);
							setHeaderMenu(void 0);
						},
						portal: true,
						dense: true,
						side: "bottom",
						align: "start",
						getAnchorRect: () => headerMenu.getRect(),
						anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceHoverCard, {
						t,
						onEditWorkspace: (id, title) => {
							beginRename("workspace", id, title);
						},
						onToggleWorkspacePin: (id) => {
							setPinnedWorkspaceIds((ids) => togglePinnedWorkspace(ids, id));
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: renameGroupId !== void 0,
						onClose: closeRenameGroup,
						closeLabel: t("sessions.close"),
						title: t("workspace.renameGroup"),
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dcu-wb-rename-actions",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								onClick: closeRenameGroup,
								children: t("sessions.cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "primary",
								disabled: renameGroupDraft.trim() === "",
								onClick: submitRenameGroup,
								children: t("sessions.save")
							})]
						}),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								htmlFor: "dcu-workspace-group-name",
								children: t("workspace.groupName")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								id: "dcu-workspace-group-name",
								className: "dcu-wb-rename-input",
								"aria-label": t("workspace.groupName"),
								maxLength: 80,
								value: renameGroupDraft,
								autoFocus: true,
								onFocus: (event) => {
									event.target.select();
								},
								onChange: (event) => {
									setRenameGroupDraft(event.target.value);
									setRenameGroupError(void 0);
								},
								onKeyDown: (event) => {
									if (event.key === "Enter" && !event.nativeEvent.isComposing && event.keyCode !== 229) {
										event.preventDefault();
										submitRenameGroup();
									}
								}
							}),
							renameGroupError !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dcu-wb-error",
								role: "alert",
								children: t("sessions.failed", { message: renameGroupError })
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: createGroupOpen,
						onClose: () => {
							setCreateGroupOpen(false);
							setGroupTitleDraft("");
							setError(void 0);
						},
						closeLabel: t("sessions.close"),
						title: t("workspace.createGroup"),
						description: t("workspace.createGroupDescription"),
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dcu-wb-rename-actions",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								onClick: () => {
									setCreateGroupOpen(false);
									setGroupTitleDraft("");
									setError(void 0);
								},
								children: t("sessions.cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "primary",
								disabled: groupTitleDraft.trim() === "",
								onClick: submitCreateGroup,
								children: t("sessions.save")
							})]
						}),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: "dcu-wb-rename-input",
							"aria-label": t("workspace.groupName"),
							value: groupTitleDraft,
							autoFocus: true,
							onChange: (event) => {
								setGroupTitleDraft(event.target.value);
								setError(void 0);
							},
							onKeyDown: (event) => {
								if (event.key === "Enter" && !event.nativeEvent.isComposing && event.keyCode !== 229) {
									event.preventDefault();
									submitCreateGroup();
								}
							}
						}), error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dcu-wb-error",
							role: "alert",
							children: t("sessions.failed", { message: error })
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: deleteGroupId !== void 0,
						onClose: () => {
							setDeleteGroupId(void 0);
						},
						closeLabel: t("sessions.close"),
						title: t("workspace.deleteGroup", { name: workspaceGroups.find((group) => group.id === deleteGroupId)?.title ?? "" }),
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dcu-wb-rename-actions",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								onClick: () => {
									setDeleteGroupId(void 0);
								},
								children: t("sessions.cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								className: "dcu-wb-delete-button",
								onClick: () => {
									if (deleteGroupId !== void 0) setWorkspaceGroups((current) => deleteWorkspaceGroup(current, deleteGroupId));
									setDeleteGroupId(void 0);
								},
								children: t("workspace.deleteGroupAction")
							})]
						}),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dcu-wb-delete-copy",
							children: t("workspace.deleteGroupDescription")
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: renameTarget !== void 0,
						onClose: () => {
							setRenameTarget(void 0);
							setError(void 0);
						},
						closeLabel: t("sessions.close"),
						title: renameTarget?.kind === "workspace" ? t("workspace.rename") : t("sessions.rename"),
						description: t("sessions.renameDescription"),
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dcu-wb-rename-actions",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								onClick: () => {
									setRenameTarget(void 0);
								},
								children: t("sessions.cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "primary",
								disabled: busy !== void 0 || renameDraft.trim() === "",
								onClick: submitRename,
								children: t("sessions.save")
							})]
						}),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: "dcu-wb-rename-input",
							"aria-label": renameTarget?.kind === "workspace" ? t("workspace.rename") : t("sessions.rename"),
							value: renameDraft,
							autoFocus: true,
							onFocus: (event) => {
								event.target.select();
							},
							onChange: (event) => {
								setRenameDraft(event.target.value);
								setError(void 0);
							},
							onKeyDown: (event) => {
								if (event.key === "Enter") submitRename();
							}
						}), error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dcu-wb-error",
							role: "alert",
							children: t("sessions.failed", { message: error })
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: archiveWorkspaceTarget !== void 0,
						onClose: () => {
							if (busy !== "archive-workspace") {
								setArchiveWorkspaceTarget(void 0);
								setError(void 0);
							}
						},
						closeLabel: t("sessions.close"),
						title: t("workspace.archiveTitle", { count: archiveWorkspaceTarget?.sessionIds.length ?? 0 }),
						description: archiveWorkspaceTarget === void 0 ? void 0 : t("workspace.archiveDescription", { name: archiveWorkspaceTarget.title }),
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dcu-wb-rename-actions",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								disabled: busy === "archive-workspace",
								onClick: () => {
									setArchiveWorkspaceTarget(void 0);
									setError(void 0);
								},
								children: t("sessions.cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "primary",
								disabled: busy === "archive-workspace",
								onClick: submitArchiveWorkspace,
								children: t("workspace.archiveConfirm")
							})]
						}),
						children: [busy === "archive-workspace" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dcu-wb-error",
							role: "status",
							children: t("workspace.archivePending")
						}), error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dcu-wb-error",
							role: "alert",
							children: t("sessions.failed", { message: error })
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: sessionMoveTarget !== void 0,
						onClose: () => {
							if (busy !== "session-move") {
								setSessionMoveTarget(void 0);
								setError(void 0);
							}
						},
						closeLabel: t("sessions.close"),
						title: t("sessions.moveConfirmTitle", { project: sessionMoveTarget?.targetWorkspaceTitle ?? "" }),
						description: sessionMoveTarget === void 0 ? void 0 : t("sessions.moveConfirmDescription", { name: sessionMoveTarget.sessionTitle }),
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dcu-wb-rename-actions",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								disabled: busy === "session-move",
								onClick: () => {
									setSessionMoveTarget(void 0);
									setError(void 0);
								},
								children: t("sessions.cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "primary",
								disabled: busy === "session-move",
								onClick: submitSessionMove,
								children: t("sessions.moveConfirmAction")
							})]
						}),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dcu-wb-move-target",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconFolderCloseMedium, { size: 16 }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dcu-wb-move-target-copy",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "dcu-wb-move-project",
										children: sessionMoveTarget?.targetWorkspaceTitle
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "dcu-wb-move-path",
										children: sessionMoveTarget?.targetPath
									})]
								})]
							}),
							busy === "session-move" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dcu-wb-error",
								role: "status",
								children: t("sessions.movePending")
							}),
							error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dcu-wb-error",
								role: "alert",
								children: t("sessions.failed", { message: error })
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: deleteTarget !== void 0,
						onClose: () => {
							if (busy !== "delete-workspace" && busy !== "delete-session") {
								setDeleteTarget(void 0);
								setError(void 0);
							}
						},
						closeLabel: t("sessions.close"),
						title: deleteTarget?.kind === "session" ? t("sessions.delete") : t("workspace.delete"),
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dcu-wb-rename-actions",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								disabled: busy === "delete-workspace" || busy === "delete-session",
								onClick: () => {
									setDeleteTarget(void 0);
									setError(void 0);
								},
								children: t("sessions.cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								className: "dcu-wb-delete-button",
								disabled: busy === "delete-workspace" || busy === "delete-session",
								onClick: submitDelete,
								children: deleteTarget?.kind === "session" ? t("sessions.delete") : t("workspace.delete")
							})]
						}),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "dcu-wb-delete-copy",
								children: deleteTarget === void 0 ? "" : deleteTarget.kind === "session" ? t("sessions.deleteDescription", { name: deleteTarget.title }) : t("workspace.deleteDescription", { name: deleteTarget.title })
							}),
							busy === "delete-workspace" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dcu-wb-error",
								role: "status",
								children: t("workspace.deletePending")
							}),
							busy === "delete-session" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dcu-wb-error",
								role: "status",
								children: t("sessions.deletePending")
							}),
							error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dcu-wb-error",
								role: "alert",
								children: t("sessions.failed", { message: error })
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/WorkspaceShortcutBridge.tsx
		function WorkspaceShortcutBridge({ source, openSearch, startSession, renderDirectoryFlow, t }) {
			const { searchRequest, addRequested, bindings } = (0, react.useSyncExternalStore)(source.subscribe, source.getSnapshot, source.getSnapshot);
			const seenSearch = (0, react.useRef)(searchRequest);
			const openSearchRef = (0, react.useRef)(openSearch);
			openSearchRef.current = openSearch;
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			const mounted = (0, react.useRef)(true);
			const pending = (0, react.useRef)(false);
			const pickedPath = (0, react.useRef)(void 0);
			const currentBindings = (0, react.useRef)(bindings);
			currentBindings.current = bindings;
			(0, react.useEffect)(() => {
				mounted.current = true;
				return () => {
					mounted.current = false;
				};
			}, []);
			(0, react.useEffect)(() => {
				pending.current = false;
				pickedPath.current = void 0;
				setBusy(false);
				setError(void 0);
			}, [bindings]);
			(0, react.useEffect)(() => {
				if (searchRequest === seenSearch.current) return;
				seenSearch.current = searchRequest;
				bindings?.closeAddWorkspace();
				openSearchRef.current();
			}, [searchRequest, bindings]);
			(0, react.useEffect)(() => {
				bindings?.setDirectoryBusy(addRequested || busy || error !== void 0);
				return () => {
					bindings?.setDirectoryBusy(false);
				};
			}, [
				bindings,
				addRequested,
				busy,
				error
			]);
			const fail = (message) => {
				bindings?.closeAddWorkspace();
				setError(message);
			};
			const isCurrent = () => mounted.current && source.getSnapshot().bindings === bindings && currentBindings.current === bindings;
			const pick = (path) => {
				if (!bindings || pending.current) return;
				pickedPath.current = path;
				pending.current = true;
				setError(void 0);
				setBusy(true);
				bindings.createWorkspace({ path }).then((workspace) => {
					if (!isCurrent()) return;
					bindings.closeAddWorkspace();
					startSession(workspace.workspaceId);
				}).catch((reason) => {
					if (isCurrent()) fail(reason instanceof Error ? reason.message : String(reason));
				}).finally(() => {
					if (isCurrent()) {
						pending.current = false;
						setBusy(false);
					}
				});
			};
			const chooseAgain = () => {
				setError(void 0);
				pickedPath.current = void 0;
				bindings?.setDirectoryBusy(false);
				bindings?.requestAddWorkspace?.();
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [renderDirectoryFlow({
				open: addRequested,
				busy,
				onCancel: () => {
					bindings?.closeAddWorkspace();
				},
				onError: (message) => {
					pickedPath.current = void 0;
					fail(message);
				},
				onPicked: pick
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: error !== void 0,
				onClose: () => {
					setError(void 0);
				},
				title: t("workspace.addFailed"),
				closeLabel: t("sessions.close"),
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					pickedPath.current !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						disabled: busy,
						onClick: () => {
							pick(pickedPath.current);
						},
						children: t("workspace.retry")
					}),
					bindings?.requestAddWorkspace && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						disabled: busy,
						onClick: chooseAgain,
						children: t("workspace.chooseAgain")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						onClick: () => {
							setError(void 0);
						},
						children: t("sessions.close")
					})
				] }),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					role: "alert",
					children: error
				})
			})] });
		}
		//#endregion
		//#region src/client/locales.ts
		/** 本插件独占的界面文案命名空间。 */
		const NS = "michengai.codexUi";
		const zh = {
			"workspace.addFailed": "无法添加工作区",
			"workspace.add": "添加工作区",
			"workspace.retry": "重试",
			"workspace.chooseAgain": "重新选择",
			"navigation.back": "后退",
			"navigation.forward": "前进",
			"home.resizeInput": "拖动调整输入区宽度",
			"home.projectSearch": "搜索项目",
			"home.projectEmpty": "没有匹配的项目",
			"home.suggestions": "开始一项任务",
			"home.workspace": "请先选择工作区，再选择任务。",
			"home.draft": "已保留当前草稿和附件；清空输入后可填入任务建议。",
			"home.busy": "当前输入正在处理中，请稍后再试。",
			"home.explore": "探索并理解代码",
			"home.build": "构建新功能、应用或工具",
			"home.review": "审查代码并提出修改建议",
			"home.fix": "修复问题和失败",
			"home.explore.task1": "了解项目结构",
			"home.explore.prompt1": "请探索当前工作区的代码，解释项目结构、主要入口和模块之间的关系。",
			"home.explore.task2": "理解一项功能",
			"home.explore.prompt2": "我想了解一项功能的实现。先问我具体是哪项功能，再沿调用关系解释。",
			"home.build.task1": "实现一项新功能",
			"home.build.prompt1": "我想在当前项目中实现一项新功能。先和我确认需求与验收标准，再实施。",
			"home.build.task2": "构建一个小工具",
			"home.build.prompt2": "我想构建一个小工具。先问我目标、输入和输出，再结合当前项目提出方案。",
			"home.review.task1": "评审当前改动",
			"home.review.prompt1": "请评审当前工作区的未提交改动，优先指出真实缺陷、回归风险和缺少的测试；先不要修改。",
			"home.review.task2": "检查代码质量",
			"home.review.prompt2": "请检查当前项目的代码质量，给出有源码依据的改进建议，先评估不改动。",
			"home.fix.task1": "排查一个问题",
			"home.fix.prompt1": "我遇到了一个问题。先问我复现步骤、预期和实际表现，再定位根因并修复。",
			"home.fix.task2": "修复失败的测试",
			"home.fix.prompt2": "请运行当前项目适用的测试，定位失败根因并做最小修复，保留有效的回归覆盖。",
			"settings.title": "设置",
			"settings.back": "返回应用",
			"settings.openDocument": "打开配置文件",
			"settings.advanced": "高级",
			"settings.documentTitle": "配置文件",
			"settings.documentDescription": "在外部编辑器中查看和编辑配置",
			"settings.documentOpen": "打开",
			"settings.documentOpening": "打开中…",
			"settings.developerTools.title": "显示代码工作视图",
			"settings.developerTools.description": "开启后，显示轨迹、本轮代码差异，可选择完整的 Agent 预设切换",
			"settings.developerTools.error": "保存失败，请重试",
			"settings.openDocumentError": "无法打开配置文件",
			"settings.search": "搜索设置…",
			"settings.personal": "个人",
			"settings.integrations": "集成",
			"settings.pluginConfig": "插件管理",
			"settings.records": "记录与应用",
			"settings.general": "常规",
			"settings.permissions": "权限",
			"settings.editor": "编辑器",
			"settings.noResults": "没有匹配的设置分类",
			"settings.filterHint": "仅筛选导航，选择分类后切换当前页面。",
			"settings.disconnected": "连接异常",
			"settings.reconnect": "立即重连",
			"settings.connecting": "连接中",
			"settings.recovered": "连接成功",
			"input.historyHint": "↑↓ 翻历史",
			"sidebar.label": "DSH 导航",
			"sidebar.expand": "展开侧边栏",
			"sidebar.collapse": "收缩侧边栏",
			"sidebar.newTask": "新建任务",
			"sidebar.search": "搜索会话",
			"sidebar.mainMenu": "主菜单",
			"sidebar.extensions": "扩展管理",
			"sidebar.experts": "专家",
			"sidebar.skills": "技能",
			"sidebar.plugins": "插件管理",
			"sidebar.marketplace": "插件市场",
			"sidebar.builtinPlugins": "内置插件",
			"sidebar.connectors": "连接器",
			"sidebar.schedule": "定时任务",
			"sidebar.assistant": "IM助理",
			"sidebar.imSettings": "IM助理",
			"sidebar.tasksTab": "任务",
			"sidebar.channelsTab": "频道",
			"sidebar.scheduleTab": "定时",
			"sidebar.runsTab": "记录",
			"sidebar.overviewTab": "任务",
			"channels.empty": "还没有频道会话。先在设置 → IM助理 里连接渠道。",
			"channels.loadError": "无法读取频道会话。",
			"channel.dingtalk": "钉钉",
			"channel.feishu": "飞书",
			"channel.lark": "Lark",
			"channel.weixin": "微信",
			"channel.wecom": "企业微信",
			"channel.qq": "QQ",
			"channel.telegram": "Telegram",
			"channel.unknown": "频道",
			"schedule.empty": "还没有定时任务运行记录。",
			"schedule.groupActions": "{name} 的任务操作",
			"schedule.taskSettings": "任务设置",
			"schedule.archiveGroup": "归档整组会话",
			"schedule.archiveGroupConfirm": "确认归档",
			"schedule.archiveGroupDescription": "将归档“{name}”下的 {count} 个会话。归档后可以在“设置 → 已归档”中恢复。",
			"schedule.archiveGroupPending": "正在归档整组会话…",
			"schedule.archiveGroupPartial": "已归档 {archived} 个会话，另有 {failed} 个失败。可以重试剩余会话。",
			"search.placeholder": "搜索会话、设置和操作",
			"search.empty": "没有匹配的结果。",
			"search.sessions": "会话",
			"search.settings": "设置",
			"search.actions": "快捷操作",
			"workspace.label": "工作区会话",
			"workspace.pinned": "置顶",
			"workspace.pinnedEmpty": "拖动项目到此处置顶",
			"workspace.projects": "项目",
			"workspace.ungrouped": "未分组",
			"workspace.createGroup": "新建分组",
			"workspace.createGroupDescription": "输入分组名称，项目不会自动移动。",
			"workspace.groupName": "分组名称",
			"workspace.moveToGroup": "移动到分组",
			"workspace.removeFromGroup": "移至未分组",
			"workspace.deleteGroup": "删除分组“{name}”",
			"workspace.deleteGroupAction": "删除分组",
			"workspace.deleteGroupDescription": "删除分组只会将其中项目移至未分组，不会删除项目或会话。",
			"workspace.groupActions": "分组“{name}”的操作",
			"workspace.renameGroup": "重命名分组",
			"workspace.recent": "最近",
			"workspace.recentEmpty": "无聊天",
			"workspace.noChat": "暂无聊天",
			"workspace.showMore": "展开显示",
			"workspace.search": "搜索项目",
			"workspace.searchPlaceholder": "搜索项目和会话",
			"workspace.searchClose": "关闭搜索",
			"workspace.searchEmpty": "没有匹配的项目或会话",
			"workspace.empty": "暂无项目",
			"workspace.newSession": "新建会话",
			"workspace.rename": "重命名项目",
			"workspace.pin": "置顶项目",
			"workspace.unpin": "取消置顶",
			"workspace.archive": "归档所有会话",
			"workspace.archiveTitle": "归档 {count} 个会话？",
			"workspace.archiveDescription": "这会归档“{name}”中的全部会话，项目和文件夹仍会保留。",
			"workspace.archiveConfirm": "全部归档",
			"workspace.archivePending": "正在归档会话…",
			"workspace.openPath": "在资源管理器中打开",
			"workspace.delete": "移除项目",
			"workspace.deleteDescription": "将把“{name}”从项目列表中移除。文件夹和会话记录会保留。",
			"workspace.deletePending": "正在移除项目…",
			"workspace.actions": "{name} 的项目操作",
			"workspace.taskCount": "{count} 个任务",
			"workspace.taskSummary": "{count} 个任务 · {unreadCount} 条未读",
			"workspace.edit": "重命名项目",
			"sessions.close": "关闭",
			"sessions.cancel": "取消",
			"sessions.save": "保存",
			"sessions.failed": "操作失败：{message}",
			"sessions.unknown": "找不到该会话。",
			"sessions.actions": "{name} 的会话操作",
			"sessions.markUnread": "标记为未读",
			"sessions.markRead": "标记为已读",
			"sessions.unread": "未读",
			"sessions.waitingAnswer": "等待回答",
			"sessions.waitingApproval": "等待审批",
			"sessions.planReview": "计划待审",
			"sessions.rename": "重命名会话",
			"sessions.renameDescription": "保持简短且易于识别",
			"sessions.renameInvalid": "会话名称无效，请修改后重试。",
			"sessions.renameFailed": "暂时无法重命名该会话，请稍后重试。",
			"sessions.archive": "归档会话",
			"sessions.archiveFailed": "暂时无法归档该会话，请稍后重试。",
			"sessions.delete": "删除会话",
			"sessions.deleteDescription": "将永久删除会话“{name}”及其全部记录，此操作不可恢复。",
			"sessions.deletePending": "正在删除会话…",
			"sessions.deleteUnavailable": "未安装或无法连接归档管理插件。",
			"sessions.deleteFailed": "暂时无法删除该会话，请稍后重试。",
			"sessions.fork": "在新会话中继续",
			"sessions.forkUnavailable": "当前会话暂时无法在新会话中继续，请等待本轮结束后重试。",
			"sessions.forkFailed": "暂时无法创建新会话，请稍后重试。",
			"sessions.openPath": "在资源管理器中打开",
			"sessions.moveWorkspace": "项目",
			"sessions.moveUnavailable": "会话移动服务暂不可用，请重启 DSH 后重试。",
			"sessions.moveUnauthorized": "登录状态已失效，请刷新页面并重新登录。",
			"sessions.moveForbidden": "当前访问地址不受信任，或请求来源已被拒绝。",
			"sessions.moveNotFound": "会话或目标项目已不存在，请刷新后重试。",
			"sessions.moveSubagent": "子代理会话不能移动到其他项目。",
			"sessions.moveBusy": "该会话正在移动，请稍后重试。",
			"sessions.moveRollbackFailed": "会话移动失败，自动恢复未完整完成，请查看 DSH 服务端日志。",
			"sessions.moveFailed": "暂时无法移动该会话，原会话已保留。",
			"sessions.moveConfirmTitle": "将会话移至“{project}”？",
			"sessions.moveConfirmDescription": "“{name}”将移动到此项目，工作目录也会随之更改。",
			"sessions.moveConfirmAction": "移动",
			"sessions.movePending": "正在移动会话…",
			"sessions.copyPath": "复制工作目录",
			"sessions.copyTitle": "复制会话标题",
			"sessions.copyId": "复制会话 ID",
			"connectors.title": "连接器",
			"connectors.description": "显示当前会话可用的 MCP 连接器及其工具，不显示地址、命令或凭证。",
			"connectors.openSession": "请先打开一个会话以读取连接器。",
			"connectors.loading": "正在读取连接器…",
			"connectors.failed": "连接器目录暂不可用，请稍后重试。",
			"connectors.toolCount": "{count} 个工具",
			"connectors.empty": "当前会话没有可用的 MCP 连接器。",
			"connectors.promptReady": "已带入新会话",
			"connectors.promptRequired": "Prompt 不能为空。",
			"connectors.workspacesLoading": "DSH 工作区数据尚未就绪，请稍后重试。",
			"connectors.workspaceRequired": "请先选择一个工作区，再使用示例 Prompt。",
			"connectors.workspaceUnavailable": "DSH 工作区服务尚未就绪，请稍后重试。",
			"connectors.conversationUnavailable": "DSH 对话服务尚未就绪，请稍后重试。",
			"connectors.sessionPending": "新会话尚未就绪，请稍后重试。",
			"about.nav": "Codex UI",
			"about.title": "Codex UI",
			"about.viewProject": "GitHub",
			"about.feedback": "问题反馈",
			"about.checkUpdate": "检查更新",
			"about.checking": "正在检查更新…",
			"about.description": "为 DSH 提供 Codex 风格的侧栏、工作区会话管理、搜索与会话轮次导航。",
			"about.features": "基本功能",
			"about.feature.sidebar": "Codex 风格侧栏、全局会话搜索与设置入口",
			"about.feature.search": "通过顶部搜索快速定位会话、设置页面和新建任务等快捷操作",
			"about.feature.workspace": "项目文件夹可展开、折叠、拖拽排序和置顶，并保留原生工作区能力",
			"about.feature.sessions": "会话支持重命名、置顶、未读标记、归档、删除及右键快捷操作",
			"about.feature.conversation": "保留原生消息、工具调用、输入、权限和模型选择，仅调整容器视觉",
			"about.feature.navigator": "当前会话提供轮次缩略导航，可快速跳转至每一次用户提问",
			"about.dependencies": "配套管理插件",
			"about.dependenciesDescription": "每个配套插件都可单独安装和更新，也可一键安装缺失项并更新旧版本。可分别检查 Codex UI、专家、技能、归档、IM、定时任务、BTW、Simplify、PUA、代码审查、宠物和应用市场。",
			"about.loading": "正在读取依赖安装状态…",
			"about.statusFailed": "暂时无法读取依赖安装状态。",
			"about.refreshFailed": "依赖状态刷新失败，当前显示上次成功读取的结果。",
			"about.installed": "已安装",
			"about.missing": "未安装",
			"about.updateAvailable": "可更新",
			"about.install": "安装",
			"about.update": "更新",
			"about.installing": "安装中",
			"about.updateAll": "全部安装/更新",
			"about.updatingAll": "安装/更新中",
			"about.upToDate": "所有配套插件均已安装并为最新版本。",
			"about.installFailed": "依赖安装失败，请稍后重试。",
			"about.installUnchanged": "安装命令已结束，但插件没有进入当前 Profile。请重试。",
			"about.installExitDesktop": "请先完全退出 DSH Desktop，再重新打开后更新。",
			"about.installStoreMismatch": "插件目录与 pnpm 仓库不一致。请完全退出 DSH Desktop 后再更新。",
			"about.installExitWeb": "无法覆盖正在运行的插件文件。请停止当前 DSH Web 后，在终端更新插件，再重新启动 DSH Web。",
			"about.installStoreMismatchWeb": "插件目录与 pnpm 仓库不一致。请停止当前 DSH Web 后重试；仍失败时重新安装该 Profile 的依赖。",
			"about.installWebFailed": "插件更新失败。请查看 DSH Web 终端输出后重试。",
			"about.installBuildPolicy": "插件依赖的 pnpm 构建脚本策略尚未确认，请更新 Profile 配置后重试。",
			"about.installPnpmMissing": "当前环境找不到 pnpm，请安装 pnpm 并重启 DSH 后重试。",
			"about.installTimeout": "插件安装超时，请检查网络后重试。",
			"about.installServiceUnavailable": "DSH Desktop 依赖管理服务尚未就绪，请重启后重试。",
			"about.restartRequired": "正在热更新插件，窗口会自动刷新。",
			"about.restartManually": "安装完成。当前 Web 无法自动重启，请重启 DSH Web 后刷新页面。",
			"about.progressHint": "正在安装插件…",
			"about.packagesDone": "已完成 {0} 个包",
			"about.progress.resolving": "解析依赖",
			"about.progress.downloading": "下载中",
			"about.progress.linking": "写入文件",
			"about.progress.building": "构建中",
			"about.dependency.dsh": "DeepSeek Harness",
			"about.dependency.suite": "Codex 套件",
			"about.dependency.ui": "Codex UI",
			"about.dependency.experts": "专家管理",
			"about.dependency.skills": "技能管理",
			"about.dependency.archive": "归档会话",
			"about.dependency.im": "IM助理",
			"about.dependency.schedule": "定时任务",
			"about.dependency.pet": "Codex 宠物",
			"about.dependency.btw": "BTW 旁问",
			"about.dependency.simplify": "Simplify",
			"about.dependency.pua": "PUA",
			"about.dependency.review": "代码审查",
			"about.dependency.market": "应用市场",
			"about.totalDownloads": "npm 累计下载",
			"about.downloadsUnavailable": "暂不可用",
			"about.downloadsSource": "npm 官方统计：自包创建日至昨日的累计下载次数，点击查看 npm 包",
			"turns.label": "当前会话轮次导航",
			"turns.untitled": "未命名提问",
			"turns.jump": "跳转到第 {index} 轮：{summary}",
			"time.justNow": "刚刚",
			"time.justNowShort": "刚刚",
			"time.minutes": "{count}分",
			"time.hours": "{count}小时",
			"time.days": "{count}天",
			"time.weeks": "{count}周",
			"time.months": "{count}个月",
			"time.years": "{count}年",
			"errors.unauthorized": "请先登录 DSH，再重试。",
			"errors.forbidden": "请求被安全检查拒绝，请从可信的 DSH 地址重试。",
			"errors.serviceUnavailable": "服务暂不可用，请稍后重试。",
			"workspace.preferencesLocalOnly": "项目偏好尚未同步，当前使用本地缓存。",
			"errors.generic": "操作未完成，请重试。",
			"errors.groupInvalid": "分组信息无效。",
			"errors.workspaceInvalid": "项目标识无效。",
			"errors.groupMissing": "目标分组不存在。",
			"errors.orderAnchorMissing": "排序位置已失效，请重试。",
			"sessionTitle.system": "为编程助手会话生成标题。\n只输出一行，恰好两段：类型｜主题\n类型必须是其中一个：{types}\n主题必须是具体事项，不能重复类型，不要写类型名或空主题。不要写日期或表情，不要引号、前缀、解释或 Markdown。\n主题使用用户消息的语言。",
			"sessionTitle.userFrame": "根据这条用户消息生成会话标题。只返回“类型｜主题”一行，不要第三段，不要重复主题。",
			"sessionTitle.type.feature": "功能",
			"sessionTitle.type.design": "设计",
			"sessionTitle.type.fix": "修复",
			"sessionTitle.type.optimize": "优化",
			"sessionTitle.type.release": "发布",
			"sessionTitle.type.explore": "探索",
			"sessionTitle.type.docs": "文档",
			"sessionTitle.type.research": "研究",
			"meta.locale": "zh-CN"
		};
		const en = {
			"workspace.addFailed": "Could not add workspace",
			"workspace.add": "Add workspace",
			"workspace.retry": "Retry",
			"workspace.chooseAgain": "Choose again",
			"navigation.back": "Back",
			"navigation.forward": "Forward",
			"home.resizeInput": "Drag to resize the input area",
			"home.projectSearch": "Search projects",
			"home.projectEmpty": "No matching projects",
			"home.suggestions": "Start a task",
			"home.workspace": "Choose a workspace first, then select a task.",
			"home.draft": "Your draft and attachments are preserved. Clear the input to use a suggestion.",
			"home.busy": "The input is busy. Please try again shortly.",
			"home.explore": "Explore and understand code",
			"home.build": "Build features, apps, or tools",
			"home.review": "Review code and suggest changes",
			"home.fix": "Fix bugs and failures",
			"home.explore.task1": "Explain the project structure",
			"home.explore.prompt1": "Explore this workspace and explain its structure, main entry points, and module relationships.",
			"home.explore.task2": "Understand a feature",
			"home.explore.prompt2": "Help me understand a feature. First ask which feature, then explain its implementation and call flow.",
			"home.build.task1": "Implement a feature",
			"home.build.prompt1": "Help me implement a feature in this project. First clarify requirements and acceptance criteria.",
			"home.build.task2": "Build a small tool",
			"home.build.prompt2": "Help me build a small tool. First ask about its goal, inputs, and outputs, then propose an approach.",
			"home.review.task1": "Review current changes",
			"home.review.prompt1": "Review uncommitted changes for bugs, regressions, and missing tests. Do not modify files yet.",
			"home.review.task2": "Inspect code quality",
			"home.review.prompt2": "Inspect code quality in this project and suggest improvements grounded in the source. Assess only; do not edit.",
			"home.fix.task1": "Investigate a bug",
			"home.fix.prompt1": "Help me fix a bug. First ask for reproduction steps, expected behavior, and actual behavior.",
			"home.fix.task2": "Fix failing tests",
			"home.fix.prompt2": "Run the applicable project tests, identify failure causes, and make minimal fixes with meaningful regression coverage.",
			"settings.title": "Settings",
			"settings.back": "Back to app",
			"settings.openDocument": "Open configuration file",
			"settings.advanced": "Advanced",
			"settings.documentTitle": "Configuration file",
			"settings.documentDescription": "View and edit configuration in an external editor",
			"settings.documentOpen": "Open",
			"settings.documentOpening": "Opening…",
			"settings.developerTools.title": "Show coding view",
			"settings.developerTools.description": "Shows trajectory, code diffs, and all Agent presets",
			"settings.developerTools.error": "Could not save. Please try again.",
			"settings.openDocumentError": "Could not open configuration file",
			"settings.search": "Search settings…",
			"settings.personal": "Personal",
			"settings.integrations": "Integrations",
			"settings.pluginConfig": "Plugin manager",
			"settings.records": "Records and app",
			"settings.general": "General",
			"settings.permissions": "Permissions",
			"settings.editor": "Editor",
			"settings.noResults": "No matching settings categories",
			"settings.filterHint": "Navigation is filtered. Select a category to switch pages.",
			"settings.disconnected": "Disconnected",
			"settings.reconnect": "Reconnect now",
			"settings.connecting": "Connecting",
			"settings.recovered": "Connected",
			"input.historyHint": "↑↓ History",
			"sidebar.label": "DSH navigation",
			"sidebar.expand": "Expand sidebar",
			"sidebar.collapse": "Collapse sidebar",
			"sidebar.newTask": "New task",
			"sidebar.search": "Search conversations",
			"sidebar.mainMenu": "Main menu",
			"sidebar.extensions": "Extensions",
			"sidebar.experts": "Experts",
			"sidebar.skills": "Skills",
			"sidebar.plugins": "Plugin manager",
			"sidebar.marketplace": "Plugin Market",
			"sidebar.builtinPlugins": "Built-in plugins",
			"sidebar.connectors": "Connectors",
			"sidebar.schedule": "Scheduled tasks",
			"sidebar.assistant": "IM Assistant",
			"sidebar.imSettings": "IM Assistant",
			"sidebar.tasksTab": "Tasks",
			"sidebar.channelsTab": "Channels",
			"sidebar.scheduleTab": "Schedule",
			"sidebar.runsTab": "Records",
			"sidebar.overviewTab": "Tasks",
			"channels.empty": "No channel conversations yet. Connect a channel in Settings → IM Assistant.",
			"channels.loadError": "Could not load channel conversations.",
			"channel.dingtalk": "DingTalk",
			"channel.feishu": "Feishu",
			"channel.lark": "Lark",
			"channel.weixin": "WeChat",
			"channel.wecom": "WeCom",
			"channel.qq": "QQ",
			"channel.telegram": "Telegram",
			"channel.unknown": "Channel",
			"schedule.empty": "No scheduled-task runs yet.",
			"schedule.groupActions": "Task actions for {name}",
			"schedule.taskSettings": "Task settings",
			"schedule.archiveGroup": "Archive all conversations",
			"schedule.archiveGroupConfirm": "Archive all",
			"schedule.archiveGroupDescription": "Archive all {count} conversations for “{name}”. You can restore them later in Settings → Archived.",
			"schedule.archiveGroupPending": "Archiving conversations…",
			"schedule.archiveGroupPartial": "Archived {archived} conversations; {failed} failed. You can retry the remaining conversations.",
			"search.placeholder": "Search conversations, settings, and actions",
			"search.empty": "No matching results.",
			"search.sessions": "Conversations",
			"search.settings": "Settings",
			"search.actions": "Quick actions",
			"workspace.label": "Workspace conversations",
			"workspace.projects": "Projects",
			"workspace.ungrouped": "Ungrouped",
			"workspace.createGroup": "Create group",
			"workspace.createGroupDescription": "Enter a group name. Projects will not move automatically.",
			"workspace.groupName": "Group name",
			"workspace.moveToGroup": "Move to group",
			"workspace.removeFromGroup": "Move to ungrouped",
			"workspace.deleteGroup": "Delete group {name}",
			"workspace.deleteGroupAction": "Delete group",
			"workspace.deleteGroupDescription": "Deleting this group moves its projects to Ungrouped. It does not delete projects or conversations.",
			"workspace.groupActions": "Actions for group {name}",
			"workspace.renameGroup": "Rename group",
			"workspace.recent": "Recents",
			"workspace.recentEmpty": "No chats",
			"workspace.noChat": "No chats",
			"workspace.showMore": "Show more",
			"workspace.search": "Search projects",
			"workspace.searchPlaceholder": "Search projects and conversations",
			"workspace.searchClose": "Close search",
			"workspace.searchEmpty": "No matching projects or conversations",
			"workspace.empty": "No projects",
			"workspace.newSession": "New conversation",
			"workspace.rename": "Rename project",
			"workspace.pin": "Pin project",
			"workspace.unpin": "Unpin",
			"workspace.archive": "Archive all conversations",
			"workspace.archiveTitle": "Archive {count} conversations?",
			"workspace.archiveDescription": "This archives every conversation in “{name}”. The project and folder remain available.",
			"workspace.archiveConfirm": "Archive all",
			"workspace.archivePending": "Archiving conversations…",
			"workspace.pinned": "Pinned",
			"workspace.pinnedEmpty": "Drag a project here to pin it",
			"workspace.openPath": "Open in file explorer",
			"workspace.delete": "Remove project",
			"workspace.deleteDescription": "This removes “{name}” from the project list. The folder and conversation records remain.",
			"workspace.deletePending": "Removing project…",
			"workspace.actions": "Project actions for {name}",
			"workspace.taskCount": "{count} tasks",
			"workspace.taskSummary": "{count} tasks · {unreadCount} unread",
			"workspace.edit": "Rename project",
			"sessions.close": "Close",
			"sessions.cancel": "Cancel",
			"sessions.save": "Save",
			"sessions.failed": "Action failed: {message}",
			"sessions.unknown": "Conversation not found.",
			"sessions.actions": "Conversation actions for {name}",
			"sessions.markUnread": "Mark as unread",
			"sessions.markRead": "Mark as read",
			"sessions.unread": "Unread",
			"sessions.waitingAnswer": "Waiting for answer",
			"sessions.waitingApproval": "Waiting for approval",
			"sessions.planReview": "Plan awaiting review",
			"sessions.rename": "Rename conversation",
			"sessions.renameDescription": "Keep it short and easy to recognize.",
			"sessions.renameInvalid": "The conversation name is invalid. Change it and try again.",
			"sessions.renameFailed": "The conversation could not be renamed. Try again later.",
			"sessions.archive": "Archive conversation",
			"sessions.archiveFailed": "The conversation could not be archived. Try again later.",
			"sessions.delete": "Delete conversation",
			"sessions.deleteDescription": "This permanently deletes “{name}” and all of its records. This cannot be undone.",
			"sessions.deletePending": "Deleting conversation…",
			"sessions.deleteUnavailable": "The archive manager plugin is not installed or unavailable.",
			"sessions.deleteFailed": "The conversation could not be deleted. Try again later.",
			"sessions.fork": "Continue in new conversation",
			"sessions.forkUnavailable": "This conversation cannot be continued in a new conversation right now. Try again after the current turn finishes.",
			"sessions.forkFailed": "A new conversation could not be created. Try again later.",
			"sessions.openPath": "Open in file explorer",
			"sessions.moveWorkspace": "Project",
			"sessions.moveUnavailable": "Conversation moving is unavailable. Restart DSH and try again.",
			"sessions.moveUnauthorized": "Your login session has expired. Refresh the page and sign in again.",
			"sessions.moveForbidden": "The current address is not trusted, or the request origin was rejected.",
			"sessions.moveNotFound": "The conversation or target project no longer exists. Refresh and try again.",
			"sessions.moveSubagent": "Subagent conversations cannot be moved to another project.",
			"sessions.moveBusy": "This conversation is already being moved. Try again shortly.",
			"sessions.moveRollbackFailed": "The conversation could not be moved, and automatic recovery did not complete. Check the DSH server logs.",
			"sessions.moveFailed": "The conversation could not be moved. The original conversation was preserved.",
			"sessions.moveConfirmTitle": "Move conversation to “{project}”?",
			"sessions.moveConfirmDescription": "“{name}” will move to this project, and its working directory will change with it.",
			"sessions.moveConfirmAction": "Move",
			"sessions.movePending": "Moving conversation…",
			"sessions.copyPath": "Copy working directory",
			"sessions.copyTitle": "Copy conversation title",
			"sessions.copyId": "Copy conversation ID",
			"connectors.title": "Connectors",
			"connectors.description": "Shows MCP connectors and tools available to this session without exposing addresses, commands, or credentials.",
			"connectors.openSession": "Open a conversation to load connectors.",
			"connectors.loading": "Loading connectors…",
			"connectors.failed": "Connectors are unavailable. Try again shortly.",
			"connectors.toolCount": "{count} tools",
			"connectors.empty": "This conversation has no available MCP connectors.",
			"connectors.promptReady": "Added to a new conversation",
			"connectors.promptRequired": "The prompt cannot be empty.",
			"connectors.workspacesLoading": "DSH workspace data is still loading. Try again shortly.",
			"connectors.workspaceRequired": "Select a workspace before using an example prompt.",
			"connectors.workspaceUnavailable": "The DSH workspace service is not ready. Try again shortly.",
			"connectors.conversationUnavailable": "The DSH conversation service is not ready. Try again shortly.",
			"connectors.sessionPending": "The new conversation is not ready yet. Try again shortly.",
			"about.nav": "Codex UI",
			"about.title": "Codex UI",
			"about.viewProject": "GitHub",
			"about.feedback": "Issues",
			"about.checkUpdate": "Check for updates",
			"about.checking": "Checking…",
			"about.description": "Adds a Codex-style sidebar, workspace conversation management, search, and turn navigation to DSH.",
			"about.features": "Core features",
			"about.feature.sidebar": "Codex-style sidebar, global conversation search, and settings entry points",
			"about.feature.search": "Find conversations, settings pages, and quick actions from the top search panel",
			"about.feature.workspace": "Expand, collapse, reorder, and pin workspace folders while retaining native workspace behavior",
			"about.feature.sessions": "Rename, pin, mark unread, archive, delete, or use context actions for conversations",
			"about.feature.conversation": "Keeps native messages, tool calls, composer, permissions, and model selection while refining the container visuals",
			"about.feature.navigator": "Navigate directly to each user prompt with the current conversation turn navigator",
			"about.dependencies": "Companion management plugins",
			"about.dependenciesDescription": "Install or update each companion separately, or install missing plugins and update old versions in one action. Check Codex UI, expert, skill, archive, IM, scheduled-task, BTW, Simplify, PUA, code review, pet, and marketplace plugins on their own.",
			"about.loading": "Loading dependency status…",
			"about.statusFailed": "Dependency status is temporarily unavailable.",
			"about.refreshFailed": "Dependency status refresh failed. Showing the last successful result.",
			"about.installed": "Installed",
			"about.missing": "Not installed",
			"about.updateAvailable": "Update available",
			"about.install": "Install",
			"about.update": "Update",
			"about.installing": "Installing",
			"about.updateAll": "Install/update all",
			"about.updatingAll": "Installing/updating",
			"about.upToDate": "All companion plugins are installed and up to date.",
			"about.installFailed": "Dependency installation failed. Try again later.",
			"about.installUnchanged": "The install command finished, but the plugin did not enter this profile. Try again.",
			"about.installExitDesktop": "Quit DSH Desktop completely, reopen it, and try the update again.",
			"about.installStoreMismatch": "The plugin directory and pnpm store do not match. Quit DSH Desktop completely and try again.",
			"about.installExitWeb": "Running plugin files cannot be replaced. Stop the current DSH Web host, update the plugin from a terminal, then restart DSH Web.",
			"about.installStoreMismatchWeb": "The plugin directory and pnpm store do not match. Stop the current DSH Web host and try again; if it persists, reinstall this Profile's dependencies.",
			"about.installWebFailed": "Plugin update failed. Check the DSH Web terminal output and try again.",
			"about.installBuildPolicy": "The pnpm build-script policy for this plugin is not configured. Update the Profile configuration and try again.",
			"about.installPnpmMissing": "pnpm is not available. Install pnpm, restart DSH, and try again.",
			"about.installTimeout": "Plugin installation timed out. Check the network and try again.",
			"about.installServiceUnavailable": "The DSH Desktop dependency service is not ready. Restart DSH Desktop and try again.",
			"about.restartRequired": "Updating plugins now. The window will refresh automatically.",
			"about.restartManually": "Installation complete. This Web host cannot restart itself; restart DSH Web, then refresh the page.",
			"about.progressHint": "Installing plugin…",
			"about.packagesDone": "{0} packages done",
			"about.progress.resolving": "Resolving",
			"about.progress.downloading": "Downloading",
			"about.progress.linking": "Writing files",
			"about.progress.building": "Building",
			"about.dependency.dsh": "DeepSeek Harness",
			"about.dependency.suite": "Codex suite",
			"about.dependency.ui": "Codex UI",
			"about.dependency.experts": "Expert management",
			"about.dependency.skills": "Skill management",
			"about.dependency.archive": "Archived conversations",
			"about.dependency.im": "IM Assistant",
			"about.dependency.schedule": "Scheduled tasks",
			"about.dependency.pet": "Codex Pet",
			"about.dependency.btw": "BTW",
			"about.dependency.simplify": "Simplify",
			"about.dependency.pua": "PUA",
			"about.dependency.review": "Code Review",
			"about.dependency.market": "App Market",
			"about.totalDownloads": "npm total downloads",
			"about.downloadsUnavailable": "Unavailable",
			"about.downloadsSource": "Cumulative npm downloads from package creation through yesterday. View package on npm.",
			"turns.label": "Conversation turn navigation",
			"turns.untitled": "Untitled prompt",
			"turns.jump": "Jump to turn {index}: {summary}",
			"time.justNow": "Just now",
			"time.justNowShort": "now",
			"time.minutes": "{count}m",
			"time.hours": "{count}h",
			"time.days": "{count}d",
			"time.weeks": "{count}w",
			"time.months": "{count}mo",
			"time.years": "{count}y",
			"errors.unauthorized": "Sign in to DSH, then try again.",
			"errors.forbidden": "The security check rejected this request. Try again from a trusted DSH address.",
			"errors.serviceUnavailable": "The service is unavailable. Try again later.",
			"workspace.preferencesLocalOnly": "Workspace preferences are not synced. Using the local cache.",
			"errors.generic": "The action could not be completed. Try again.",
			"errors.groupInvalid": "The group information is invalid.",
			"errors.workspaceInvalid": "The project identifier is invalid.",
			"errors.groupMissing": "The target group no longer exists.",
			"errors.orderAnchorMissing": "The target position is no longer available. Try again.",
			"sessionTitle.system": "Generate a title for a coding-assistant conversation.\nOutput exactly one line with two parts: Type｜Theme\nType must be one of: {types}\nThe theme must be a concrete subject and must not repeat the type. Do not write dates, emoji, quotes, prefixes, explanations, or Markdown.\nWrite the theme in the language of the user message.",
			"sessionTitle.userFrame": "Generate a conversation title from this user message. Return only one Type｜Theme line. Do not add a third part or repeat the theme.",
			"sessionTitle.type.feature": "Feature",
			"sessionTitle.type.design": "Design",
			"sessionTitle.type.fix": "Fix",
			"sessionTitle.type.optimize": "Optimize",
			"sessionTitle.type.release": "Release",
			"sessionTitle.type.explore": "Explore",
			"sessionTitle.type.docs": "Docs",
			"sessionTitle.type.research": "Research",
			"meta.locale": "en-US"
		};
		//#endregion
		//#region src/client/archive-session-delete.ts
		/** 永久删除会话由归档管理插件通过 remote.workspaceRegistry.deleteSession 提供。 */
		function hasArchiveSessionDelete(value) {
			return value !== null && typeof value === "object" && typeof value.deleteSession === "function";
		}
		//#endregion

/* ────────────────────────────────────────────────────────────────
 * 侧栏注册（新）：接管 sidebar.workspaces，保留宿主原生外壳与工作区数据能力。
 * ──────────────────────────────────────────────────────────────── */

const SIDEBAR_CHROME_STYLE_ID = 'dsh-best-workspace:sidebar-chrome'

/** 保留宿主原生外壳（含原生插件菜单）；只补齐移植树所需的侧栏配色变量。 */
function installSidebarChromeStyles() {
	if (typeof document === 'undefined') return () => {}
	let style = document.getElementById(SIDEBAR_CHROME_STYLE_ID)
	if (style === null) {
		style = document.createElement('style')
		style.id = SIDEBAR_CHROME_STYLE_ID
		style.textContent = [
			// 只保留“更多”入口：其余功能菜单收进 More 菜单（原生行仍留在 DOM 中供菜单转发点击）。
			'nav[class*="panelList"] button[class*="panelRow"]:not([aria-haspopup="menu"]) { display: none !important; }',
			':root {',
			'  --dcu-sidebar-primary: var(--dsw-alias-label-primary, #e6e6e6);',
			'  --dcu-sidebar-secondary: var(--dsw-alias-label-secondary, #a3a3a3);',
			'  --dcu-sidebar-tertiary: var(--dsw-alias-label-tertiary, #7a7a7a);',
			'  --dcu-sidebar-icon: var(--dsw-alias-label-secondary, #a3a3a3);',
			'  --dcu-sidebar-hover: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.06));',
			'  --dcu-sidebar-border: var(--dsw-alias-border-l1, rgba(255,255,255,.08));',
			'  --dcu-tip-bg: var(--dsw-alias-bg-layer-3, #262626);',
			'  --dcu-tip-shadow: var(--dsw-shadow-lg, 0 8px 24px rgba(0,0,0,.35));',
			'}',
		].join('\n')
		;(document.head ?? document.documentElement).appendChild(style)
	}
	return () => { style?.remove() }
}

async function runHostAction(action: string, execute: () => Promise<unknown>): Promise<unknown> {
	try {
		return await execute()
	} catch (reason) {
		if (reason instanceof UserFacingError || reason instanceof HostActionError) throw reason
		throw new HostActionError(action, reason)
	}
}

/** 与宿主一致的新会话入口；优先 uiWorkspace，其次 workspaces 服务。 */
async function startSidebarSession(ctx: ClientContext, workspaceId?: string): Promise<boolean> {
	const uiWorkspace = probeService(ctx, 'uiWorkspace')
	try {
		if (hasStartSession(uiWorkspace)) {
			await Promise.resolve(uiWorkspace.startSession(workspaceId))
			return true
		}
		const workspaces = probeService(ctx, 'workspaces')
		if (hasStartSession(workspaces)) {
			await Promise.resolve(workspaces.startSession(workspaceId))
			return true
		}
		console.warn('DSH 工作区服务尚未就绪，无法新建会话。')
		return false
	} catch (error) {
		console.warn('新建会话失败：', error)
		return false
	}
}

/** 侧栏树外层：同时渲染目录选择桥接与工作区浏览器。 */
function SidebarBrowserRoot(props: any) {
	const renderDirectoryFlow = (owner: any) => props.renderSlot('sidebar.codex.directoryFlow', owner)
	const [searchSignal, setSearchSignal] = react.useState(0)
	const requestSearch = () => setSearchSignal((count: any) => count + 1)
	return react.createElement(
		react.Fragment,
		null,
		react.createElement(WorkspaceShortcutBridge, {
			source: props.workspaceShortcuts,
			openSearch: requestSearch,
			startSession: props.startSession,
			renderDirectoryFlow,
			t: props.t,
		}),
		react.createElement(CodexWorkspaceBrowser, { ...props, searchSignal }),
	)
}

/** 从原生面板行读取菜单项：行仍留在 DOM 中（仅 CSS 隐藏），点击由本菜单转发。 */
function readPanelMenuRows() {
	if (typeof document === 'undefined') return []
	const rows: any[] = []
	const nodes = document.querySelectorAll('nav[class*="panelList"] button[class*="panelRow"]')
	nodes.forEach((node: any, index: number) => {
		if (node.getAttribute('aria-haspopup') === 'menu') return
		const label = (node.getAttribute('aria-label') ?? node.textContent ?? '').trim()
		if (label === '') return
		rows.push({
			key: index + ':' + label,
			label,
			active: node.getAttribute('aria-current') === 'page',
			select: () => node.click(),
		})
	})
	return rows
}

/** 侧栏“更多”菜单：收录原本平铺在置顶上方的功能入口，并保留原生浏览/创建插件动作。 */
function SidebarMoreMenu(props: any) {
	const [, bump] = react.useState(0)
	react.useEffect(() => { bump(1) }, [])
	const rows = readPanelMenuRows()
	const dismiss = () => {
		try { props.onDismiss?.() } catch {}
	}
	return react.createElement(
		react.Fragment,
		null,
		rows.map((row) => react.createElement(_deepseek_ai_dsh_client_ui_primitives.MenuItemButton, {
			key: row.key,
			current: row.active,
			onSelect: () => {
				dismiss()
				row.select()
			},
		}, row.label)),
	)
}

export const inject = ['slots', 'sessions', 'workspaces', 'layout', 'locale', 'connection', 'inputTriggers', 'conversation']

/** 只注册左侧边栏：接管 sidebar.workspaces，使用宿主工作区与会话服务。 */
export function apply(ctx: ClientContext): void {
	ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-best-workspace: dictionaries')
	const t = ctx.locale.bind(NS)

	ctx.effect(installSidebarChromeStyles, 'dsh-best-workspace: sidebar chrome')

	const workspaceShortcuts = createWorkspaceShortcutSource(ctx.slots)
	ctx.effect(() => () => workspaceShortcuts.dispose(), 'dsh-best-workspace: workspace shortcuts')
	registerWorkspaceDirectoryFlow(ctx)

	const archiveSession = (sessionId: string) => runHostAction('archive', () => archiveHostSession(ctx, sessionId))
	const forkSession = async (sessionId: string) => {
		await runHostAction('fork', () => forkHostSession(ctx, sessionId))
	}
	const renameSession = async (sessionId: string, title: string) => {
		await runHostAction('rename', async () => {
			try {
				await renameHostSession(ctx, sessionId, title)
			} catch (reason) {
				if (reason instanceof UnknownSessionError) throw new UserFacingError(t('sessions.unknown'))
				throw reason
			}
		})
	}
	const deleteSession = async (sessionId: string) => {
		const registry: any = ctx.get('remote.workspaceRegistry' as never)
		if (!hasArchiveSessionDelete(registry)) throw new UserFacingError(t('sessions.deleteUnavailable'))
		await runHostAction('delete', async () => {
			const result = await registry.deleteSession(sessionId)
			if (!result.ok) {
				throw result.error === undefined ? new UserFacingError(t('sessions.deleteUnavailable')) : result.error
			}
		})
	}
	const openPath = async (path: string) => {
		const connection: any = ctx.get('connection' as never)
		const open = connection?.api?.host?.openPath
		if (typeof open !== 'function') throw new UserFacingError('当前宿主不支持打开目录。')
		const response = await open({ path })
		if (!response?.result?.ok) throw new UserFacingError('打开目录失败。')
	}
	const startSession = (workspaceId?: string) => {
		void startSidebarSession(ctx, workspaceId)
	}

	ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register({
		name: 'sidebar.workspaces',
		priority: -1,
		locale: NS,
		children: {
			'sidebar.codex.directoryFlow': { kind: 'single', scope: 'root' },
		},
		inject: () => ({
			archiveSession,
			deleteSession,
			canDeleteSession: () => hasArchiveSessionDelete(ctx.get('remote.workspaceRegistry' as never)),
			deleteWorkspace: (workspaceId: string) => (ctx as any).workspaces.delete(workspaceId),
			forkSession,
			openPath,
			openSession: (sessionId: string) => openConversation(ctx, (ctx as any).layout, sessionId),
			renameSession,
			renameWorkspace: (workspaceId: string, title: string) => (ctx as any).workspaces.rename(workspaceId, title),
			insertWorkspaceBefore: (workspaceId: string, beforeWorkspaceId?: string) => (ctx as any).workspaces.insertBefore(workspaceId, beforeWorkspaceId),
			insertSessionBefore: (workspaceId: string, sessionId: string, beforeSessionId?: string) => (ctx as any).workspaces.insertSessionBefore(workspaceId, sessionId, beforeSessionId),
			startSession,
			workspaceShortcuts,
		}),
	}, SidebarBrowserRoot as any))

	ctx.slots.inject('sidebar.panellist.actions', () => ctx.slots.register({
		name: 'sidebar.panellist.actions',
		id: 'dsh-best-workspace',
		priority: -1,
		locale: NS,
	}, SidebarMoreMenu as any))
}
