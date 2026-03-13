<script setup lang="ts">
import { computed } from 'vue'
import type { TaskProgress } from '../core/TaskQueue'

const props = defineProps<{
  progress: TaskProgress
}>()

const percentage = computed(() => {
  if (!props.progress.total) return 0
  return Math.min(100, Math.round((props.progress.completed / props.progress.total) * 100))
})

const elapsedFormatted = computed(() => {
  const seconds = Math.floor(props.progress.elapsedMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`
})

const statusLabel = computed(() => {
  const map: Record<string, string> = {
    pending: '等待中',
    running: '处理中',
    completed: '已完成',
    failed: '失败',
    paused: '已暂停',
    cancelled: '已取消'
  }
  return map[props.progress.status] || props.progress.status
})

const statusClass = computed(() => props.progress.status)
</script>

<template>
  <div class="progress-bar-container">
    <div class="progress-header">
      <span class="progress-label" :class="statusClass">{{ statusLabel }}</span>
      <span class="progress-stats">{{ progress.completed }} / {{ progress.total }}</span>
      <span class="progress-pct">{{ percentage }}%</span>
    </div>
    <div class="progress-track">
      <div
        class="progress-fill"
        :class="statusClass"
        :style="{ width: `${percentage}%` }"
      />
    </div>
    <div class="progress-footer">
      <span class="progress-time">耗时 {{ elapsedFormatted }}</span>
      <span class="progress-api">API 调用 {{ progress.apiCalls }}</span>
      <span v-if="progress.errors.length" class="progress-errors">
        错误 {{ progress.errors.length }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.progress-bar-container {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.progress-label {
  font-weight: 600;
  color: var(--text-secondary);
}

.progress-label.running {
  color: var(--accent-gold);
}

.progress-label.completed {
  color: var(--state-success);
}

.progress-label.failed,
.progress-label.cancelled {
  color: var(--state-danger);
}

.progress-label.paused {
  color: var(--state-warning);
}

.progress-stats {
  color: var(--text-muted);
}

.progress-pct {
  margin-left: auto;
  color: var(--text-primary);
  font-weight: 600;
}

.progress-track {
  height: 6px;
  background: var(--bg-elevated);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--accent-gold);
  transition: width 0.3s ease;
}

.progress-fill.completed {
  background: var(--state-success);
}

.progress-fill.failed,
.progress-fill.cancelled {
  background: var(--state-danger);
}

.progress-fill.paused {
  background: var(--state-warning);
}

.progress-footer {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--text-muted);
}

.progress-errors {
  color: var(--state-danger);
}
</style>
