<script setup lang="ts">
import { ref, nextTick, watch, onMounted, computed } from 'vue'
import { useChronicleStore } from '../store/chronicle'
import { useWorldStore } from '../store/world'
import { useConfigStore } from '../store/config'
import Bubble from './Bubble.vue'
import StoryOpening from './StoryOpening.vue'
import NarrativeInput from './NarrativeInput.vue'
import { AlertTriangle, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-vue-next'

const chronicleStore = useChronicleStore()
const worldStore = useWorldStore()
const configStore = useConfigStore()
const scrollContainer = ref<HTMLElement | null>(null)
const showStartButton = ref(false)

// Font zoom (session-only)
const fontScale = ref(100)
const zoomIn = () => { if (fontScale.value < 200) fontScale.value += 10 }
const zoomOut = () => { if (fontScale.value > 60) fontScale.value -= 10 }
const zoomReset = () => { fontScale.value = 100 }

// Rollback preview
const rollbackPreviewTurn = ref<number | null>(null)

const rollbackPreviewEntries = computed(() => {
  if (rollbackPreviewTurn.value === null) return []
  return chronicleStore.history.filter(e => e.turn >= rollbackPreviewTurn.value!)
})

// Auto-scroll
const userScrolledUp = ref(false)

const scrollToBottom = () => {
  if (userScrolledUp.value) return
  requestAnimationFrame(() => {
    if (scrollContainer.value) {
      scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
    }
  })
}

const onHistoryScroll = () => {
  const el = scrollContainer.value
  if (!el) return
  // If user scrolled more than 80px from bottom, consider it manual scroll-up
  const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  userScrolledUp.value = distFromBottom > 80
}

watch(() => chronicleStore.history.length, () => {
  userScrolledUp.value = false
  scrollToBottom()
})
watch(() => chronicleStore.currentStreamText, scrollToBottom)

onMounted(async () => {
  await configStore.loadConfig()
  await chronicleStore.loadHistory()
  if (chronicleStore.history.length === 0) {
    showStartButton.value = true
  }
})

const handleStartStory = async () => {
  showStartButton.value = false
  await chronicleStore.addEntry({
    turn: 1,
    role: 'system',
    content: 'System: Initializing World Simulation...',
    timestamp: Date.now()
  })
  await chronicleStore._generateAIResponse()
}

const handleSend = async (text: string) => {
  if (chronicleStore.isStreaming) return

  // Handle suggestion shortcut: if user types just a/b/c and there are matching suggestions
  const shortcutMap: Record<string, number> = { a: 0, b: 1, c: 2 }
  const trimmed = text.trim().toLowerCase()
  if (trimmed in shortcutMap && chronicleStore.latestSuggestions.length > shortcutMap[trimmed]) {
    const suggestion = chronicleStore.latestSuggestions[shortcutMap[trimmed]]
    await chronicleStore.processUserMessage(suggestion)
    return
  }

  await chronicleStore.processUserMessage(text)
}

const handleContinue = async () => {
  if (chronicleStore.isStreaming || chronicleStore.isWaitingForRoll) return
  await chronicleStore._generateAIResponse()
}

const handleRollbackRequest = (turn: number) => {
  rollbackPreviewTurn.value = turn
}

const confirmRollback = async () => {
  if (rollbackPreviewTurn.value === null) return
  const turn = rollbackPreviewTurn.value
  rollbackPreviewTurn.value = null
  await chronicleStore.rollback(turn)
}

const cancelRollback = () => {
  rollbackPreviewTurn.value = null
}

const suggestionLabels = ['a', 'b', 'c']

const handleSuggestionClick = async (suggestion: string) => {
  if (chronicleStore.isStreaming) return
  await chronicleStore.processUserMessage(suggestion)
}


</script>

<template>
  <div class="chronicle-zone">
    <div class="history" ref="scrollContainer" :style="{ fontSize: (14 * fontScale / 100) + 'px' }" @scroll="onHistoryScroll">
      <StoryOpening
        v-if="showStartButton"
        :worldName="worldStore.meta?.name || '奥尔特大陆'"
        :disabled="chronicleStore.isStreaming"
        @start="handleStartStory"
      />

      <Bubble
        v-for="entry in chronicleStore.history"
        :key="entry.id || entry.timestamp"
        v-bind="entry"
        :class="{ 'rollback-target': rollbackPreviewTurn !== null && entry.turn >= rollbackPreviewTurn }"
        @rollback="handleRollbackRequest"
      />
      <Bubble
        v-if="chronicleStore.isStreaming"
        role="assistant"
        :content="chronicleStore.currentStreamText"
        :turn="chronicleStore.history.length + 1"
        :is-streaming="true"
      />

      <!-- Suggestion pills -->
      <transition name="fade">
        <div v-if="chronicleStore.latestSuggestions.length > 0 && !chronicleStore.isStreaming && !chronicleStore.isWaitingForRoll" class="suggestions-bar">
          <button
            v-for="(suggestion, idx) in chronicleStore.latestSuggestions"
            :key="idx"
            class="suggestion-pill"
            @click="handleSuggestionClick(suggestion)"
          >
            <span class="suggestion-key">{{ suggestionLabels[idx] }}</span>
            {{ suggestion }}
          </button>
        </div>
      </transition>
    </div>

    <!-- Rollback preview overlay -->
    <transition name="fade">
      <div v-if="rollbackPreviewTurn !== null" class="rollback-preview">
        <div class="rollback-preview-content">
          <AlertTriangle :size="16" />
          <span>将回滚到第 {{ rollbackPreviewTurn }} 回合，删除 <strong>{{ rollbackPreviewEntries.length }}</strong> 条消息</span>
          <div class="rollback-actions">
            <button class="btn-rollback-confirm" @click="confirmRollback">确认回滚</button>
            <button class="btn-rollback-cancel" @click="cancelRollback">
              <X :size="14" /> 取消
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- Font zoom controls -->
    <div class="zoom-bar">
      <button class="zoom-btn" @click.stop="zoomOut" :disabled="fontScale <= 60" title="缩小字体">
        <ZoomOut :size="14" />
      </button>
      <button class="zoom-btn zoom-label" @click.stop="zoomReset" :title="'重置字体 (' + fontScale + '%)'">
        {{ fontScale }}%
      </button>
      <button class="zoom-btn" @click.stop="zoomIn" :disabled="fontScale >= 200" title="放大字体">
        <ZoomIn :size="14" />
      </button>
    </div>

    <NarrativeInput
      :isStreaming="chronicleStore.isStreaming"
      :isWaitingForRoll="chronicleStore.isWaitingForRoll"
      @send="handleSend"
      @continue="handleContinue"
    />
  </div>
</template>

<style scoped>
.chronicle-zone {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  width: 100%;
  overflow: hidden;
  background: transparent;
  position: relative;
}

.chronicle-zone::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.08'/%3E%3C/svg%3E");
  opacity: 0.03;
  pointer-events: none;
  z-index: 0;
}

