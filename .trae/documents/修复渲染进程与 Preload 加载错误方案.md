# 修复渲染进程加载与 Preload 脚本路径错误方案

当前控制台报错主要是由于 `electron-vite` 在启用 ESM (`"type": "module"`) 后生成的构建产物路径/扩展名与主进程代码中的硬编码路径不一致导致的。

## 1. 核心修复步骤

### 修复 Preload 脚本路径
*   **问题**：构建产物为 `out/preload/index.mjs`，但代码中硬编码为 `index.js`。
*   **对策**：在 [index.ts](file:///d:/Education/Project/Faramita%20Worlds/src/main/index.ts) 中更新路径，使其指向正确的 `.mjs` 文件（或兼容逻辑）。

### 整合与修正 Vite 配置
*   **问题**：拆分配置文件可能导致 `electron-vite` 无法正确协调开发服务器。
*   **对策**：将 [vite.config.ts](file:///d:/Education/Project/Faramita%20Worlds/src/renderer/vite.config.ts) 的逻辑合并回根目录的 [electron.vite.config.ts](file:///d:/Education/Project/Faramita%20Worlds/electron.vite.config.ts)，并确保 `renderer` 的 `root` 指向正确。

### 解决本地资源加载权限问题
*   **问题**：`Not allowed to load local resource` 通常是因为在开发模式下未能正确获取 `ELECTRON_RENDERER_URL`，导致回退到加载不存在的 `out/renderer/index.html`。
*   **对策**：通过修正配置文件，确保 `electron-vite dev` 能够成功启动渲染进程开发服务器并注入环境变量。

## 2. 具体操作计划

1.  **合并配置**：将渲染进程的 Vue 插件、别名等配置重新写入 [electron.vite.config.ts](file:///d:/Education/Project/Faramita%20Worlds/electron.vite.config.ts)。
2.  **更新主进程代码**：
    *   修正 `preload` 路径为 `join(__dirname, '../preload/index.mjs')`。
    *   确保环境变量 `ELECTRON_RENDERER_URL` 的判断逻辑稳健。
3.  **清理并重启**：删除 `out` 目录，重新执行 `npm run dev` 以确保所有产物按新配置生成。

**确认后，我将立即执行上述修复。**