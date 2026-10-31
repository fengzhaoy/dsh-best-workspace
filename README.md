<p align="center">
  <img src="assets/branding/dsh-banner.png" alt="DSH Best Workspace" width="100%">
</p>

<div align="center">

  # DSH Best Workspace

  **把 DSH Web 的左侧栏变成 Codex 风格的项目 / 会话树**

  [Apache-2.0](LICENSE)

  [![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
  [![npm package](https://img.shields.io/npm/v/%40zhaoyang10%2Fdsh-best-workspace.svg?label=npm%20package)](https://www.npmjs.com/package/@zhaoyang10/dsh-best-workspace)
  [![DSH Web Plugin](https://img.shields.io/badge/DSH%20Web-Plugin-0f766e.svg)](https://gitee.com/fengzhaoy/dsh-best-workspace)
  [![Node.js 22 or later](https://img.shields.io/badge/Node.js-22%20or%20later-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)

</div>

> DSH Best Workspace 是由社区维护的 DeepSeek Harness（DSH）界面插件，不是 DeepSeek 官方产品。

这个插件只做一件事：**重绘 DSH Web 的左侧栏**，把它变成 Codex 风格的项目 / 会话树。对话视图、输入框、右侧栏以及宿主渲染的其他区域都保持原样，不受影响。

## 功能

- **项目 / 会话树**：会话挂在所属项目之下，跨多个仓库并行工作时仍然一目了然。
- **三个可折叠分区**：**置顶**、**项目**、**最近**，每个分区各自记住展开状态。
- **项目分组**：可新建、重命名、删除分组，并在分组之间移动项目；不属于任何项目的分组内容归入**未分组**。
- **拖拽排序**：项目、项目内的会话、分组都可以拖动重排；把项目拖进**置顶**即可置顶。拖动时有落点指示线。
- **会话行实时状态**：运行中指示、未读圆点，以及等待你处理的警告徽标（**审批**、**回答**、**计划审阅**），并显示相对时间和项目名副标题。
- **会话右键菜单**：重命名、标记已读 / 未读、归档、分叉、移动到其他项目、打开工作目录、复制 ID / 标题 / 路径、删除。
- **项目右键菜单**：置顶 / 取消置顶、重命名、移动到分组、打开项目目录、归档该项目全部会话、删除项目。
- **长列表分页**：会话超过首屏窗口后通过**展开显示**加载，不会把侧栏撑长。
- **跟随宿主浅色 / 深色主题**：配色全部取自宿主主题令牌，切换外观后自动跟随，对比度满足 WCAG AA（正文 ≥ 4.5:1）。
- **项目 / 会话搜索**：鼠标悬停**项目**分区标题行时，分组按钮左侧出现放大镜（与旁边的分组、新建按钮同时出现，平时不占视觉）；点击展开为搜索框，输入即按标题过滤项目与会话（大小写不敏感，项目标题命中时保留其全部会话）；`Esc` 或 × 关闭并清空。宿主侧搜索快捷键的请求也会接到这里。
- **设置可跨重启保留**：置顶项目和分组布局保存在宿主侧，详见[数据与隐私](#数据与隐私)。
- **可逆**：插件只贡献一个侧栏视图，停用或卸载后官方侧栏立即恢复。

## 对 profile 的改动

安装后，插件会向 profile 的插件树增加一行，并应用 [cordis.patch.yml](cordis.patch.yml) 中的补丁：

- 挂载 `dsh-best-workspace`，接管 `sidebar.workspaces` 槽位；
- 向 `sidebar.panellist.actions` 槽位贡献菜单项；
- 停用 `directory-picker`（macOS 上在 loopback 宿主下可能挂死的原生 `osascript` 文件对话框），改为挂载官方 `directory-picker-browse` 后端与界面。

最后一条在界面上可以直接看到：**添加工作区**打开的是 DSH 进程内的目录浏览器，而不是操作系统对话框。除此之外，添加项目仍然完全走宿主能力。

## 宿主兼容性

插件面向完整 DSH `0.2.x` 版本线（`>=0.2.0-rc.1 <0.3.0-0`）。开发时依赖钉在 `0.2.1-rc.3`；后续 `0.2.x` 正式版、alpha 与 RC 都能通过版本门禁，而 `0.3.0` 以及低于 `0.2.0-rc.1` 的版本会被拒绝。

客户端模块由宿主的模块表统一提供，构建产物不会打包自己的 React 副本，因此始终与宿主 API 面保持一致。

## 环境要求

- 可用的 DeepSeek Harness Web 环境，`dsh` 在 `PATH` 中。
- 一个用于安装的 profile，示例用 `web`，请替换成你自己的 profile 名。
- Node.js `^22.19.0 || >=24.0.0`；从源码构建还需要 pnpm。

## 冲突与共存

插件独占 `sidebar.workspaces` 槽位，而**同一个 profile 里只能有一个接管该槽位的侧栏树插件**。安装前请先停用或卸载其他同类插件，例如：

- `@michengai/dsh-codex-ui`
- `ds-bot`
- 任何其他重绘工作区 / 会话列表的插件

```bash
dsh plugin --profile web remove @michengai/dsh-codex-ui
dsh plugin --profile web remove ds-bot
```

停用而不卸载也可以，只要同一个 profile 不会同时启用两个侧栏树插件。占用**右侧**栏或其他槽位的插件（例如 `dsh-better-sidebar`）不冲突，可以继续安装。

安装完成后重启 `dsh web` 并刷新浏览器标签页。

## 安装

下面两种方式都会从官方 npm registry 安装最新发布版本。

### 交给 agent 安装（推荐）

把下面这段话发给任何能在你机器上执行命令的 agent，并把 `web` 换成你的 profile 名。

```text
把 DSH 插件 @zhaoyang10/dsh-best-workspace 安装到我本地的 web profile 中，执行：dsh plugin --profile web add @zhaoyang10/dsh-best-workspace@latest --registry=https://registry.npmjs.org/。然后运行 dsh --profile web --dump-config，确认合成后的配置里包含 dsh-best-workspace 一行，并说明如何重启 DSH 以及如何使用这个侧栏。
```

### 手动安装

```bash
dsh plugin --profile web add @zhaoyang10/dsh-best-workspace@latest --registry=https://registry.npmjs.org/
dsh --profile web --dump-config | grep dsh-best-workspace
```

重启 `dsh web`，然后硬刷新浏览器标签页（`Cmd+Shift+R` / `Ctrl+Shift+R`）。新的侧栏会取代官方工作区列表。想回头时，用同样的方式移除即可：

```bash
dsh plugin --profile web remove @zhaoyang10/dsh-best-workspace
```

## 使用

| 目标 | 操作 |
| --- | --- |
| 打开会话 | 在树中点击该会话。 |
| 搜索 | 悬停**项目**标题行，点击分组按钮左侧的放大镜，输入项目或会话标题；`Esc` 退出。 |
| 新建会话 | 使用项目行上的**新建会话**操作，或使用聚焦输入框的工作区快捷键。 |
| 折叠分区 | 点击分区标题，折叠状态会被记住。 |
| 置顶项目 | 把它拖进**置顶**分区，或在右键菜单中选择**置顶**。 |
| 分组项目 | 从「项目」分区标题处**新建分组**，再用**移动到分组**搬迁项目。 |
| 调整顺序 | 拖动项目、会话或分组，落点指示线会显示目标位置。 |
| 重命名 | 对项目、分组或会话使用**重命名**。 |
| 管理单个会话 | 右键可重命名、标记已读 / 未读、归档、分叉、移动、打开目录、复制、删除。 |
| 清理整个项目 | 右键项目，选择**归档全部会话**或**删除**。 |
| 查看更多会话 | 在较长的项目下点击**展开显示**。 |

## 数据与隐私

- **置顶项目与分组布局**通过单一宿主端点 `/api/dsh-codex-ui/preferences`（`GET` / `HEAD` / `PUT`）持久化，写入当前 profile 目录下的 `.dsh-codex-ui-preferences.json`（路径为 `$DSH_HOME/profiles/<profile>`，设置了 `DSH_PROFILE_DIR` 时以其为准）。写入串行执行并采用原子重命名，请求体上限 32 KB，字段逐个校验。
- **未读标记**只存在当前浏览器的 `localStorage` 中，不会在浏览器或机器之间同步。
- **搜索**完全在本地完成：只匹配已加载到侧栏的项目与会话标题，不发请求，也不写入偏好文件。
- 插件**不写入任何会话记录**，也不改动项目文件。归档、删除、分叉、移动都是通过公共服务调用的宿主操作。
- 偏好端点的请求复用宿主 `connection` 服务做 host / origin 校验；该服务不可用时直接拒绝，而不是放行。

## 常见问题

### 置顶和未读状态能跨重启保留吗？

置顶项目和分组保存在宿主侧，重启或换浏览器都会保留；未读标记只存在浏览器本地，不会同步。

### 删除项目会删掉磁盘上的文件吗？

不会。删除只是通过宿主 API 把项目从侧栏移除，既不删除项目目录，也不删除其中的会话。

### 安装后界面没有变化怎么办？

按顺序检查三件事：安装的 profile 与 `dsh web` 正在运行的 profile 是否一致；安装后是否重启过服务；标签页是否硬刷新过。然后执行 `dsh --profile web --dump-config`，确认存在 `dsh-best-workspace` 一行。如果 profile 里还留着其他侧栏插件的 `disabled: true` 旧配置，请一并清理。

### 为什么「添加工作区」打开的是应用内浏览器，而不是系统对话框？

这是[对 profile 的改动](#对-profile-的改动)里说明的 macOS 兼容处理：原生选择器会进入 AppKit 模态循环，在 DSH 通过 loopback 地址提供服务时可能迟迟不返回，因此插件改为钉住官方 browse 后端。

### 可以和右侧栏插件一起用吗？

可以。只有 `sidebar.workspaces` 槽位是独占的，右侧栏和其他槽位不受影响。

## 开发

```
src/
  index.ts                 Host 侧：工作区偏好端点
  client/
    index.ts               客户端入口：导出 apply / inject
    sidebar/legacy-app.ts  侧栏实现（槽位、树、菜单）
locale/{en,zh}.json        DSH 展示用的插件元数据
cordis.patch.yml           profile 启动时应用的 bundle 补丁
```

```bash
pnpm install
pnpm run build      # tsc --noEmit && tsdown
```

构建产出 `lib/index.mjs`、`lib/index.d.mts` 与 `lib/client.js`。`lib/` 是提交进仓库的，CI 会在重新构建结果与提交内容不一致时失败。React 与 `@deepseek-ai/dsh-client-ui-primitives` 不会被打包，运行时由宿主模块表提供。

源码实际用到的两个 DSH 包版本只在 [pnpm-workspace.yaml](pnpm-workspace.yaml) 的 `catalog:` 中声明一次，[package.json](package.json) 里用 `catalog:` 引用。升级 DSH 只需要改这一处。

想在本地 profile 里试用当前代码：

```bash
dsh plugin --profile web add link:"$PWD"
```

仓库还带一个「添加工作区」的端到端校验：它会启动隔离 profile、断言合成配置，并驱动 Chrome 确认应用内目录浏览器确实弹出。

```bash
node scripts/verify-directory-flow.mjs   # 需要 playwright 与本地 Chrome
```

新增能力请复用 DSH 现有的槽位与公共服务，不要读取宿主私有 DOM，也不要直接写会话记录。

## 许可证

本项目采用 [Apache License 2.0](LICENSE) 许可。