/* Zoom bar */
.zoom-bar {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 2px;
  background: color-mix(in srgb, var(--bg-overlay) 92%, transparent);
  border: 1px solid var(--border-default);
  border-radius: 999px;
  padding: 2px;
  backdrop-filter: blur(8px);
  opacity: 0.5;
  transition: opacity 0.2s;
  pointer-events: auto;
}

.zoom-bar:hover {
  opacity: 1;
}

.zoom-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
}

.zoom-btn:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.zoom-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.zoom-label {
  width: auto;
  padding: 0 4px;
  font-size: 11px;
  color: var(--text-muted);
  border-radius: 4px;
}

.zoom-label:hover:not(:disabled) {
  color: var(--accent-gold);
}

.history {
  flex: 1 1 auto;
  overflow-y: auto;
  min-height: 0;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background-color: transparent;
}

/* Rollback preview highlight */
:deep(.rollback-target) {
  opacity: 0.5;
  border-color: var(--state-danger) !important;
  background: color-mix(in srgb, var(--state-danger) 8%, transparent) !important;
  transition: all 0.3s ease;
}

.rollback-preview {
  position: absolute;
  bottom: 80px;
  left: 16px;
  right: 16px;
  z-index: 30;
}

.rollback-preview-content {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: color-mix(in srgb, var(--bg-elevated) 96%, transparent);
  border: 1px solid var(--state-warning);
  border-radius: 8px;
  backdrop-filter: blur(8px);
  font-size: 13px;
  color: var(--text-secondary);
  box-shadow: var(--shadow-soft);
  flex-wrap: wrap;
}
.rollback-preview-content svg {
  color: var(--state-warning);
  flex-shrink: 0;
}
.rollback-preview-content strong {
  color: var(--state-danger);
}

.rollback-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.btn-rollback-confirm {
  background: var(--state-danger);
  color: #fff;
  border: none;
  padding: 5px 14px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: bold;
  transition: all 0.2s;
}
.btn-rollback-confirm:hover {
  box-shadow: 0 0 8px var(--state-danger);
}

.btn-rollback-cancel {
  background: var(--bg-surface);
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
  padding: 5px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
}
.btn-rollback-cancel:hover {
  color: var(--text-primary);
  border-color: var(--accent-primary);
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

/* Suggestion pills */
.suggestions-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 2px 0 4px;
}

.suggestion-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  background: color-mix(in srgb, var(--bg-elevated) 80%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-gold) 35%, transparent);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  backdrop-filter: blur(4px);
}

.suggestion-pill:hover {
  border-color: var(--accent-gold);
  color: var(--accent-gold);
  background: color-mix(in srgb, var(--accent-gold) 10%, var(--bg-elevated));
  box-shadow: 0 0 8px color-mix(in srgb, var(--accent-gold) 20%, transparent);
}

.suggestion-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--accent-gold) 20%, transparent);
  color: var(--accent-gold);
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
  flex-shrink: 0;
}
</style>
