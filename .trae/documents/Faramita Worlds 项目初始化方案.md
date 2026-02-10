# Faramita Worlds 项目初始化与核心架构设计方案

本方案旨在从零构建一个基于 Electron + Vue 3 的本地 AI 跑团系统。我们将遵循 70/30 非对称布局，集成 3D 物理投骰与动态世界卡系统。

## 一、 技术栈与基础设施初始化

1.  **项目骨架**：使用 `electron-vite` 搭建开发环境，确保主进程与渲染进程的高效协作。
2.  **核心依赖**：
    *   **数据库**：`Dexie.js` (IndexedDB) 处理本地世界卡、角色属性及剧情历史。
    *   **状态管理**：`Pinia` 同步全局世界状态与玩家数据。
    *   **3D 引擎**：`Three.js` + `cannon-es` 实现 Zone B 的物理骰子动画。
    *   **叙事渲染**：`markdown-it` 处理 AI 生成的文本，配合自定义 `Typewriter` 组件实现流式打字效果。
3.  **目录结构规范**：严格按照需求文档建立 `/src/main` (主进程), `/src/renderer` (UI与逻辑), `/src/shared` (类型定义) 的层级。

## 二、 核心模块实现路径

### 1. 数据层 (Data Layer - Dexie.js)
*   定义 `db.ts` 架构：包含 `world_cards` (条目管理), `characters` (属性存储), `chronicle` (对话历史)。
*   **初始化脚本**：编写导入逻辑，将 `Oort.json` 模板数据持久化至本地数据库。

### 2. 规则引擎 (Rule Engine - TypeScript)
*   **等级计算器**：实现 1-99 级的数值映射逻辑，支持 `Oort.json` 中定义的动态分等（如“罗伊兰魔法学院”的五阶职称）。
*   **判定协议 (AIProtocol)**：
    *   **注入器 (Injector)**：在发送 Prompt 前，根据当前上下文和可见度 (Visibility) 自动检索并注入相关世界卡内容。
    *   **拦截器 (Interceptor)**：通过正则监听 AI 输出中的 `[ROLL: 1d20 + 5]` 等指令，触发挂起逻辑并激活投骰。

### 3. UI/UX 交互层 (Presentation Layer - Vue 3)
*   **非对称布局 (70/30)**：使用 CSS Grid 构建主框架。
    *   **Zone A (Chronicle)**：实现逐字显示的剧情流。气泡设计：AI (银色左对齐), 玩家 (暗金色右对齐)。
    *   **回滚功能**：点击消息重置图标时，调用 Dexie 删除该 Turn 后的记录，并重新构造上下文发起请求。
    *   **Zone B (Codex)**：
        *   **Entity Viewer**：实时渲染人物卡与世界条目。
        *   **Dice Tray**：3D 物理投骰区域。逻辑由后端预计算，前端仅负责动画展现。

### 4. AI 通讯层 (Interface Layer - Axios)
*   封装 Axios 客户端，支持用户配置 `API Key`, `Base URL` 和 `Model Name`。
*   实现流式数据流读取，实时更新 Pinia Store 中的 `currentStreamingText`。

## 三、 验证与交付里程碑

1.  **Phase 1**: 基础架构搭建，完成 Dexie 数据库初始化与数据导入。
2.  **Phase 2**: 实现 70/30 布局及基础打字机组件。
3.  **Phase 3**: 开发等级计算逻辑与 AI 拦截协议。
4.  **Phase 4**: 集成 3D 骰子物理模拟。
5.  **Phase 5**: 联调 AI 接口，验证世界卡上下文注入与剧情回滚功能。

**确认后，我将首先开始项目骨架的搭建与依赖安装。**