<script setup lang="ts">
import { ref, watch, onUnmounted, TransitionGroup, computed } from 'vue'
import CardEditor from './CardEditor.vue'
import { Plus, Search, RefreshCw, Trash2, ChevronRight, CheckSquare, Square, X } from 'lucide-vue-next'

interface CategoryItem {
  id: string
  name: string
}

const props = defineProps<{
  categories: CategoryItem[]
  activeCategory: string
  settingCategories: Array<{ id: string; name: string }>
  activeSettingCategory: string
  searchQuery: string
  editingCard: any | null
  filteredCards: any[]
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'update:searchQuery', value: string): void
  (e: 'update:activeSettingCategory', value: string): void
  (e: 'update:editingCard', value: any | null): void
  (e: 'sync'): void
  (e: 'add-new'): void
  (e: 'save-card', value: any): void
  (e: 'edit-card', value: any): void
  (e: 'delete-card', id: string): void
  (e: 'batch-delete', ids: string[]): void
  (e: 'batch-set-always-active', ids: string[], value: boolean): void
  (e: 'batch-set-priority', ids: string[], priority: number): void
  (e: 'activate-chapter'): void
}>()

// --- Search debounce ---
const localSearch = ref(props.searchQuery)
let debounceTimer: number | null = null

watch(() => props.searchQuery, (v) => { localSearch.value = v })

function onSearchInput(e: Event) {
  const val = (e.target as HTMLInputElement).value
  localSearch.value = val
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(() => emit('update:searchQuery', val), 300)
}

onUnmounted(() => { if (debounceTimer) clearTimeout(debounceTimer) })

// --- Multi-select / batch mode ---
const isMultiSelectMode = ref(false)
const selectedCardIds = ref<Set<string>>(new Set())
const batchPriorityValue = ref(50)

const selectedCount = computed(() => selectedCardIds.value.size)

const toggleMultiSelect = () => {
  isMultiSelectMode.value = !isMultiSelectMode.value
  if (!isMultiSelectMode.value) selectedCardIds.value.clear()
}

const toggleCardSelection = (id: string) => {
  if (selectedCardIds.value.has(id)) {
    selectedCardIds.value.delete(id)
  } else {
    selectedCardIds.value.add(id)
  }
  // Force reactivity
  selectedCardIds.value = new Set(selectedCardIds.value)
}

const selectAll = () => {
  props.filteredCards.forEach(c => selectedCardIds.value.add(c.id))
  selectedCardIds.value = new Set(selectedCardIds.value)
}

const deselectAll = () => {
  selectedCardIds.value.clear()
  selectedCardIds.value = new Set(selectedCardIds.value)
}

const handleBatchDelete = () => {
  if (selectedCount.value === 0) return
  if (confirm(`确定要删除选中的 ${selectedCount.value} 张卡片吗？此操作不可撤销。`)) {
    emit('batch-delete', Array.from(selectedCardIds.value))
    selectedCardIds.value.clear()
    selectedCardIds.value = new Set(selectedCardIds.value)
  }
}

const handleBatchSetAlwaysActive = (value: boolean) => {
  if (selectedCount.value === 0) return
  emit('batch-set-always-active', Array.from(selectedCardIds.value), value)
}

const handleBatchSetPriority = () => {
  if (selectedCount.value === 0) return
  emit('batch-set-priority', Array.from(selectedCardIds.value), batchPriorityValue.value)
}

// --- Type badge helpers ---
const typeBadge: Record<string, { label: string; cls: string }> = {
  character: { label: '角色', cls: 'badge-character' },
  setting:   { label: '设定', cls: 'badge-setting' },
  chapter:   { label: '章节', cls: 'badge-chapter' },
  interaction: { label: '交互', cls: 'badge-interaction' },
  custom:    { label: '自定义', cls: 'badge-custom' }
}
</script>

