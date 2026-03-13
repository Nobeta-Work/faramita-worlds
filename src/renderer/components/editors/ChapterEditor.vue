<script setup lang="ts">
import type { ChapterCard } from '@shared/Interface'
import { Plus, Trash2 } from 'lucide-vue-next'

const props = defineProps<{
  card: ChapterCard
}>()

const emit = defineEmits<{
  (e: 'activate-chapter'): void
}>()

function addReward() {
  if (!props.card.rewards) props.card.rewards = []
  props.card.rewards.push('')
}
function removeReward(idx: number) {
  props.card.rewards?.splice(idx, 1)
}

function addTag() {
  if (!props.card.tags) props.card.tags = []
  props.card.tags.push('')
}
function removeTag(idx: number) {
  props.card.tags?.splice(idx, 1)
}

function addPlotPoint() {
  props.card.plot_points.push({
    id: `plot-${Date.now()}`,
    title: '',
    content: '',
    secret_notes: ''
  })
}
function removePlotPoint(idx: number) {
  props.card.plot_points.splice(idx, 1)
}
</script>

<template>
  <div class="editor-fields">
    <div class="form-row">
      <div class="form-group">
        <label>标题</label>
        <input type="text" v-model="card.title" />
      </div>
      <div class="form-group">
        <label>状态</label>
        <div class="status-display">
          <span class="status-badge" :class="card.status">
            {{ card.status === 'pending' ? '准备中' : card.status === 'active' ? '进行中（当前章节）' : '已完成' }}
          </span>
          <button v-if="card.status !== 'active'" class="btn-activate" @click="emit('activate-chapter')">
            设为当前章节
          </button>
        </div>
      </div>
    </div>

    <div class="form-group">
      <label>章节简介 (Summary)</label>
      <textarea v-model="card.summary" rows="3" placeholder="简述本章节的核心内容..."></textarea>
    </div>

    <div class="form-group">
      <label>核心目标 (Objective)</label>
      <input type="text" v-model="card.objective" placeholder="如：逃离地牢、寻找失踪的村民..." />
    </div>

    <!-- Rewards -->
    <div class="list-section">
      <div class="section-header">
        <label>潜在奖励 (Rewards)</label>
        <button class="btn-add" @click="addReward"><Plus :size="14" /></button>
      </div>
      <div v-for="(reward, idx) in card.rewards" :key="idx" class="list-item">
        <input type="text" v-model="card.rewards![idx]" placeholder="奖励内容..." />
        <button class="btn-remove" @click="removeReward(idx)"><Trash2 :size="14" /></button>
      </div>
    </div>

    <!-- Plot Points -->
    <div class="plot-points">
      <div class="section-header">
        <label class="section-label">剧情点 (Plot Points)</label>
        <button class="btn-add" @click="addPlotPoint"><Plus :size="14" /></button>
      </div>
      <div v-for="(point, index) in card.plot_points" :key="point.id" class="plot-point-item">
        <div class="item-header">
          <input type="text" v-model="point.title" placeholder="剧情点标题" />
          <button class="btn-remove" @click="removePlotPoint(index)"><Trash2 :size="14" /></button>
        </div>
        <textarea v-model="point.content" placeholder="主要内容" rows="3"></textarea>
        <textarea v-model="point.secret_notes" placeholder="秘密笔记 (AI可见)" rows="2"></textarea>
      </div>
    </div>

    <!-- Tags -->
    <div class="list-section">
      <div class="section-header">
        <label>章节标签 (Tags)</label>
        <button class="btn-add" @click="addTag"><Plus :size="14" /></button>
      </div>
      <div v-for="(t, idx) in card.tags" :key="idx" class="list-item">
        <input type="text" v-model="card.tags![idx]" placeholder="标签..." />
        <button class="btn-remove" @click="removeTag(idx)"><Trash2 :size="14" /></button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-fields { display: flex; flex-direction: column; gap: 4px; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
.form-group { margin-bottom: 12px; }
.form-group.inline { display: flex; gap: 20px; }
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
.section-label { font-size: 13px; color: var(--accent-gold); font-weight: 600; }
.list-section { margin-bottom: 16px; }
.list-item { display: flex; gap: 10px; margin-bottom: 8px; align-items: flex-start; }
.list-item input { flex: 1; background: var(--bg-elevated); border: 1px solid var(--border-default); color: var(--text-primary); padding: 8px; border-radius: 4px; outline: none; box-sizing: border-box; }
.btn-add, .btn-remove { background: none; border: none; color: var(--text-muted); cursor: pointer; }
.btn-add:hover { color: var(--state-success); }
.btn-remove:hover { color: var(--state-danger); }
.plot-point-item { background: transparent; border: 1px solid var(--border-default); padding: 10px; border-radius: 4px; margin-bottom: 10px; }
.item-header { display: flex; gap: 10px; margin-bottom: 8px; }
.item-header input { flex: 1; background: var(--bg-elevated); border: 1px solid var(--border-default); color: var(--text-primary); padding: 8px; border-radius: 4px; outline: none; box-sizing: border-box; }
textarea { resize: vertical; width: 100%; background: var(--bg-elevated); border: 1px solid var(--border-default); color: var(--text-primary); padding: 8px; border-radius: 4px; outline: none; box-sizing: border-box; }
.status-display { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.status-badge { font-size: 12px; padding: 4px 10px; border-radius: 4px; }
.status-badge.pending { background: color-mix(in srgb, var(--text-muted) 15%, transparent); color: var(--text-muted); }
.status-badge.active { background: color-mix(in srgb, var(--state-success) 20%, transparent); color: var(--state-success); }
.status-badge.completed { background: color-mix(in srgb, var(--accent-primary) 15%, transparent); color: var(--accent-primary); }
.btn-activate { font-size: 12px; padding: 4px 10px; border-radius: 4px; border: 1px solid var(--accent-primary); background: transparent; color: var(--accent-primary); cursor: pointer; transition: all 0.15s; }
.btn-activate:hover { background: var(--accent-primary); color: var(--bg-primary); }
</style>
