<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useWorldStore } from '../store/world'
import { useChronicleStore } from '../store/chronicle'
import ChronicleZone from '../components/ChronicleZone.vue'
import CodexZone from '../components/CodexZone.vue'
import { PanelRightClose, PanelRightOpen } from 'lucide-vue-next'

const worldStore = useWorldStore()
const chronicleStore = useChronicleStore()
const sidebarCollapsed = ref(false)

onMounted(async () => {
  await worldStore.loadWorld()
  await chronicleStore.loadHistory()
  const saved = localStorage.getItem('faramita_sidebar_collapsed')
  if (saved === 'true') sidebarCollapsed.value = true
})

const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value
  localStorage.setItem('faramita_sidebar_collapsed', String(sidebarCollapsed.value))
}
</script>

<template>
  <div class="main-game" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <div class="zone-a">
      <ChronicleZone />
      <button class="btn-toggle-sidebar" @click="toggleSidebar" :title="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'">
        <PanelRightOpen v-if="sidebarCollapsed" :size="16" />
        <PanelRightClose v-else :size="16" />
      </button>
    </div>
    <transition name="sidebar-slide">
      <div v-show="!sidebarCollapsed" class="zone-b">
        <CodexZone />
      </div>
    </transition>
  </div>
</template>

<style scoped>
.main-game {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(340px, 32%);
  height: 100%;
  min-height: 0;
  width: 100%;
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--bg-surface) 45%, transparent), transparent 45%),
    var(--bg-app);
  overflow: hidden;
  transition: grid-template-columns 0.3s ease;
}

.main-game.sidebar-collapsed {
  grid-template-columns: 1fr 0fr;
}

.zone-a {
  border-right: var(--glass-border);
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: linear-gradient(180deg, color-mix(in srgb, var(--bg-panel) 90%, transparent), var(--bg-overlay));
  position: relative;
}

.zone-b {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: linear-gradient(180deg, var(--bg-surface), color-mix(in srgb, var(--bg-elevated) 78%, transparent));
  box-shadow: inset 1px 0 0 var(--border-default);
  overflow: hidden;
}

.btn-toggle-sidebar {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 20;
  background: color-mix(in srgb, var(--bg-overlay) 70%, transparent);
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  backdrop-filter: blur(4px);
}
.btn-toggle-sidebar:hover {
  color: var(--text-primary);
  border-color: var(--accent-primary);
  background: color-mix(in srgb, var(--bg-elevated) 90%, transparent);
}

.sidebar-slide-enter-active,
.sidebar-slide-leave-active {
  transition: opacity 0.3s ease;
}
.sidebar-slide-enter-from,
.sidebar-slide-leave-to {
  opacity: 0;
}
</style>
