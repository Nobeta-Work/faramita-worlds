<script setup lang="ts">
import type { TraitTag } from '@shared/Interface'

const props = defineProps<{
  traits: TraitTag[]
}>()

const typeConfig: Record<string, { icon: string; label: string }> = {
  strength: { icon: '✦', label: '强项' },
  flaw: { icon: '✧', label: '弱点' },
  bond: { icon: '♦', label: '羁绊' },
  mark: { icon: '★', label: '命运标记' }
}

const groupedTraits = computed(() => {
  const groups: Record<string, TraitTag[]> = {}
  for (const trait of props.traits) {
    if (!groups[trait.type]) groups[trait.type] = []
    groups[trait.type].push(trait)
  }
  return groups
})

const weightClass = (w: number) => {
  if (w >= 3) return 'weight-3'
  if (w >= 2) return 'weight-2'
  return 'weight-1'
}

import { computed } from 'vue'
</script>

<template>
  <div class="trait-tag-cloud">
    <div v-for="(traits, type) in groupedTraits" :key="type" class="tag-group">
      <div class="group-label" :class="type">
        {{ typeConfig[type]?.icon || '●' }} {{ typeConfig[type]?.label || type }}
      </div>
      <div class="tag-list">
        <span
          v-for="trait in traits"
          :key="trait.text"
          class="tag-chip"
          :class="[type, weightClass(trait.weight), { inactive: trait.active === false }]"
        >
          {{ trait.text }}
          <sup v-if="trait.weight > 1" class="tag-weight">{{ trait.weight }}</sup>
        </span>
      </div>
    </div>
    <div v-if="!traits || traits.length === 0" class="empty-traits">
      暂无特质标签
    </div>
  </div>
</template>

<style scoped>
.trait-tag-cloud {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tag-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.group-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.group-label.strength { color: var(--tag-strength); }
.group-label.flaw { color: var(--tag-flaw); }
.group-label.bond { color: var(--tag-bond); }
.group-label.mark { color: var(--tag-mark); }

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px 10px;
  border-radius: 14px;
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 13px;
  transition: all var(--motion-fast) ease;
}

.tag-chip.strength { border-color: color-mix(in srgb, var(--tag-strength) 40%, transparent); }
.tag-chip.flaw { border-color: color-mix(in srgb, var(--tag-flaw) 40%, transparent); }
.tag-chip.bond { border-color: color-mix(in srgb, var(--tag-bond) 40%, transparent); }
.tag-chip.mark { border-color: color-mix(in srgb, var(--tag-mark) 40%, transparent); }

.tag-chip.weight-3 {
  font-size: 1.2em;
  font-weight: 700;
  border-width: 2px;
}
.tag-chip.weight-3.strength { border-color: var(--tag-strength); box-shadow: 0 0 6px color-mix(in srgb, var(--tag-strength) 20%, transparent); }
.tag-chip.weight-3.flaw { border-color: var(--tag-flaw); box-shadow: 0 0 6px color-mix(in srgb, var(--tag-flaw) 20%, transparent); }
.tag-chip.weight-3.bond { border-color: var(--tag-bond); box-shadow: 0 0 6px color-mix(in srgb, var(--tag-bond) 20%, transparent); }
.tag-chip.weight-3.mark { border-color: var(--tag-mark); box-shadow: 0 0 6px color-mix(in srgb, var(--tag-mark) 20%, transparent); }

.tag-chip.weight-2 {
  font-size: 13px;
}

.tag-chip.weight-1 {
  font-size: 0.85em;
  opacity: 0.7;
}

.tag-chip.inactive {
  color: var(--text-muted);
  opacity: 0.5;
  text-decoration: line-through;
  border-color: var(--border-default);
}

.tag-weight {
  font-size: 0.7em;
  color: var(--text-secondary);
  margin-left: 1px;
}

.empty-traits {
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}
</style>
