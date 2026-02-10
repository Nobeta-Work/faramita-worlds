# 修复依赖缺失：安装 lucide-vue-next

当前控制台报错显示无法解析 `lucide-vue-next`，这是因为该图标库在代码中被引用，但尚未安装到项目的 `dependencies` 中。

## 1. 修复步骤

### 安装缺失依赖
*   **操作**：在终端执行 `npm install lucide-vue-next`。
*   **目的**：将图标库添加到 `package.json` 并下载到 `node_modules`，以解决 Vite 的导入分析错误。

### 验证导入
*   **操作**：重启 `npm run dev`。
*   **目的**：确保 [ChronicleZone.vue](file:///d:/Education/Project/Faramita%20Worlds/src/renderer/components/ChronicleZone.vue)、[CodexZone.vue](file:///d:/Education/Project/Faramita%20Worlds/src/renderer/components/CodexZone.vue) 等组件中的图标能够正常渲染。

**确认后，我将立即安装此依赖并恢复项目运行。**