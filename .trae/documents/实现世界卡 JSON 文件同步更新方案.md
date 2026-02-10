# 实现世界卡 JSON 文件同步更新方案

本方案将建立从前端编辑器到本地文件系统的桥梁，确保每次保存世界卡时都能实时更新 `src/world_template/Oort.json` 文件，并提供保存结果反馈。

## 1. IPC 通讯机制建立 (Main & Preload)
*   **主进程 (Main)**：在 [index.ts](file:///d:/Education/Project/Faramita%20Worlds/src/main/index.ts) 中引入 `fs/promises`，添加 `save-world-file` 处理器。它将接收完整的 JSON 字符串并写入磁盘。
*   **预加载脚本 (Preload)**：在 [preload/index.ts](file:///d:/Education/Project/Faramita%20Worlds/src/preload/index.ts) 中暴露 `saveWorldFile` API，供渲染进程安全调用。

## 2. 数据序列化与同步逻辑 (World Store)
*   **状态聚合**：在 [store/world.ts](file:///d:/Education/Project/Faramita%20Worlds/src/renderer/store/world.ts) 中新增 `saveToFile` 动作。
    *   从 `IndexedDB` 中读取当前的世界元数据 (`world_meta`)。
    *   读取所有世界卡片，并根据类型（设定、章节、人物、魔法）重新构造为 `entries` 对象结构。
    *   调用 IPC API 将数据序列化并发送至主进程。

## 3. UI 反馈与触发机制 (Manager View)
*   **保存触发**：修改 [ManagerView.vue](file:///d:/Education/Project/Faramita%20Worlds/src/renderer/views/ManagerView.vue) 中的 `handleSave` 方法。
    *   在更新 `IndexedDB` 成功后，立即调用 `worldStore.saveToFile()`。
*   **用户提示**：根据保存结果，使用 `alert` 提示用户“保存成功”或“写入文件失败”。（后续可升级为更美观的 Toast 组件）。

## 4. 类型支持
*   更新 [env.d.ts](file:///d:/Education/Project/Faramita%20Worlds/src/renderer/env.d.ts) 以包含自定义 `api` 的类型定义，避免开发过程中的 TS 报错。

**确认后，我将立即开始实施文件写入功能。**