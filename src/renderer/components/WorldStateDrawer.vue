<script setup lang="ts">
import { AlertTriangle } from 'lucide-vue-next'

const props = defineProps<{
  recentDeltas: any[]
  conflictReport: any | null
  criticalCount: number
}>()

const emit = defineEmits<{
  (e: 'open-card', id: string): void
}>()

function openCard(cardId?: string) {
  if (cardId) emit('open-card', cardId)
}
</script>

<template>
  <div class="world-state-panel">
    <!-- Summary bar -->
    <div v-if="conflictReport" class="conflict-summary">
      <AlertTriangle v-if="criticalCount > 0" :size="14" class="danger" />
      <span class="summary-text">
        <span class="s-critical">{{ conflictReport.summary.critical }} 严重</span> · 
        <span class="s-major">{{ conflictReport.summary.major }} 重要</span> · 
        <span class="s-minor">{{ conflictReport.summary.minor }} 轻微</span>
      </span>
    </div>

    <div class="ws-sections">
      <div class="ws-section">
        <div class="ws-section-title">最近变更</div>
        <div v-if="recentDeltas.length === 0" class="ws-empty">暂无世界状态变更</div>
        <div v-else class="delta-list">
          <div v-for="delta in recentDeltas" :key="delta.id || `${delta.turn}-${delta.timestamp}`" class="delta-item">
            <div class="delta-head">Turn {{ delta.turn }} · {{ delta.changes.length }} changes</div>
            <div class="delta-cards">Cards: {{ delta.cardIds.join(', ') }}</div>
          </div>
        </div>
      </div>

      <div class="ws-section" v-if="conflictReport && conflictReport.issues.length > 0">
        <div class="ws-section-title">冲突警告</div>
        <div class="conflict-list">
          <div
            v-for="(issue, index) in conflictReport.issues.slice(0, 8)"
            :key="`${issue.code}-${issue.cardId}-${index}`"
            class="conflict-item"
            :class="issue.severity"
            @click="openCard(issue.cardId)"
          >
            <span class="severity">{{ issue.severity.toUpperCase() }}</span>
            <span class="message">{{ issue.message }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.world-state-panel {
  padding: 10px;
  height: 100%;
  box-sizing: border-box;
}

.conflict-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 10px;
  background: color-mix(in srgb, var(--bg-elevated) 90%, transparent);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text-secondary);
}

.danger {
  color: var(--state-danger);
}

.s-critical { color: var(--state-danger); font-weight: 600; }
.s-major { color: var(--state-warning); }
.s-minor { color: var(--text-muted); }

.ws-sections {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ws-section-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  margin-bottom: 6px;
  font-weight: 600;
}

.ws-empty {
  color: var(--text-muted);
  font-size: 12px;
  font-style: italic;
  padding: 16px 0;
  text-align: center;
}

.delta-list,
.conflict-list {
  max-height: 260px;
  overflow-y: auto;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--bg-elevated) 88%, transparent);
}

.delta-item,
.conflict-item {
  padding: 8px;
  border-bottom: 1px solid var(--border-default);
  cursor: pointer;
  transition: background-color var(--motion-fast) ease;
}

.delta-item:hover,
.conflict-item:hover {
  background: var(--bg-hover);
}

.delta-item:last-child,
.conflict-item:last-child {
  border-bottom: none;
}

.delta-head {
  font-size: 12px;
  color: var(--text-primary);
}

.delta-cards {
  font-size: 11px;
  color: var(--text-secondary);
}

.conflict-item .severity {
  font-size: 10px;
  margin-right: 8px;
}

.conflict-item .message {
  font-size: 12px;
  color: var(--text-primary);
}

.conflict-item.critical .severity { color: var(--state-danger); }
.conflict-item.major .severity { color: var(--state-warning); }
.conflict-item.minor .severity { color: var(--accent-primary); }
</style>
