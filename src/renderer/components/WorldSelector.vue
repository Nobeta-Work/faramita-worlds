<script setup lang="ts">
import { Plus, Upload, FolderOpen, ChevronDown, ChevronRight, Book, Trash2, Download } from 'lucide-vue-next'

const props = defineProps<{
  templateFiles: string[]
  selectedWorldFile: string
  expandedSections: Record<string, boolean>
  worldMeta: {
    name: string
    version: string
    author: string
    description: string
    default_language: string
    tagsText: string
    tags: string[]
    player_character_id: string
  }
}>()

const emit = defineEmits<{
  (e: 'update:selectedWorldFile', value: string): void
  (e: 'update:worldMeta', value: {
    name: string
    version: string
    author: string
    description: string
    default_language: string
    tagsText: string
    tags: string[]
    player_character_id: string
  }): void
  (e: 'toggle-section', section: string): void
  (e: 'load-selected-world'): void
  (e: 'import-template'): void
  (e: 'delete-template', fileName: string): void
  (e: 'open-import-wizard'): void
  (e: 'open-export-dialog'): void
  (e: 'create-world'): void
}>()

const updateWorldMetaField = (
  key: 'name' | 'version' | 'author' | 'description' | 'default_language' | 'tagsText' | 'player_character_id',
  value: string
) => {
  const next = {
    ...props.worldMeta,
    [key]: value
  }

  if (key === 'tagsText') {
    next.tags = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  emit('update:worldMeta', next)
}
</script>

<template>
  <div class="worldbook-view">
    <div class="worldbook-header">
      <h2>世界书管理</h2>
      <p class="worldbook-hint">管理世界书模板，从模板加载或创建新的世界书</p>
    </div>

    <div class="worldbook-content">
      <div class="config-section">
        <div class="section-header" @click="emit('toggle-section', 'load')">
          <div class="section-title">
            <FolderOpen :size="18" />
            <span>加载世界书模板</span>
          </div>
          <ChevronDown v-if="expandedSections.load" :size="16" class="chevron" />
          <ChevronRight v-else :size="16" class="chevron" />
        </div>
        <div v-if="expandedSections.load" class="section-content">
          <p class="config-hint">
            从以下预置模板中选择加载世界书，或导入标准世界模板文件（.json）。
          </p>
          <div class="template-grid">
            <div
              v-for="file in templateFiles"
              :key="file"
              class="template-item"
              :class="{ selected: selectedWorldFile === file }"
              @click="emit('update:selectedWorldFile', file)"
            >
              <button class="btn-delete-template" @click.stop="emit('delete-template', file)" title="删除该世界书">
                <Trash2 :size="14" />
              </button>
              <Book :size="20" />
              <span class="template-name">{{ file.replace('.json', '') }}</span>
            </div>
            <div v-if="templateFiles.length === 0" class="no-templates">
              暂无可用模板
            </div>
          </div>
          <div class="section-actions">
            <button class="btn-primary" @click="emit('load-selected-world')" :disabled="!selectedWorldFile">
              <FolderOpen :size="16" /> 加载选中模板
            </button>
            <button class="btn-secondary" @click="emit('import-template')">
              <Upload :size="16" /> 导入模板
            </button>
          </div>
        </div>
      </div>

      <div class="config-section">
        <div class="section-header" @click="emit('toggle-section', 'create')">
          <div class="section-title">
            <Plus :size="18" />
            <span>创建新世界书</span>
          </div>
          <ChevronDown v-if="expandedSections.create" :size="16" class="chevron" />
          <ChevronRight v-else :size="16" class="chevron" />
        </div>
        <div v-if="expandedSections.create" class="section-content">
          <p class="config-hint">
            创建新的世界书。这将生成一个包含基础结构的空世界书文件。
          </p>
          <div class="field-row">
            <div class="field flex-2">
              <label>世界书名称 *</label>
              <input
                :value="worldMeta.name"
                type="text"
                placeholder="输入世界书名称"
                @input="updateWorldMetaField('name', ($event.target as HTMLInputElement).value)"
              />
            </div>
            <div class="field flex-1">
              <label>版本</label>
              <input
                :value="worldMeta.version"
                type="text"
                placeholder="1.0.0"
                @input="updateWorldMetaField('version', ($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>
          <div class="field-row">
            <div class="field flex-1">
              <label>默认语言</label>
              <input
                :value="worldMeta.default_language"
                type="text"
                placeholder="zh-CN"
                @input="updateWorldMetaField('default_language', ($event.target as HTMLInputElement).value)"
              />
            </div>
            <div class="field flex-1">
              <label>玩家角色ID（可选）</label>
              <input
                :value="worldMeta.player_character_id"
                type="text"
                placeholder="char-001"
                @input="updateWorldMetaField('player_character_id', ($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>
          <div class="field">
            <label>作者</label>
            <input
              :value="worldMeta.author"
              type="text"
              placeholder="输入作者名称"
              @input="updateWorldMetaField('author', ($event.target as HTMLInputElement).value)"
            />
          </div>
          <div class="field">
            <label>描述</label>
            <textarea
              :value="worldMeta.description"
              rows="3"
              placeholder="输入世界书描述"
              @input="updateWorldMetaField('description', ($event.target as HTMLTextAreaElement).value)"
            />
          </div>
          <div class="field">
            <label>标签（逗号分隔）</label>
            <input
              :value="worldMeta.tagsText"
              type="text"
              placeholder="奇幻, 冒险, 黑暗"
              @input="updateWorldMetaField('tagsText', ($event.target as HTMLInputElement).value)"
            />
          </div>
          <div class="section-actions">
            <button class="btn-primary" @click="emit('create-world')" :disabled="!worldMeta.name.trim()">
              <Plus :size="16" /> 创建新世界书
            </button>
            <button class="btn-secondary" @click="emit('open-import-wizard')">
              <Upload :size="16" /> 文本生成世界书
            </button>
            <button class="btn-secondary" @click="emit('open-export-dialog')">
              <Download :size="16" /> 导出当前世界书
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.worldbook-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.worldbook-header {
  padding: 20px 30px;
  border-bottom: 1px solid var(--border-default);
  background-color: var(--bg-surface);
}

.worldbook-header h2 {
  margin: 0 0 10px 0;
  font-size: 20px;
  font-weight: normal;
  color: var(--text-primary);
}

.worldbook-hint {
  color: var(--text-secondary);
  font-size: 13px;
  margin: 0;
}

.worldbook-content {
  flex: 1;
  padding: 30px;
  overflow-y: auto;
  max-width: 800px;
}

.config-section {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  margin-bottom: 15px;
  overflow: hidden;
}

.section-header {
  padding: 15px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: all var(--motion-base) ease;
}

.section-header:hover {
  background: var(--accent-primary-weak);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  color: var(--text-primary);
}

.section-content {
  padding: 20px;
  border-top: 1px solid var(--border-default);
}

.config-hint {
  color: var(--text-secondary);
  font-size: 13px;
  margin-bottom: 20px;
  padding: 15px;
  background-color: var(--accent-gold-weak);
  border-radius: 6px;
  border-left: 3px solid var(--accent-gold);
  line-height: 1.6;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.template-item {
  position: relative;
  background-color: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 15px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  transition: all var(--motion-base) ease;
}

.template-item.selected {
  border-color: var(--accent-gold);
  background-color: var(--accent-gold-weak);
}

.template-item:hover {
  border-color: var(--accent-primary);
}

.template-name {
  font-size: 13px;
  color: var(--text-primary);
  text-align: center;
}

.btn-delete-template {
  position: absolute;
  top: 6px;
  right: 6px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  opacity: 0;
  transition: all var(--motion-base) ease;
}

.template-item:hover .btn-delete-template {
  opacity: 1;
}

.btn-delete-template:hover {
  color: var(--state-danger);
  background: var(--bg-hover);
}

.no-templates {
  grid-column: 1 / -1;
  padding: 30px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  border: 1px dashed var(--border-default);
  border-radius: 6px;
}

.section-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 15px;
}

.btn-primary {
  background-color: var(--accent-gold-weak);
  color: var(--accent-gold);
  border: 1px solid var(--accent-gold);
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all var(--motion-base) ease;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-gold);
  color: var(--bg-surface);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background-color: var(--bg-elevated);
  color: var(--text-secondary);
  border: 1px solid var(--border-strong);
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all var(--motion-base) ease;
}

.btn-secondary:hover {
  color: var(--text-primary);
  border-color: var(--accent-primary);
}

.field-row {
  display: flex;
  gap: 15px;
  margin-bottom: 15px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field.flex-1 {
  flex: 1;
}

.field.flex-2 {
  flex: 2;
}

.field label {
  font-size: 12px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.field input,
.field textarea {
  background-color: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  padding: 10px 12px;
  color: var(--text-primary);
  font-size: 14px;
  transition: all var(--motion-base) ease;
}

.field input:focus,
.field textarea:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px var(--accent-primary-weak);
  outline: none;
}
</style>
