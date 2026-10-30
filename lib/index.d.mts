import { Context } from "@deepseek-ai/cordis";
//#region src/index.d.ts
/**
 * Host 侧只保留一个业务端点：工作区偏好（置顶 / 分组）的读写。
 * 侧栏其余能力全部走客户端 store 与宿主原生服务，不再需要 Host 路由。
 */
declare const inject: string[];
declare function apply(ctx: Context): void;
//#endregion
export { apply, inject };