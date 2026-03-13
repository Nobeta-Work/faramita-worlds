<script setup lang="ts">
import type { InteractionCard, Difficulty } from '@shared/Interface'
import { Plus, Trash2 } from 'lucide-vue-next'

const props = defineProps<{
  card: InteractionCard
}>()

function addRelatedTag() {
  if (!props.card.related_tags) props.card.related_tags = []
  props.card.related_tags.push('')
}
function removeRelatedTag(idx: number) {
  props.card.related_tags?.splice(idx, 1)
}

function addPrerequisiteTag() {
  if (!props.card.prerequisite_tags) props.card.prerequisite_tags = []
  props.card.prerequisite_tags.push('')
}
function removePrerequisiteTag(idx: number) {
  props.card.prerequisite_tags?.splice(idx, 1)
}
</script>

<template>
  <div class="editor-fields">
    <div class="form-group">
      <label>名称</label>
      <input type="text" v-model="card.name" />
    </div>

    <div class="form-group">
      <label>描述 (Description)</label>
      <textarea v-model="card.description" rows="4" placeholder="交互描述..."></textarea>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>难度 (Difficulty)</label>
        <select v-model="card.difficulty">
          <option value="easy">简单 (Easy)</option>
          <option value="normal">普通 (Normal)</option>
          <option value="hard">困难 (Hard)</option>
          <option value="extreme">极难 (Extreme)</option>
        </select>
      </div>
      <div class="form-group">
        <label>消耗 (Cost)</label>
        <input type="text" v-model="card.cost" placeholder="如：10 MP" />
      </div>
    </div>

    <!-- Related Tags -->
    <div class="list-section">
      <div class="section-header">
        <label>关联标签 (Related Tags)</label>
        <button class="btn-add" @click="addRelatedTag"><Plus :size="14" /></button>
      </div>
      <div v-for="(t, idx) in card.related_tags" :key="idx" class="list-item">
        <input type="text" v-model="card.related_tags![idx]" placeholder="关联特质标签..." />
        <button class="btn-remove" @click="removeRelatedTag(idx)"><Trash2 :size="14" /></button>
      </div>
    </div>

    <!-- Prerequisite Tags -->
    <div class="list-section">
      <div class="section-header">
        <label>前置标签 (Prerequisite Tags)</label>
        <button class="btn-add" @click="addPrerequisiteTag"><Plus :size="14" /></button>
      </div>
      <div v-for="(t, idx) in card.prerequisite_tags" :key="idx" class="list-item">
        <input type="text" v-model="card.prerequisite_tags![idx]" placeholder="前置特质标签..." />
        <button class="btn-remove" @click="removePrerequisiteTag(idx)"><Trash2 :size="14" /></button>
      </div>
    </div>

    <!-- Deprecated fields (migration period) -->
    <details class="deprecated-section">
      <summary>旧版字段 (迁移期保留)</summary>
      <div class="form-group">
        <label>判定逻辑 (D20 Logic) <span class="deprecated-badge">@deprecated</span></label>
        <input type="text" v-model="(card as any).d20_logic" placeholder="格式：d20 [成功阈值]" />
      </div>
      <div class="form-group">
        <label>效果描述 <span class="deprecated-badge">@deprecated</span></label>
        <textarea v-model="(card as any).effect" rows="3"></textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>最低等级 <span class="deprecated-badge">@deprecated</span></label>
          <input type="number" v-model.number="(card as any).min_level" />
        </div>
        <div class="form-group">
          <label>元素属性 <span class="deprecated-badge">@deprecated</span></label>
          <input type="text" v-model="(card as any).element" />
        </div>
      </div>
    </details>
  </div>
</template>

<style scoped>
.editor-fields { display: flex; flex-direction: column; gap: 4px; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
.form-group { margin-bottom: 12px; }
.form-group label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 5px; }
.form-group input[type="text"],
.form-group input[type="number"],
.form-group textarea,
.form-group select {
  width: 100%; background: var(--bg-elevated); border: 1px solid var(--border-default);
  color: var(--text-primary); padding: 8px; border-radius: 4px; outline: none; box-sizing: border-box;
  transition: all var(--motion-base) ease;
}
.form-group input:focus, .form-group textarea:focus, .form-group select:focus {
  border-color: var(--accent-primary); box-shadow: 0 0 0 2px var(--accent-primary-weak);
}
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.list-section { margin-bottom: 16px; }
.list-item { display: flex; gap: 10px; margin-bottom: 8px; align-items: flex-start; }
.list-item input { flex: 1; background: var(--bg-elevated); border: 1px solid var(--border-default); color: var(--text-primary); padding: 8px; border-radius: 4px; outline: none; box-sizing: border-box; }
.btn-add, .btn-remove { background: none; border: none; color: var(--text-muted); cursor: pointer; }
.btn-add:hover { color: var(--state-success); }
.btn-remove:hover { color: var(--state-danger); }
textarea { resize: vertical; }
.deprecated-section { margin-top: 12px; border: 1px dashed var(--border-default); border-radius: 4px; padding: 8px; }
.deprecated-section summary { font-size: 12px; color: var(--text-muted); cursor: pointer; margin-bottom: 8px; }
.deprecated-badge { font-size: 10px; color: var(--state-danger); opacity: 0.7; }
</style>
