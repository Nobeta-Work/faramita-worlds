<script setup lang="ts">
import { ref } from 'vue'
import type { TraitTag } from '@shared/Interface'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-vue-next'

const props = defineProps<{
  traits: TraitTag[]
  characterName?: string
  characterClass?: string
}>()

const emit = defineEmits<{
  update: [traits: TraitTag[]]
}>()

const typeSymbols: Record<TraitTag['type'], string> = {
  strength: '✦',
  flaw: '✧',
  bond: '♦',
  mark: '★'
}

const typeLabels: Record<TraitTag['type'], string> = {
  strength: '优势',
  flaw: '缺陷',
  bond: '羁绊',
  mark: '印记'
}

const sourceLabels: Record<TraitTag['source'], string> = {
  origin: '初始',
  story: '剧情',
  player: '玩家'
}

// --- Editing state ---
const editingIndex = ref<number | null>(null)
const editForm = ref<TraitTag>({
  text: '',
  type: 'strength',
  source: 'player',
  weight: 1,
  active: true
})

function startEdit(index: number) {
  editingIndex.value = index
  editForm.value = { ...props.traits[index] }
}

function startAdd() {
  editingIndex.value = -1
  editForm.value = {
    text: '',
    type: 'strength',
    source: 'player',
    weight: 1,
    active: true
  }
}

function cancelEdit() {
  editingIndex.value = null
}

function confirmEdit() {
  if (!editForm.value.text.trim()) return
  const updated = [...props.traits]
  if (editingIndex.value === -1) {
    updated.push({ ...editForm.value })
  } else if (editingIndex.value !== null) {
    updated[editingIndex.value] = { ...editForm.value }
  }
  emit('update', updated)
  editingIndex.value = null
}

function removeTag(index: number) {
  const updated = props.traits.filter((_, i) => i !== index)
  emit('update', updated)
}

function toggleActive(index: number) {
  const updated = [...props.traits]
  updated[index] = { ...updated[index], active: !updated[index].active }
  emit('update', updated)
}

function weightClass(w: number) {
  return w >= 3 ? 'weight-3' : w >= 2 ? 'weight-2' : 'weight-1'
}
</script>

<template>
  <div class="trait-tag-editor">
    <!-- Tag list -->
    <div class="tag-list">
      <div
        v-for="(tag, idx) in traits"
        :key="idx"
        class="tag-row"
        :class="[`type-${tag.type}`, { inactive: !tag.active }]"
      >
        <span class="tag-symbol">{{ typeSymbols[tag.type] }}</span>
        <span class="tag-text" :class="weightClass(tag.weight)">{{ tag.text }}</span>
        <sup class="tag-weight">{{ tag.weight }}</sup>
        <span class="tag-source">({{ sourceLabels[tag.source] }})</span>
        <div class="tag-actions">
          <button class="btn-icon" @click="toggleActive(idx)" :title="tag.active ? '停用' : '启用'">
            <span :class="tag.active ? 'dot-active' : 'dot-inactive'" />
          </button>
          <button class="btn-icon" @click="startEdit(idx)" title="编辑"><Pencil :size="12" /></button>
          <button class="btn-icon btn-danger" @click="removeTag(idx)" title="删除"><Trash2 :size="12" /></button>
        </div>
      </div>

      <button class="btn-add-tag" @click="startAdd" v-if="editingIndex === null">
        <Plus :size="14" /> 添加标签
      </button>
    </div>

    <!-- Inline edit form -->
    <div v-if="editingIndex !== null" class="edit-form">
      <div class="form-row">
        <input
          type="text"
          v-model="editForm.text"
          placeholder="标签名称"
          class="input-text"
          @keyup.enter="confirmEdit"
        />
        <select v-model="editForm.type" class="input-select">
          <option v-for="(label, key) in typeLabels" :key="key" :value="key">
            {{ typeSymbols[key] }} {{ label }}
          </option>
        </select>
      </div>
      <div class="form-row">
        <select v-model="editForm.source" class="input-select">
          <option v-for="(label, key) in sourceLabels" :key="key" :value="key">{{ label }}</option>
        </select>
        <div class="weight-control">
          <label>权重</label>
          <input type="range" min="1" max="3" v-model.number="editForm.weight" />
          <span>{{ editForm.weight }}</span>
        </div>
        <label class="active-check">
          <input type="checkbox" v-model="editForm.active" /> 激活
        </label>
      </div>
      <div class="form-actions">
        <button class="btn-confirm" @click="confirmEdit"><Check :size="14" /> 确认</button>
        <button class="btn-cancel" @click="cancelEdit"><X :size="14" /> 取消</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.trait-tag-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tag-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tag-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--bg-elevated);
  transition: opacity var(--motion-base);
}

.tag-row.inactive {
  opacity: 0.45;
}

.tag-symbol {
  font-size: 14px;
}
.type-strength .tag-symbol { color: var(--tag-strength); }
.type-flaw .tag-symbol    { color: var(--tag-flaw); }
.type-bond .tag-symbol    { color: var(--tag-bond); }
.type-mark .tag-symbol    { color: var(--tag-mark); }

.tag-text {
  color: var(--text-primary);
}
.weight-1 { font-size: 13px; }
.weight-2 { font-size: 14px; font-weight: 600; }
.weight-3 { font-size: 15px; font-weight: 700; }

.tag-weight {
  font-size: 10px;
  color: var(--text-muted);
}

.tag-source {
  font-size: 11px;
  color: var(--text-muted);
  margin-left: auto;
}

.tag-actions {
  display: flex;
  gap: 4px;
  margin-left: 8px;
}

.btn-icon {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px;
}
.btn-icon:hover { color: var(--text-primary); }
.btn-icon.btn-danger:hover { color: var(--state-danger); }

.dot-active,
.dot-inactive {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.dot-active { background: var(--state-success); }
.dot-inactive { background: var(--text-muted); }

.btn-add-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: 1px dashed var(--border-strong);
  color: var(--text-secondary);
  font-size: 12px;
  padding: 6px 10px;
  cursor: pointer;
  border-radius: 4px;
  transition: all var(--motion-base);
}
.btn-add-tag:hover {
  color: var(--accent-gold);
  border-color: var(--accent-gold);
}

/* Edit form */
.edit-form {
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.input-text {
  flex: 1;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  color: var(--text-primary);
  padding: 6px 8px;
  border-radius: 4px;
  outline: none;
}
.input-text:focus {
  border-color: var(--accent-primary);
}

.input-select {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  color: var(--text-primary);
  padding: 6px;
  border-radius: 4px;
  outline: none;
}

.weight-control {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}
.weight-control input[type="range"] {
  width: 60px;
}

.active-check {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn-confirm,
.btn-cancel {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.btn-confirm {
  background: var(--accent-primary);
  color: var(--text-on-accent);
}
.btn-cancel {
  background: var(--bg-surface);
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
}
</style>
