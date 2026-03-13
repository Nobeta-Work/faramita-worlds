<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import ActiveCodex from './ActiveCodex.vue'
import DiceTray from './DiceTray.vue'
import WorldStateDrawer from './WorldStateDrawer.vue'
import { ChevronDown, ChevronUp } from 'lucide-vue-next'
import { useChronicleStore } from '../store/chronicle'

const chronicleStore = useChronicleStore()
const isDiceCollapsed = ref(false)

// Conjugate panels: 'active' or 'worldstate'
const topPanel = ref<'active' | 'worldstate'>('active')

const switchTopPanel = (panel: 'active' | 'worldstate') => {
  topPanel.value = panel
}

const criticalConflictCount = computed(() => chronicleStore.latestConflictReport?.summary.critical || 0)

const handleOpenConflictCard = (cardId: string) => {
  chronicleStore.requestOpenCard(cardId)
}

watch(() => chronicleStore.isWaitingForRoll, (waiting) => {
  if (waiting && isDiceCollapsed.value) {
    isDiceCollapsed.value = false
  }
})
</script>

<template>
  <div class="codex-zone">
    <!-- Tab headers for conjugate panels -->
    <div class="codex-tabs">
      <button 
        class="codex-tab" 
        :class="{ active: topPanel === 'active' }"
        @click="switchTopPanel('active')"
      >
        活跃信息
      </button>
      <button 
        class="codex-tab" 
        :class="{ active: topPanel === 'worldstate', 'has-warning': criticalConflictCount > 0 }"
        @click="switchTopPanel('worldstate')"
      >
        世界状态
        <span v-if="criticalConflictCount > 0" class="tab-badge">{{ criticalConflictCount }}</span>
      </button>
    </div>

    <!-- Conjugate content area -->
    <div class="top-area">
      <div v-show="topPanel === 'active'" class="panel-content">
        <ActiveCodex />
      </div>
      <div v-show="topPanel === 'worldstate'" class="panel-content">
        <WorldStateDrawer
          :recentDeltas="chronicleStore.recentWorldStateDeltas"
          :conflictReport="chronicleStore.latestConflictReport"
          :criticalCount="criticalConflictCount"
          @open-card="handleOpenConflictCard"
        />
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

.codex-tabs {
  display: flex;
  background-color: var(--bg-header);
  border-bottom: var(--glass-border);
  flex-shrink: 0;
}

.codex-tab {
  flex: 1;
  padding: 9px 12px;
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
  background: none;
  border: none;
  cursor: pointer;
  transition: all var(--motion-base) ease;
  border-bottom: 2px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.codex-tab:hover {
  color: var(--text-secondary);
  background: var(--bg-hover);
}

.codex-tab.active {
  color: var(--accent-gold);
  border-bottom-color: var(--accent-gold);
}

.codex-tab.has-warning {
  color: var(--state-warning);
}

.codex-tab.has-warning.active {
  border-bottom-color: var(--state-warning);
}

.tab-badge {
  font-size: 10px;
  min-width: 16px;
  height: 16px;
  line-height: 16px;
  text-align: center;
  border-radius: 8px;
  background: var(--state-danger);
  color: #fff;
  font-weight: bold;
}

.top-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-bottom: var(--glass-border);
  overflow: hidden;
  min-height: 0;
  background: linear-gradient(180deg, color-mix(in srgb, var(--bg-panel) 88%, transparent), transparent 60%);
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  height: 100%;
}

.dice-area {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, var(--bg-panel), color-mix(in srgb, var(--bg-elevated) 90%, transparent));
  transition: flex var(--motion-slow) ease, height var(--motion-slow) ease;
  min-height: 40px;
  max-height: 45%;
  height: 40%;
}

.dice-area.collapsed {
  flex: 0 0 40px;
  height: 40px;
  overflow: hidden;
}

.zone-header {
  padding: 10px 15px;
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 1px;
  background-color: var(--bg-header);
  border-bottom: var(--glass-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.zone-header.clickable {
  cursor: pointer;
}

.zone-header.clickable:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

.dice-content {
  flex: 1;
  min-height: 0;
}
</style>