<template>
  <div class="main-content">
    <div class="toolbar">
      <div class="search-box">
        <Search :size="16" />
        <input :value="localSearch" placeholder="搜索卡片..." @input="onSearchInput" />
      </div>
      <div class="sync-section">
        <button class="btn-sync" @click="emit('sync')" :disabled="loading" title="从 JSON 模板同步新增项">
          <RefreshCw :size="16" :class="{ spinning: loading }" />
          同步模板
        </button>
      </div>
      <button class="btn-secondary" @click="toggleMultiSelect" :class="{ active: isMultiSelectMode }">
        <CheckSquare :size="16" /> {{ isMultiSelectMode ? '退出批量' : '批量操作' }}
      </button>
      <button class="btn-primary" @click="emit('add-new')" :disabled="loading">
        <Plus :size="16" /> 新增{{ categories.find(c => c.id === activeCategory)?.name }}
      </button>
    </div>

    <!-- Batch action bar -->
    <transition name="batch-bar">
      <div v-if="isMultiSelectMode" class="batch-bar">
        <div class="batch-info">
          <span>已选 <strong>{{ selectedCount }}</strong> / {{ filteredCards.length }}</span>
          <button class="btn-link" @click="selectAll">全选</button>
          <button class="btn-link" @click="deselectAll">取消全选</button>
        </div>
        <div class="batch-actions">
          <button class="btn-batch" @click="handleBatchSetAlwaysActive(true)" :disabled="selectedCount === 0">
            设为常驻
          </button>
          <button class="btn-batch" @click="handleBatchSetAlwaysActive(false)" :disabled="selectedCount === 0">
            取消常驻
          </button>
          <div class="batch-priority-group">
            <input type="number" v-model.number="batchPriorityValue" min="0" max="100" class="priority-input" />
            <button class="btn-batch" @click="handleBatchSetPriority" :disabled="selectedCount === 0">
              设置优先级
            </button>
          </div>
          <button class="btn-batch btn-batch-danger" @click="handleBatchDelete" :disabled="selectedCount === 0">
            <Trash2 :size="14" /> 批量删除
          </button>
        </div>
      </div>
    </transition>

    <div v-if="activeCategory === 'setting'" class="secondary-tabs">
      <div
        v-for="scat in settingCategories"
        :key="scat.id"
        class="tab-item"
        :class="{ active: activeSettingCategory === scat.id }"
        @click="emit('update:activeSettingCategory', scat.id)"
      >
        {{ scat.name }}
      </div>
    </div>

    <div class="content-area">
      <template v-if="editingCard">
        <div class="breadcrumb">
          <span class="crumb clickable" @click="emit('update:editingCard', null)">卡片</span>
          <ChevronRight :size="14" />
          <span class="crumb current">{{ (editingCard as any).name || (editingCard as any).title || editingCard.id }}</span>
          <div class="breadcrumb-actions">
            <button class="btn-secondary" @click="emit('update:editingCard', null)">返回列表</button>
          </div>
        </div>
        <div class="editor-full">
          <CardEditor
            :key="editingCard.id"
            :card="editingCard"
            @save="(card) => emit('save-card', card)"
            @close="emit('update:editingCard', null)"
            @activate-chapter="emit('activate-chapter')"
          />
        </div>
      </template>
      <template v-else>
        <TransitionGroup name="card-list" tag="div" class="card-grid">
          <div v-for="card in filteredCards" :key="card.id" class="manager-card" :class="{ selected: isMultiSelectMode && selectedCardIds.has(card.id) }" @click="isMultiSelectMode ? toggleCardSelection(card.id) : emit('edit-card', card)">
            <div v-if="isMultiSelectMode" class="card-checkbox" @click.stop="toggleCardSelection(card.id)">
              <CheckSquare v-if="selectedCardIds.has(card.id)" :size="18" class="check-on" />
              <Square v-else :size="18" class="check-off" />
            </div>
            <div class="card-info">
              <div class="card-name">{{ (card as any).name || (card as any).title || card.id }}</div>
              <div class="card-meta">
                <span v-if="typeBadge[card.type]" class="type-badge" :class="typeBadge[card.type].cls">{{ typeBadge[card.type].label }}</span>
                <span class="card-id">{{ card.id }}</span>
              </div>
            </div>
            <button v-if="!isMultiSelectMode" class="btn-delete" @click.stop="emit('delete-card', card.id)">
              <Trash2 :size="16" />
            </button>
          </div>
        </TransitionGroup>
      </template>
    </div>
  </div>
</template>

<style scoped>
.main-content {
  flex: 1;
  padding: 30px;
  overflow-y: auto;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  margin-bottom: 30px;
  gap: 20px;
}

.search-box {
  flex: 1;
  background-color: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 10px;
}

.search-box input {
  background: none;
  border: none;
  color: var(--text-primary);
  padding: 10px 0;
  width: 100%;
  outline: none;
}

.search-box:focus-within {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px var(--accent-primary-weak);
}

