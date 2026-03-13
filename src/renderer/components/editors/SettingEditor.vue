<script setup lang="ts">
import type { SettingCard } from '@shared/Interface'
import { Plus, Trash2 } from 'lucide-vue-next'

const props = defineProps<{
  card: SettingCard
}>()

function addTag() {
  if (!props.card.tags) props.card.tags = []
  props.card.tags.push('')
}
function removeTag(idx: number) {
  props.card.tags?.splice(idx, 1)
}

function addSuffixName() {
  if (!props.card.suffix_names) props.card.suffix_names = []
  props.card.suffix_names.push('')
}
function removeSuffixName(idx: number) {
  props.card.suffix_names?.splice(idx, 1)
}

function addScalingMode() {
  if (!props.card.scaling_modes) props.card.scaling_modes = {}
  let idx = 1
  let name = `新阵营-${idx}`
  while (props.card.scaling_modes[name]) { idx++; name = `新阵营-${idx}` }
  props.card.scaling_modes[name] = { step: 20, prefix_names: [''] }
}
function removeScalingMode(key: string) {
  if (props.card.scaling_modes) delete props.card.scaling_modes[key]
}
function addPrefixName(modeKey: string) {
  props.card.scaling_modes?.[modeKey]?.prefix_names.push('')
}
function removePrefixName(modeKey: string, idx: number) {
  props.card.scaling_modes?.[modeKey]?.prefix_names.splice(idx, 1)
}
</script>

<template>
  <div class="editor-fields">
    <div class="form-group">
      <label>标题</label>
      <input type="text" v-model="card.title" />
    </div>
    <div class="form-group">
      <label>类别 (Category)</label>
      <select v-model="card.category">
        <option value="background">背景故事</option>
        <option value="race">种族设定</option>
        <option value="class">职业系统</option>
        <option value="level">等级/位阶</option>
        <option value="location">地理位置</option>
        <option value="faction">势力阵营</option>
        <option value="item">物品</option>
        <option value="lore">传说</option>
        <option value="skill">技能</option>
        <option value="rule">规则</option>
      </select>
    </div>
    <div class="form-group">
      <label>内容</label>
      <textarea v-model="card.content" rows="6"></textarea>
    </div>

    <!-- Class: suffix names -->
    <template v-if="card.category === 'class'">
      <div class="form-group">
        <label>等级跨度 (Step)</label>
        <input type="number" v-model.number="card.step" />
      </div>
      <div class="list-section">
        <div class="section-header">
          <label>职业后缀 (Suffix Names)</label>
          <button class="btn-add" @click="addSuffixName"><Plus :size="14" /></button>
        </div>
        <div v-for="(name, idx) in card.suffix_names" :key="idx" class="list-item">
          <input type="text" v-model="card.suffix_names![idx]" placeholder="如：学徒、法师..." />
          <button class="btn-remove" @click="removeSuffixName(idx)"><Trash2 :size="14" /></button>
        </div>
      </div>
    </template>

    <!-- Level: scaling modes -->
    <template v-if="card.category === 'level'">
      <div class="form-group">
        <label>默认阵营/模式</label>
        <input type="text" v-model="card.default_mode" />
      </div>
      <div class="list-section">
        <div class="section-header">
          <label>从属/阵营前缀配置</label>
          <button class="btn-add" @click="addScalingMode"><Plus :size="14" /> 添加阵营</button>
        </div>
        <template v-if="card.scaling_modes">
          <div v-for="(mode, key) in card.scaling_modes" :key="key" class="mode-item">
            <div class="mode-header">
              <strong>{{ key }}</strong>
              <div class="mode-actions">
                <span>Step: </span>
                <input type="number" v-model.number="mode.step" class="small-input" />
                <button class="btn-remove" @click="removeScalingMode(String(key))"><Trash2 :size="12" /></button>
              </div>
            </div>
            <div class="prefix-list">
              <div v-for="(p, pIdx) in mode.prefix_names" :key="pIdx" class="list-item small">
                <input type="text" v-model="mode.prefix_names[pIdx]" placeholder="前缀名" />
                <button class="btn-remove" @click="removePrefixName(String(key), Number(pIdx))"><Trash2 :size="12" /></button>
              </div>
              <button class="btn-add-text" @click="addPrefixName(String(key))">+ 添加前缀</button>
            </div>
          </div>
        </template>
      </div>
    </template>

    <!-- Tags -->
    <div class="list-section">
      <div class="section-header">
        <label>标签 (Tags)</label>
        <button class="btn-add" @click="addTag"><Plus :size="14" /></button>
      </div>
      <div v-for="(t, idx) in card.tags" :key="idx" class="list-item">
        <input type="text" v-model="card.tags![idx]" placeholder="输入标签..." />
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
.list-item.small { margin-bottom: 4px; }
.btn-add, .btn-remove { background: none; border: none; color: var(--text-muted); cursor: pointer; }
.btn-add:hover { color: var(--state-success); }
.btn-remove:hover { color: var(--state-danger); }
.btn-add-text { background: none; border: 1px dashed var(--border-strong); color: var(--text-secondary); font-size: 11px; padding: 4px 8px; width: 100%; cursor: pointer; margin-top: 5px; transition: all var(--motion-base); }
.btn-add-text:hover { color: var(--accent-gold); border-color: var(--accent-gold); }
.mode-item { background: transparent; border: 1px solid var(--border-default); padding: 10px; border-radius: 4px; margin-bottom: 10px; }
.mode-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid var(--border-default); padding-bottom: 5px; }
.mode-actions { display: flex; align-items: center; gap: 5px; font-size: 12px; }
.small-input { width: 40px !important; padding: 2px !important; text-align: center; }
textarea { resize: vertical; }
</style>
