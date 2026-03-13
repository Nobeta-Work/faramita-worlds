<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import MainGame from './views/MainGame.vue'
import ManagerView from './views/ManagerView.vue'
import SettingsView from './views/SettingsView.vue'
import WorldbookImportWizard from './components/WorldbookImportWizard.vue'
import WelcomeSplash from './components/WelcomeSplash.vue'
import GuidedTour from './components/GuidedTour.vue'
import { Layout, Database, Archive, Settings, Save, FolderOpen, Trash2, Clock, FileUp, RotateCcw } from 'lucide-vue-next'
import { db } from './db/db'
import { useChronicleStore } from './store/chronicle'
import { useWorldStore } from './store/world'
import { useConfigStore } from './store/config'

type ViewType = 'game' | 'manager' | 'archive' | 'import' | 'settings'

const currentView = ref<ViewType>('game')
const chronicleStore = useChronicleStore()
const worldStore = useWorldStore()
const configStore = useConfigStore()
let isQuitting = false

const showWelcome = ref(false)
const showTour = ref(false)

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

const openArchivePage = async () => {
  currentView.value = 'archive'
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

const resolveRestartActiveCharacterIds = () => {
  if (worldStore.meta?.player_character_id) {
    return [worldStore.meta.player_character_id]
  }

  const taggedPlayer = worldStore.cards.find(card =>
    card.type === 'character' && Array.isArray((card as any).tags) && (card as any).tags.includes('player')
  )
  if (taggedPlayer) return [taggedPlayer.id]

  const firstCharacter = worldStore.cards.find(card => card.type === 'character')
  return firstCharacter ? [firstCharacter.id] : []
}

const handleRestartArchive = async () => {
  if (!worldStore.meta?.uuid || !worldStore.meta?.name) {
    showStatus('请先加载世界书后再重新开始', 'error')
    return
  }

  if (!confirm('确定重新开始吗？这会清空当前历史并创建一个空白存档。')) return

  try {
    await db.chronicle.clear()
    await chronicleStore.loadHistory()
    chronicleStore.clearInteraction()

    const activeIds = resolveRestartActiveCharacterIds()
    await worldStore.setActiveCharacters(activeIds)

    const emptyArchive = {
      world_meta: worldStore.meta,
      timestamp: Date.now(),
      active_information: activeIds,
      history: []
    }

    const saveResult = await (window as any).api.saveArchiveFile(
      JSON.stringify(emptyArchive, null, 2),
      worldStore.meta.uuid,
      worldStore.meta.name
    )

    if (!saveResult.success) {
      showStatus(`重新开始失败: ${saveResult.error}`, 'error')
      return
    }

    await loadSaveFiles()
    if (saveResult.filename) {
      selectedSaveFile.value = saveResult.filename
    }

    showStatus('已重新开始并载入空白存档')
    currentView.value = 'game'
  } catch (error: any) {
    showStatus(`重新开始失败: ${error.message || '未知错误'}`, 'error')
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

onMounted(async () => {
  const savedTheme = localStorage.getItem('faramita_theme')
  const initialTheme = savedTheme === 'light' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', initialTheme)

  const savedView = localStorage.getItem('faramita_current_view')
  if (['game', 'manager', 'archive', 'import', 'settings'].includes(savedView as string)) {
    currentView.value = savedView as ViewType
  }

  await configStore.loadConfig()
  if (!configStore.skipWelcome) {
    showWelcome.value = true
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

watch(
  () => chronicleStore.jumpRequestTick,
  () => {
    if (chronicleStore.jumpTargetCardId) {
      currentView.value = 'manager'
    }
  }
)

const handleWelcomeDismiss = () => {
  showWelcome.value = false
}

const handleQuickStart = () => {
  showWelcome.value = false
  currentView.value = 'game'
  showTour.value = true
}

const handleCreateWorld = () => {
  showWelcome.value = false
  currentView.value = 'manager'
}

const handleImportText = () => {
  showWelcome.value = false
  currentView.value = 'import'
}

const openImportWizard = () => {
  currentView.value = 'import'
}

const handleWizardCompleted = (message: string) => {
  statusMsg.value = message
  statusType.value = 'success'
  setTimeout(() => { statusMsg.value = '' }, 3000)
  currentView.value = 'manager'
}

const handleWizardFailed = (message: string) => {
  statusMsg.value = message
  statusType.value = 'error'
  setTimeout(() => { statusMsg.value = '' }, 3000)
}

const handleWizardClose = () => {
  currentView.value = 'manager'
}

const handleTourClose = () => {
  showTour.value = false
}
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
        class="nav-icon" 
        :class="{ active: currentView === 'import' }"
        @click="openImportWizard"
        title="文本导入向导"
      >
        <FileUp :size="24" />
      </div>

      <div 
        class="nav-icon" 
        :class="{ active: currentView === 'archive' }"
        @click="openArchivePage"
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
      <transition name="view-fade" mode="out-in">
        <MainGame v-if="currentView === 'game'" key="game" />
        <ManagerView v-else-if="currentView === 'manager'" key="manager" @open-import-wizard="openImportWizard" />
        <WorldbookImportWizard
          v-else-if="currentView === 'import'"
          key="import"
          @close="handleWizardClose"
          @completed="handleWizardCompleted"
          @failed="handleWizardFailed"
        />
        <div v-else-if="currentView === 'archive'" key="archive" class="archive-page">
          <!-- Status Toast -->
          <transition name="status-fade">
            <div v-if="statusMsg" class="status-toast" :class="statusType">
              {{ statusMsg }}
            </div>
          </transition>

          <div class="archive-page-header">
            <h2><Archive :size="20" /> 存档管理</h2>
            <span class="archive-world-name">当前世界书: {{ worldStore.meta?.name || '未加载' }}</span>
          </div>

          <div class="archive-page-body">
            <div class="archive-panel">
              <div class="archive-panel-header">
                <h3>操作</h3>
              </div>
              <div class="archive-panel-content">
                <button class="btn-primary" @click="handleSaveArchive">
                  <Save :size="16" /> 保存新存档
                </button>
                <button class="btn-secondary" @click="handleRestartArchive">
                  <RotateCcw :size="16" /> 重新开始
                </button>
              </div>
            </div>

            <div class="archive-panel">
              <div class="archive-panel-header">
                <h3>存档列表</h3>
                <span class="archive-count">共 {{ saveFiles.length }} 个存档</span>
              </div>
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
        <SettingsView v-else-if="currentView === 'settings'" key="settings" />
      </transition>
    </main>

    <!-- Welcome Splash -->
    <WelcomeSplash
      v-if="showWelcome"
      @dismiss="handleWelcomeDismiss"
      @quick-start="handleQuickStart"
      @create-world="handleCreateWorld"
      @import-text="handleImportText"
    />

    <!-- Guided Tour -->
    <GuidedTour v-if="showTour" @close="handleTourClose" />

  </div>
</template>

<style>
/* Custom Scrollbar */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: var(--bg-app);
}
::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
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
  height: 100%;
  width: 100%;
  overflow: hidden;
  position: relative;
  background: var(--bg-app);
}

.main-sidebar {
  width: 60px;
  background-color: var(--bg-surface);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0;
  gap: 20px;
  border-right: 1px solid var(--border-default);
  z-index: 10;
  box-shadow: var(--shadow-soft);
}

.divider {
  width: 30px;
  height: 1px;
  background-color: var(--border-strong);
}

.nav-icon {
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--motion-base) ease;
  padding: 10px;
  border-radius: 8px;
}

.nav-icon:hover {
  color: var(--text-primary);
  background-color: var(--accent-primary-weak);
}

.nav-icon.active {
  color: var(--accent-gold);
  background-color: var(--accent-gold-weak);
  box-shadow: var(--glow-gold);
}

.nav-icon.action {
  color: var(--state-success);
}
.nav-icon.action:hover {
  color: var(--text-primary);
  background-color: var(--bg-hover);
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
  background-color: var(--bg-app);
}

/* Page view transition */
.view-fade-enter-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.view-fade-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.view-fade-enter-from { opacity: 0; transform: translateY(8px); }
.view-fade-leave-to { opacity: 0; transform: translateY(-4px); }

/* Archive Page Styles */
.archive-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-app);
  color: var(--text-primary);
  overflow: hidden;
  position: relative;
}

.archive-page-header {
  padding: 24px 32px 16px;
  border-bottom: 1px solid var(--border-default);
  background: var(--bg-surface);
}

.archive-page-header h2 {
  margin: 0 0 6px 0;
  font-size: 18px;
  color: var(--accent-gold);
  text-transform: uppercase;
  letter-spacing: 1px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.archive-world-name {
  font-size: 13px;
  color: var(--text-muted);
}

.archive-page-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 680px;
}

.archive-panel {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 20px;
}

.archive-panel-content {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.archive-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.archive-panel-header h3 {
  margin: 0;
  font-size: 15px;
  color: var(--text-primary);
  font-weight: 500;
}

.archive-count {
  font-size: 12px;
  color: var(--text-muted);
}

.archive-hint {
  font-size: 12px;
  color: var(--text-muted);
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
  background: var(--accent-gold);
  color: #111;
}

.btn-primary:hover {
  background: var(--accent-gold-strong);
  box-shadow: var(--glow-gold);
}

.btn-secondary {
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border-strong);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--accent-gold);
  color: var(--accent-gold);
}

