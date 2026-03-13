<script setup lang="ts">
import type { CustomCard } from '@shared/Interface'
import { Plus, Trash2 } from 'lucide-vue-next'

const props = defineProps<{
  card: CustomCard
}>()

function addTag() {
  if (!props.card.tags) props.card.tags = []
  props.card.tags.push('')
}
function removeTag(idx: number) {
  props.card.tags.splice(idx, 1)
}
</script>

<template>
  <div class="editor-fields">
    <div class="form-group">
      <label>标题</label>
      <input type="text" v-model="card.title" />
    </div>
    <div class="form-group">
      <label>分类 (Category)</label>
      <input type="text" v-model="card.category" />
    </div>
    <div class="form-group">
      <label>内容</label>
      <textarea v-model="card.content" rows="10"></textarea>
    </div>
    <div class="list-section">
      <div class="section-header">
        <label>标签 (Tags)</label>
        <button class="btn-add" @click="addTag"><Plus :size="14" /></button>
      </div>
      <div v-for="(t, idx) in card.tags" :key="idx" class="list-item">
        <input type="text" v-model="card.tags[idx]" placeholder="输入标签..." />
        <button class="btn-remove" @click="removeTag(idx)"><Trash2 :size="14" /></button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-fields { display: flex; flex-direction: column; gap: 4px; }
.form-group { margin-bottom: 12px; }
.form-group label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 5px; }
.form-group input[type="text"],
.form-group textarea {
  width: 100%; background: var(--bg-elevated); border: 1px solid var(--border-default);
  color: var(--text-primary); padding: 8px; border-radius: 4px; outline: none; box-sizing: border-box;
  transition: all var(--motion-base) ease;
}
.form-group input:focus, .form-group textarea:focus {
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
</style>
