<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import MainGame from './views/MainGame.vue'
import ManagerView from './views/ManagerView.vue'
import SettingsView from './views/SettingsView.vue'
import { Layout, Database, Archive, Settings, X, Save, FolderOpen, Trash2, Clock } from 'lucide-vue-next'
import { useChronicleStore } from './store/chronicle'
import { useWorldStore } from './store/world'

type ViewType = 'game' | 'manager' | 'settings'

const currentView = ref<ViewType>('game')
const chronicleStore = useChronicleStore()
const worldStore = useWorldStore()
let isQuitting = false

const showArchiveModal = ref(false)
const saveFiles = ref<Array<{ filename: string; timestamp: number }>>([])
const selectedSaveFile = ref('')
const statusMsg = ref('')
const statusType = ref<'success' | 'error'>('success')

const showStatus = (msg: string, type: 'success' | 'error' = 'success') => {
  statusMsg.value = msg
  statusType.value = type
  setTimeout(() => {
    statusMsg.value = ''
  }, 3000)
}

const formatDate = (timestamp: number) => {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

const openArchiveModal = async () => {
  showArchiveModal.value = true
  await loadSaveFiles()
}

const loadSaveFiles = async () => {
  if (!worldStore.meta || !worldStore.meta.uuid) {
    showStatus('世界书元数据未找到', 'error')
    return
  }
  
  const result = await (window as any).api.listSaveFiles(worldStore.meta.uuid)
  if (result.success) {
    saveFiles.value = result.files || []
  } else {
    showStatus(`加载存档列表失败: ${result.error}`, 'error')
  }
}

const handleSaveArchive = async () => {
  const result = await chronicleStore.saveArchive()
  if (result.success) {
    showStatus('存档保存成功')
    await loadSaveFiles()
  } else {
    showStatus(`保存失败: ${result.error}`, 'error')
  }
}

const handleLoadArchive = async () => {
  if (!selectedSaveFile.value) {
    showStatus('请选择一个存档', 'error')
    return
  }
  
  const result = await chronicleStore.loadArchiveFile(selectedSaveFile.value)
  if (result.success) {
    showStatus('存档加载成功')
    showArchiveModal.value = false
    currentView.value = 'game'
  } else {
    showStatus(`加载失败: ${result.error}`, 'error')
  }
}

const handleDeleteArchive = async (filename: string) => {
  if (!confirm('确定要删除这个存档吗？')) return
  
  const result = await (window as any).api.deleteArchiveFile(filename)
  if (result.success) {
    showStatus('存档已删除')
    await loadSaveFiles()
    if (selectedSaveFile.value === filename) {
      selectedSaveFile.value = ''
    }
  } else {
    showStatus(`删除失败: ${result.error}`, 'error')
  }
}

onMounted(() => {
  const savedView = localStorage.getItem('faramita_current_view')
  if (['game', 'manager', 'settings'].includes(savedView as string)) {
    currentView.value = savedView as ViewType
  }

  window.addEventListener('beforeunload', async (e) => {
    if (isQuitting) return
    isQuitting = true

    if (worldStore.meta?.uuid && chronicleStore.history.length > 0) {
      e.preventDefault()
      e.returnValue = ''

      const archive = {
        world_meta: worldStore.meta,
        timestamp: Date.now(),
        active_information: worldStore.activeCharacterIds,
        history: chronicleStore.history
      }

      try {
        await (window as any).api.autoSaveOnQuit(
          JSON.stringify(archive, null, 2),
          worldStore.meta.uuid,
          worldStore.meta.name
        )
        console.log('[Auto-save] Archive saved before quit')
      } catch (error) {
        console.error('[Auto-save] Failed to save archive:', error)
      }

      try {
        ;(window as any).api.quitApp()
      } catch (error) {
        console.log('[Quit] IPC failed, closing window directly')
        isQuitting = false
        window.close()
      }
    } else {
      isQuitting = false
    }
  })
})

watch(currentView, (newView) => {
  localStorage.setItem('faramita_current_view', newView)
})
</script>

<template>
  <div class="app-layout">
    <aside class="main-sidebar">
      <div 
        class="nav-icon" 
        :class="{ active: currentView === 'game' }" 
        @click="currentView = 'game'"
        title="跑团界面"
      >
        <Layout :size="24" />
      </div>
      <div 
        class="nav-icon" 
        :class="{ active: currentView === 'manager' }" 
        @click="currentView = 'manager'"
        title="世界书管理"
      >
        <Database :size="24" />
      </div>
      
      <div class="divider"></div>

      <div 
        class="nav-icon action" 
        @click="openArchiveModal"
        title="存档管理"
      >
        <Archive :size="24" />
      </div>
      
      <div class="nav-spacer"></div>
      
      <div 
        class="nav-icon" 
        :class="{ active: currentView === 'settings' }" 
        @click="currentView = 'settings'"
        title="系统设置"
      >
        <Settings :size="24" />
      </div>
    </aside>

    <main class="content-area">
      <MainGame v-if="currentView === 'game'" />
      <ManagerView v-else-if="currentView === 'manager'" />
      <SettingsView v-else-if="currentView === 'settings'" />
    </main>

    <!-- Archive Management Modal -->
    <div v-if="showArchiveModal" class="modal-overlay" @click.self="showArchiveModal = false">
      <div class="modal-content archive-modal">
        <div class="modal-header">
          <h3>存档管理</h3>
          <button class="btn-close" @click="showArchiveModal = false">
            <X :size="18" />
          </button>
        </div>

        <!-- Status Toast -->
        <transition name="status-fade">
          <div v-if="statusMsg" class="status-toast" :class="statusType">
            {{ statusMsg }}
          </div>
        </transition>

        <div class="modal-body">
          <div class="archive-section">
            <div class="section-header">
              <h4>当前世界书: {{ worldStore.meta?.name || '未知' }}</h4>
            </div>

            <div class="archive-actions">
              <button class="btn-primary" @click="handleSaveArchive">
                <Save :size="16" /> 保存新存档
              </button>
            </div>
          </div>

          <div class="divider-line"></div>

          <div class="archive-section">
            <h4>存档列表</h4>
            <p class="archive-hint">最多保留 5 个存档，超出后将自动删除最旧的存档</p>
            
            <div v-if="saveFiles.length === 0" class="empty-state">
              暂无存档
            </div>
            
            <div v-else class="save-list">
              <div 
                v-for="save in saveFiles" 
                :key="save.filename"
                class="save-item"
                :class="{ selected: selectedSaveFile === save.filename }"
                @click="selectedSaveFile = save.filename"
              >
                <div class="save-info">
                  <Clock :size="14" />
                  <span class="save-time">{{ formatDate(save.timestamp) }}</span>
                </div>
                <button 
                  class="btn-delete-save" 
                  @click.stop="handleDeleteArchive(save.filename)"
                  title="删除存档"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
            </div>

            <div class="archive-actions">
              <button 
                class="btn-secondary" 
                @click="handleLoadArchive"
                :disabled="!selectedSaveFile"
              >
                <FolderOpen :size="16" /> 加载选中存档
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* Global Dark Theme & Scrollbars */
:root {
  --bg-dark: #0b0b0b;
  --bg-panel: rgba(20, 20, 20, 0.7);
  --bg-header: rgba(30, 30, 30, 0.8);
  --glass-border: 1px solid rgba(255, 255, 255, 0.08);
  --glass-bg: rgba(0, 0, 0, 0.3);
  --glass-backdrop: blur(10px);
  --accent-gold: #d4af37;
  --text-primary: #e0e0e0;
  --text-secondary: #9aa0a6;
  --text-flow-base: #d8d2c4;
  --text-flow-env: #b6aea0;
  --text-flow-dialogue: #e4e0d6;
  --text-flow-speaker: #69c4c0;
  --text-flow-user: #f0e7cf;
  --text-flow-system: #ffb3b3;
}

body {
  margin: 0;
  padding: 0;
  background-color: var(--bg-dark);
  background-image: url("https://images.unsplash.com/photo-1519681393798-3828fb4090bb?q=80&w=2070&auto=format&fit=crop"); /* Placeholder dark fantasy bg */
  background-size: cover;
  background-position: center;
  background-attachment: fixed;
  color: var(--text-primary);
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

* {
  box-sizing: border-box;
}

/* Overlay for darkening background */
body::after {
  content: "";
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7); /* Darken the image */
  z-index: -1;
  pointer-events: none;
}

/* Custom Scrollbar */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: var(--bg-dark); 
}
::-webkit-scrollbar-thumb {
  background: #333; 
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: #444; 
}

