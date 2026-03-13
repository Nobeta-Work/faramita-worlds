<script setup lang="ts">
import { ref, watch } from 'vue'
import { ChevronDown } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  title: string
  initialOpen?: boolean
  summary?: string
  level?: 'h4' | 'h5' | 'h6'
}>(), {
  initialOpen: true,
  level: 'h4'
})

const emit = defineEmits<{
  toggle: [isOpen: boolean]
}>()

const isOpen = ref(props.initialOpen)

watch(() => props.initialOpen, (v) => { isOpen.value = v })

function toggle() {
  isOpen.value = !isOpen.value
  emit('toggle', isOpen.value)
}
</script>

<template>
  <div class="accordion-panel" :class="{ open: isOpen }">
    <div class="accordion-header" @click="toggle">
      <slot name="header">
        <component :is="level" class="accordion-title">{{ title }}</component>
        <span v-if="summary && !isOpen" class="accordion-summary">{{ summary }}</span>
      </slot>
      <ChevronDown :size="16" class="accordion-chevron" :class="{ rotated: isOpen }" />
    </div>
    <Transition name="accordion">
      <div v-show="isOpen" class="accordion-body">
        <slot />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.accordion-panel {
  border-bottom: 1px solid var(--border-default);
  margin-bottom: 4px;
}

.accordion-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  cursor: pointer;
  user-select: none;
}

.accordion-header:hover {
  opacity: 0.85;
}

.accordion-title {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 1px;
  flex-shrink: 0;
}

.accordion-summary {
  flex: 1;
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-left: 8px;
}

.accordion-chevron {
  margin-left: auto;
  color: var(--text-muted);
  transition: transform var(--motion-base) ease;
  flex-shrink: 0;
}

.accordion-chevron.rotated {
  transform: rotate(180deg);
}

.accordion-body {
  padding: 0 0 12px;
}

/* Height transition */
.accordion-enter-active,
.accordion-leave-active {
  transition: all var(--motion-base) ease;
  overflow: hidden;
}
.accordion-enter-from,
.accordion-leave-to {
  opacity: 0;
  max-height: 0;
  padding-bottom: 0;
}
.accordion-enter-to,
.accordion-leave-from {
  opacity: 1;
}
</style>
