<script setup lang="ts">
import { ref, watch } from 'vue'
import ActiveCodex from './ActiveCodex.vue'
import DiceTray from './DiceTray.vue'
import { ChevronDown, ChevronUp } from 'lucide-vue-next'
import { useChronicleStore } from '../store/chronicle'

const chronicleStore = useChronicleStore()
const isDiceCollapsed = ref(false)

watch(() => chronicleStore.isWaitingForRoll, (waiting) => {
  if (waiting && isDiceCollapsed.value) {
    isDiceCollapsed.value = false
  }
})
</script>

<template>
  <div class="codex-zone">
    <div class="active-area" :class="{ expanded: isDiceCollapsed }">
      <div class="zone-header">活跃信息</div>
      <div class="scroll-content">
        <ActiveCodex />
      </div>
    </div>
    
    <div class="dice-area" :class="{ collapsed: isDiceCollapsed }">
      <div class="zone-header clickable" @click="isDiceCollapsed = !isDiceCollapsed">
        <span>投骰区</span>
        <component :is="isDiceCollapsed ? ChevronUp : ChevronDown" :size="14" />
      </div>
      <div class="dice-content">
        <DiceTray />
      </div>
    </div>
  </div>
</template>

<style scoped>
.codex-zone {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: transparent;
}

.active-area {
  flex: 6;
  display: flex;
  flex-direction: column;
  border-bottom: var(--glass-border);
  overflow: hidden;
  transition: flex 1s ease;
}

.active-area.expanded {
  flex: 1;
}

.dice-area {
  flex: 4;
  display: flex;
  flex-direction: column;
  background-color: rgba(0, 0, 0, 0.5);
  transition: flex 1s ease, height 1s ease;
  min-height: 40px;
}

.dice-area.collapsed {
  flex: 0 0 40px;
  overflow: hidden;
}

.zone-header {
  padding: 10px 15px;
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 1px;
  background-color: rgba(255, 255, 255, 0.05);
  border-bottom: var(--glass-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.zone-header.clickable {
  cursor: pointer;
}

.zone-header.clickable:hover {
  background-color: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.scroll-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.dice-content {
  flex: 1;
  min-height: 0;
}
</style>