/* Texture Overlay */
.app-layout::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.03'/%3E%3C/svg%3E");
  pointer-events: none;
  z-index: 9999;
  opacity: 0.5;
}

.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  position: relative;
}

.main-sidebar {
  width: 60px;
  background-color: #080808;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0;
  gap: 20px;
  border-right: 1px solid var(--border-color);
  z-index: 10;
  box-shadow: 2px 0 10px rgba(0,0,0,0.5);
}

.divider {
  width: 30px;
  height: 1px;
  background-color: #333;
}

.nav-icon {
  color: #555;
  cursor: pointer;
  transition: all 0.3s ease;
  padding: 10px;
  border-radius: 8px;
}

.nav-icon:hover {
  color: #eee;
  background-color: rgba(255,255,255,0.05);
}

.nav-icon.active {
  color: var(--accent-gold);
  background-color: rgba(212, 175, 55, 0.1);
  box-shadow: 0 0 10px rgba(212, 175, 55, 0.1);
}

.nav-icon.action {
  color: #4ecdc4;
}
.nav-icon.action:hover {
  color: #fff;
  background-color: rgba(78, 205, 196, 0.1);
}

.nav-spacer {
  flex: 1;
}

.content-area {
  flex: 1;
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-dark);
}

/* Archive Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(5px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.archive-modal {
  background: #1a1a1a;
  border: 1px solid #d4af37;
  border-radius: 12px;
  width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 0 40px rgba(212, 175, 55, 0.3);
}

.modal-header {
  padding: 20px 25px;
  border-bottom: 1px solid #333;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(0, 0, 0, 0.3);
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  color: #d4af37;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.btn-close {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.btn-close:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

.modal-body {
  padding: 25px;
  overflow-y: auto;
}

.archive-section {
  margin-bottom: 25px;
}

.archive-section h4 {
  margin: 0 0 15px 0;
  font-size: 15px;
  color: #eee;
  font-weight: normal;
}

.section-header h4 {
  margin: 0;
  font-size: 14px;
  color: #888;
}

.archive-hint {
  font-size: 12px;
  color: #666;
  margin: 0 0 15px 0;
  font-style: italic;
}

.archive-actions {
  display: flex;
  gap: 10px;
  margin-top: 15px;
}

.btn-primary, .btn-secondary {
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
  border: none;
}

.btn-primary {
  background: #d4af37;
  color: #000;
}

.btn-primary:hover {
  background: #f0c040;
  box-shadow: 0 0 15px rgba(212, 175, 55, 0.4);
}

.btn-secondary {
  background: #2a2a2a;
  color: #eee;
  border: 1px solid #444;
}

.btn-secondary:hover:not(:disabled) {
  background: #3a3a3a;
  border-color: #d4af37;
  color: #d4af37;
}

.btn-secondary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.divider-line {
  height: 1px;
  background: #333;
  margin: 25px 0;
}

.empty-state {
  padding: 40px;
  text-align: center;
  color: #666;
  font-size: 14px;
  font-style: italic;
  border: 1px dashed #333;
  border-radius: 8px;
}

.save-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 15px;
  max-height: 300px;
  overflow-y: auto;
}

.save-item {
  padding: 15px;
  background: #252525;
  border: 1px solid #333;
  border-radius: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s;
}

.save-item:hover {
  background: #2a2a2a;
  border-color: #555;
}

.save-item.selected {
  background: #3d3115;
  border-color: #d4af37;
  box-shadow: 0 0 10px rgba(212, 175, 55, 0.2);
}

.save-info {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #aaa;
}

.save-time {
  font-size: 13px;
}

.btn-delete-save {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 6px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  transition: all 0.2s;
}

.btn-delete-save:hover {
  color: #ff6b6b;
  background: rgba(255, 107, 107, 0.1);
}

.status-toast {
  position: absolute;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 20px;
  border-radius: 6px;
  font-size: 14px;
  z-index: 10000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}

.status-toast.success {
  background-color: #1b4332;
  color: #74c69d;
  border: 1px solid #2d6a4f;
}

.status-toast.error {
  background-color: #431b1b;
  color: #c67474;
  border: 1px solid #6a2d2d;
}

.status-fade-enter-active, .status-fade-leave-active {
  transition: all 0.3s ease;
}

.status-fade-enter-from, .status-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -20px);
}
</style>