.btn-primary {
  background-color: var(--accent-gold-weak);
  color: var(--accent-gold);
  border: 1px solid var(--accent-gold);
  padding: 0 20px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all var(--motion-base) ease;
}

.btn-primary:hover {
  background-color: var(--accent-gold);
  color: var(--bg-surface);
}

.btn-secondary {
  background-color: var(--bg-elevated);
  color: var(--text-secondary);
  border: 1px solid var(--border-strong);
  padding: 0 20px;
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

.btn-sync {
  background-color: var(--bg-surface);
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
  padding: 0 15px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all var(--motion-base) ease;
}

.btn-sync:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--accent-primary);
}

.btn-sync:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sync-section {
  display: flex;
  align-items: center;
  gap: 10px;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spinning {
  animation: spin 2s linear infinite;
}

.secondary-tabs {
  display: flex;
  gap: 15px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border-default);
  padding-bottom: 10px;
}

.secondary-tabs .tab-item {
  padding: 6px 12px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;
  transition: all var(--motion-base) ease;
}

.secondary-tabs .tab-item:hover {
  background: var(--accent-primary-weak);
  color: var(--text-primary);
}

.secondary-tabs .tab-item.active {
  background-color: var(--accent-gold);
  color: var(--bg-surface);
  font-weight: bold;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 20px;
}

.manager-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-default);
  padding: 15px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all var(--motion-base) ease;
}

.manager-card:hover {
  border-color: var(--accent-primary);
}

.card-name {
  font-weight: bold;
  margin-bottom: 4px;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-id {
  font-size: 12px;
  color: var(--text-muted);
}

.type-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.badge-character { background: var(--tag-strength); color: var(--bg-surface); }
.badge-setting   { background: var(--tag-bond); color: var(--bg-surface); }
.badge-chapter   { background: var(--accent-gold); color: var(--bg-surface); }
.badge-interaction { background: var(--accent-primary); color: var(--bg-surface); }
.badge-custom    { background: var(--text-muted); color: var(--bg-surface); }

.btn-delete {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
}

.btn-delete:hover {
  color: var(--state-danger);
}

.breadcrumb {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-default);
  margin-bottom: 16px;
}

.crumb {
  font-size: 13px;
  color: var(--text-secondary);
}

.crumb.clickable {
  cursor: pointer;
}

.crumb.clickable:hover {
  color: var(--text-primary);
}

.crumb.current {
  color: var(--accent-gold);
}

.breadcrumb-actions {
  margin-left: auto;
  display: flex;
  gap: 10px;
}

.editor-full {
  background-color: transparent;
  border: none;
  padding: 15px;
}

.content-area {
  margin-top: 16px;
}

/* Card list transitions */
.card-list-enter-active { transition: all 0.3s ease; }
.card-list-leave-active { transition: all 0.2s ease; position: absolute; }
.card-list-enter-from { opacity: 0; transform: translateY(12px); }
.card-list-leave-to { opacity: 0; transform: scale(0.95); }
.card-list-move { transition: transform 0.3s ease; }

/* Batch mode */
.btn-secondary.active {
  background-color: var(--accent-primary-weak);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.batch-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  margin-bottom: 16px;
  gap: 12px;
  flex-wrap: wrap;
}

.batch-info {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--text-secondary);
}
.batch-info strong {
  color: var(--accent-gold);
}

.btn-link {
  background: none;
  border: none;
  color: var(--accent-primary);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
}
.btn-link:hover {
  text-decoration: underline;
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-batch {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
  padding: 5px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
}
.btn-batch:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--accent-primary);
}
.btn-batch:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.btn-batch-danger:hover:not(:disabled) {
  color: var(--state-danger);
  border-color: var(--state-danger);
}

.batch-priority-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.priority-input {
  width: 56px;
  background: var(--bg-input);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  padding: 4px 6px;
  color: var(--text-primary);
  font-size: 12px;
  text-align: center;
}

.manager-card.selected {
  border-color: var(--accent-primary);
  background-color: var(--accent-primary-weak);
}

.card-checkbox {
  display: flex;
  align-items: center;
  margin-right: 8px;
}
.check-on { color: var(--accent-primary); }
.check-off { color: var(--text-muted); }

.batch-bar-enter-active, .batch-bar-leave-active {
  transition: all 0.25s ease;
}
.batch-bar-enter-from, .batch-bar-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
