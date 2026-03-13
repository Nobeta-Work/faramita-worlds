<script setup lang="ts">
import { computed } from 'vue'
import type { AIResponseInteraction, Difficulty } from '@shared/Interface'

const props = defineProps<{
  interaction: AIResponseInteraction
}>()

const DIFFICULTY_MAP: Record<string, number> = {
  easy: 2,
  normal: 0,
  hard: -2,
  extreme: -4
}

const difficultyLabels: Record<string, string> = {
  easy: '简单',
  normal: '普通',
  hard: '困难',
  extreme: '极难'
}

const tagModifier = computed(() => {
  if (!props.interaction.relevant_tags) return 0
  return props.interaction.relevant_tags.reduce(
    (sum, t) => sum + (t.positive ? t.weight : -t.weight), 0
  )
})

const difficultyModifier = computed(() => {
  return DIFFICULTY_MAP[props.interaction.difficulty || 'normal'] ?? 0
})

const finalModifier = computed(() => {
  return tagModifier.value + difficultyModifier.value
})

const modifierDisplay = computed(() => {
  const val = finalModifier.value
  if (val > 0) return `+${val}`
  if (val < 0) return `${val}`
  return '±0'
})

const needForFull = computed(() => 9 - finalModifier.value)
const needForPartial = computed(() => 6 - finalModifier.value)
</script>

<template>
  <div class="judgment-card">
    <div class="judgment-header">
      <span class="judgment-icon">&#x2694;&#xFE0F;</span>
      <span class="judgment-title">判定：{{ interaction.description }}</span>
    </div>

    <div class="judgment-body">
      <div v-if="interaction.relevant_tags && interaction.relevant_tags.length" class="tags-inline">
        <span v-for="tag in interaction.relevant_tags" :key="tag.text" class="tag-chip" :class="tag.positive ? 'positive' : 'negative'">
          {{ tag.text }} {{ tag.positive ? '+' : '-' }}{{ tag.weight }}
        </span>
      </div>

      <div class="targets-row">
        <span class="target-formula">2d6{{ finalModifier >= 0 ? '+' + finalModifier : finalModifier }}</span>
        <span class="target-arrow">→</span>
        <span class="target-item partial">≥{{ needForPartial }} 部分成功</span>
        <span class="target-sep">|</span>
        <span class="target-item full">≥{{ needForFull }} 完全成功</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.judgment-card {
  background: var(--bg-panel);
  backdrop-filter: var(--glass-backdrop);
  border: var(--glass-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-soft);
}

.judgment-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: color-mix(in srgb, var(--accent-gold) 10%, transparent);
  border-bottom: 1px solid var(--border-default);
  font-weight: 600;
  font-size: 12px;
}

.judgment-icon {
  font-size: 16px;
}

.judgment-title {
  flex: 1;
  color: var(--text-primary);
}

.judgment-body {
  padding: 6px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tags-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag-chip {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
  white-space: nowrap;
}
.tag-chip.positive {
  background: color-mix(in srgb, var(--tag-strength) 15%, transparent);
  color: var(--tag-strength);
}
.tag-chip.negative {
  background: color-mix(in srgb, var(--tag-flaw) 15%, transparent);
  color: var(--tag-flaw);
}

.targets-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 4px 0;
  border-top: 1px solid var(--border-default);
}

.target-formula {
  font-weight: 700;
  color: var(--accent-gold);
}

.target-arrow {
  color: var(--text-muted);
}

.target-sep {
  color: var(--border-default);
}

.target-item {
  font-weight: 600;
}
.target-item.partial {
  color: var(--dice-partial-success);
}
.target-item.full {
  color: var(--dice-full-success);
}


</style>