.btn-secondary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.divider-line {
  height: 1px;
  background: var(--border-default);
  margin: 25px 0;
}

.empty-state {
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
  font-style: italic;
  border: 1px dashed var(--border-default);
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
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s;
}

.save-item:hover {
  background: var(--bg-hover);
  border-color: var(--border-strong);
}

.save-item.selected {
  background: var(--accent-gold-weak);
  border-color: var(--accent-gold);
  box-shadow: var(--glow-gold);
}

.save-info {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
}

.save-time {
  font-size: 13px;
}

.btn-delete-save {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 6px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  transition: all 0.2s;
}

.btn-delete-save:hover {
  color: var(--state-danger);
  background: color-mix(in srgb, var(--state-danger) 15%, transparent);
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
  box-shadow: var(--shadow-soft);
  pointer-events: none;
}

.status-toast.success {
  background-color: color-mix(in srgb, var(--state-success) 16%, var(--bg-surface));
  color: var(--state-success);
  border: 1px solid color-mix(in srgb, var(--state-success) 36%, var(--border-default));
}

.status-toast.error {
  background-color: color-mix(in srgb, var(--state-danger) 16%, var(--bg-surface));
  color: var(--state-danger);
  border: 1px solid color-mix(in srgb, var(--state-danger) 36%, var(--border-default));
}

.status-fade-enter-active, .status-fade-leave-active {
  transition: all 0.3s ease;
}

.status-fade-enter-from, .status-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -20px);
}
</style>
