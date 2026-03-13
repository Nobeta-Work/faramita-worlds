<script setup lang="ts">
import { ref, computed } from 'vue'
import { useWorldStore } from '../store/world'
import { db } from '../db/db'
import { Download, X, FileJson, CheckCircle, AlertCircle } from 'lucide-vue-next'

const worldStore = useWorldStore()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const exportStatus = ref<'idle' | 'exporting' | 'success' | 'error'>('idle')
const statusMessage = ref('')
const includeCards = ref({
  character: true,
  setting: true,
  chapter: true,
  interaction: true,
  custom: true
})

const worldName = computed(() => worldStore.meta?.name || '未命名世界书')

const cardCounts = computed(() => {
  const cards = worldStore.cards
  return {
    character: cards.filter(c => c.type === 'character').length,
    setting: cards.filter(c => c.type === 'setting').length,
    chapter: cards.filter(c => c.type === 'chapter').length,
    interaction: cards.filter(c => c.type === 'interaction').length,
    custom: cards.filter(c => c.type === 'custom').length
  }
})

const totalSelected = computed(() => {
  let count = 0
  for (const [type, included] of Object.entries(includeCards.value)) {
    if (included) count += cardCounts.value[type as keyof typeof cardCounts.value] || 0
  }
  return count
})

const cardTypeLabels: Record<string, string> = {
  character: '人物卡',
  setting: '设定卡',
  chapter: '章节卡',
  interaction: '交互卡',
  custom: '自定义卡'
}

const handleExport = async () => {
  exportStatus.value = 'exporting'
  statusMessage.value = '正在导出...'

  try {
    const metaRecord = await db.settings.get('world_meta')
    const meta = metaRecord ? metaRecord.value : worldStore.meta
    const allCards = await db.world_cards.toArray()

    const data: Record<string, any> = {
      world_meta: meta,
      entries: {} as Record<string, any[]>
    }

    if (includeCards.value.setting) data.entries.setting_cards = allCards.filter(c => c.type === 'setting')
    else data.entries.setting_cards = []

    if (includeCards.value.chapter) data.entries.chapter_cards = allCards.filter(c => c.type === 'chapter')
    else data.entries.chapter_cards = []

    if (includeCards.value.character) data.entries.character_cards = allCards.filter(c => c.type === 'character')
    else data.entries.character_cards = []

    if (includeCards.value.interaction) data.entries.interaction_cards = allCards.filter(c => c.type === 'interaction')
    else data.entries.interaction_cards = []

    if (includeCards.value.custom) data.entries.custom_cards = allCards.filter(c => c.type === 'custom')
    else data.entries.custom_cards = []

    const suggestedName = `${meta?.name || 'world'}_export.json`
    const content = JSON.stringify(data, null, 2)
    const result = await (window as any).api.saveWorldFileExternal(content, suggestedName)

    if (result.success) {
      exportStatus.value = 'success'
      statusMessage.value = '导出成功'
      setTimeout(() => emit('close'), 1500)
    } else if (result.cancelled) {
      exportStatus.value = 'idle'
      statusMessage.value = ''
    } else {
      exportStatus.value = 'error'
      statusMessage.value = `导出失败: ${result.error || '未知错误'}`
    }
  } catch (e: any) {
    exportStatus.value = 'error'
    statusMessage.value = `导出失败: ${e.message}`
  }
}
</script>

<template>
  <div class="exporter-overlay" @click.self="emit('close')">
    <div class="exporter-dialog">
      <div class="exporter-header">
        <div class="header-title">
          <Download :size="18" />
          <span>导出世界书</span>
        </div>
        <button class="btn-close" @click="emit('close')">
          <X :size="18" />
        </button>
      </div>

      <div class="exporter-body">
        <div class="world-info">
          <FileJson :size="16" />
          <span>{{ worldName }}</span>
        </div>

        <div class="card-selection">
          <h4>选择导出内容</h4>
          <label v-for="(included, type) in includeCards" :key="type" class="card-check">
            <input type="checkbox" v-model="includeCards[type]" />
            <span class="check-label">{{ cardTypeLabels[type] }}</span>
            <span class="check-count">{{ cardCounts[type as keyof typeof cardCounts] }} 张</span>
          </label>
        </div>

        <div class="export-summary">
          共计导出 <strong>{{ totalSelected }}</strong> 张卡片
        </div>

        <div v-if="statusMessage" class="export-status" :class="exportStatus">
          <CheckCircle v-if="exportStatus === 'success'" :size="14" />
          <AlertCircle v-else-if="exportStatus === 'error'" :size="14" />
          {{ statusMessage }}
        </div>
      </div>

      <div class="exporter-footer">
        <button class="btn-cancel" @click="emit('close')">取消</button>
        <button class="btn-export" @click="handleExport" :disabled="exportStatus === 'exporting' || totalSelected === 0">
          <Download :size="16" />
          {{ exportStatus === 'exporting' ? '导出中...' : '导出' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.exporter-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}

.exporter-dialog {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 12px;
  width: 420px;
  max-width: 90vw;
  box-shadow: var(--shadow-soft);
  overflow: hidden;
}

.exporter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-default);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  color: var(--text-primary);
}

.btn-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}
.btn-close:hover {
  color: var(--text-primary);
  background: var(--bg-elevated);
}

.exporter-body {
  padding: 20px;
}

.world-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--accent-gold-weak);
  border-radius: 6px;
  border-left: 3px solid var(--accent-gold);
  color: var(--text-primary);
  font-size: 14px;
  margin-bottom: 16px;
}

.card-selection h4 {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: normal;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.card-check {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  cursor: pointer;
  color: var(--text-primary);
  font-size: 14px;
}

.card-check input[type="checkbox"] {
  accent-color: var(--accent-gold);
}

.check-count {
  margin-left: auto;
  color: var(--text-muted);
  font-size: 12px;
}

.export-summary {
  margin-top: 14px;
  padding: 10px 0;
  border-top: 1px solid var(--border-default);
  font-size: 13px;
  color: var(--text-secondary);
}

.export-summary strong {
  color: var(--accent-gold);
}

.export-status {
  margin-top: 8px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.export-status.success { color: var(--state-success); }
.export-status.error { color: var(--state-danger); }
.export-status.exporting { color: var(--accent-gold); }

.exporter-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border-default);
}

.btn-cancel {
  background: var(--bg-elevated);
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
  padding: 8px 18px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-cancel:hover {
  color: var(--text-primary);
  border-color: var(--accent-primary);
}

.btn-export {
  background: var(--accent-gold);
  color: #000;
  border: none;
  padding: 8px 20px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: bold;
  transition: all 0.2s;
}
.btn-export:hover:not(:disabled) {
  box-shadow: 0 0 10px var(--accent-gold-weak);
}
.btn-export:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
