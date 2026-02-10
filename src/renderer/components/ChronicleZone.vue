<script setup lang="ts">
import { ref, nextTick, watch, onMounted, computed } from 'vue'
import { useChronicleStore } from '../store/chronicle'
import { useWorldStore } from '../store/world'
import { useConfigStore } from '../store/config'
import Bubble from './Bubble.vue'
import { Send, Play, BookOpen } from 'lucide-vue-next'

const chronicleStore = useChronicleStore()
const worldStore = useWorldStore()
const configStore = useConfigStore()
const userInput = ref('')
const scrollContainer = ref<HTMLElement | null>(null)
const showStartButton = ref(false)

const isEmptyArchive = computed(() => {
  return chronicleStore.history.length === 0 && !chronicleStore.isStreaming
})

const scrollToBottom = async () => {
  await nextTick()
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
  }
}

watch(() => chronicleStore.history.length, async (newLen, oldLen) => {
  await scrollToBottom()
})
watch(() => chronicleStore.currentStreamText, scrollToBottom)

onMounted(async () => {
  await configStore.loadConfig()
  await chronicleStore.loadHistory()
  
  // 检查是否为空存档，如果是则显示开始按钮
  if (chronicleStore.history.length === 0) {
    showStartButton.value = true
  }
})

const handleStartStory = async () => {
  showStartButton.value = false
  
  // 添加系统初始化消息
  await chronicleStore.addEntry({
    turn: 1,
    role: 'system',
    content: 'System: Initializing World Simulation...',
    timestamp: Date.now()
  })
  
  // 触发AI生成开场
  await chronicleStore._generateAIResponse()
}

const handleSend = async () => {
  if (!userInput.value || chronicleStore.isStreaming) return
  
  const text = userInput.value
  userInput.value = ''

  await chronicleStore.processUserMessage(text)
}

const handleContinue = async () => {
  if (chronicleStore.isStreaming || chronicleStore.isWaitingForRoll) return
  // Trigger AI response without adding a user message
  await chronicleStore._generateAIResponse()
}

const handleRollback = async (turn: number) => {
  await chronicleStore.rollback(turn)
}
</script>

<template>
  <div class="chronicle-zone">
    <div class="history" ref="scrollContainer">
      <!-- 空存档开始按钮 -->
      <div v-if="showStartButton" class="start-story-overlay">
        <div class="start-story-card">
          <BookOpen :size="48" class="start-icon" />
          <h2>欢迎来到 {{ worldStore.meta?.name || '奥尔特大陆' }}</h2>
          <p class="start-hint">点击下方按钮，开启你的冒险之旅</p>
          <button class="btn-start-story" @click="handleStartStory" :disabled="chronicleStore.isStreaming">
            <Play :size="20" />
            开始故事
          </button>
        </div>
      </div>

      <Bubble 
        v-for="entry in chronicleStore.history" 
        :key="entry.id || entry.timestamp"
        v-bind="entry"
        @rollback="handleRollback"
      />
      <Bubble 
        v-if="chronicleStore.isStreaming"
        role="assistant"
        :content="chronicleStore.currentStreamText"
        :turn="chronicleStore.history.length + 1"
        :is-streaming="true"
      />
    </div>
    
    <div class="input-area">
      <textarea 
        v-model="userInput" 
        :placeholder="chronicleStore.isWaitingForRoll ? '等待投掷...' : '输入你的行动...'"
        :disabled="chronicleStore.isWaitingForRoll"
        @keydown.enter.prevent="handleSend"
      ></textarea>
      <button @click="handleSend" :disabled="chronicleStore.isStreaming || chronicleStore.isWaitingForRoll" title="发送">
        <Send :size="20" />
      </button>
      <button @click="handleContinue" :disabled="chronicleStore.isStreaming || chronicleStore.isWaitingForRoll" title="剧情推进 (AI Continue)">
        <Play :size="20" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.chronicle-zone {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  width: 100%;
  overflow: hidden; /* Prevent body scroll */
  background: transparent;
}

.history {
  flex: 1 1 auto; /* Grow and Shrink */
  overflow-y: auto;
  min-height: 0; /* Crucial for flex scrolling */
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px; /* Spacing between lines */
  background-color: transparent;
  position: relative; /* 为绝对定位的覆盖层提供定位上下文 */
}

.input-area {
  flex-shrink: 0;
  padding: 15px;
  background-color: var(--bg-panel);
  backdrop-filter: var(--glass-backdrop);
  border-top: var(--glass-border);
  display: flex;
  gap: 10px;
  align-items: flex-end;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  z-index: 10;
  overflow: hidden;
}

textarea {
  flex: 1;
  min-width: 0; /* Important for flex container to prevent overflow */
  max-width: 100%;
  background-color: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
  padding: 10px;
  border-radius: 4px;
  resize: none;
  min-height: 20px;
  max-height: 100px;
  font-family: inherit;
  box-sizing: border-box;
  transition: all 0.2s;
}

textarea:focus {
  outline: none;
  border-color: var(--accent-gold);
  background-color: rgba(0, 0, 0, 0.5);
}

button {
  background-color: rgba(212, 175, 55, 0.1);
  color: var(--accent-gold);
  border: 1px solid rgba(212, 175, 55, 0.2);
  padding: 10px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

button:hover {
  background-color: var(--accent-gold);
  color: #000;
  box-shadow: 0 0 10px rgba(212, 175, 55, 0.3);
}

button:disabled {
  background-color: rgba(255, 255, 255, 0.05);
  border-color: transparent;
  cursor: not-allowed;
  color: #666;
  box-shadow: none;
}

/* 开始故事按钮样式 */
.start-story-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(3px);
  z-index: 100;
}

.start-story-card {
  background: linear-gradient(135deg, rgba(26, 26, 26, 0.95), rgba(40, 40, 40, 0.95));
  border: 2px solid #d4af37;
  border-radius: 16px;
  padding: 50px 60px;
  text-align: center;
  box-shadow: 0 0 60px rgba(212, 175, 55, 0.4), 0 20px 40px rgba(0, 0, 0, 0.7);
  max-width: 500px;
  animation: fadeInScale 0.5s ease-out;
}

@keyframes fadeInScale {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.start-icon {
  color: #d4af37;
  margin-bottom: 20px;
  filter: drop-shadow(0 0 10px rgba(212, 175, 55, 0.5));
}

.start-story-card h2 {
  margin: 0 0 15px 0;
  font-size: 28px;
  color: #d4af37;
  font-family: 'Georgia', serif;
  letter-spacing: 2px;
  text-shadow: 0 0 20px rgba(212, 175, 55, 0.3);
}

.start-hint {
  margin: 0 0 30px 0;
  font-size: 15px;
  color: #aaa;
  line-height: 1.6;
}

.btn-start-story {
  background: linear-gradient(135deg, #d4af37, #f0c040);
  color: #000;
  border: none;
  padding: 15px 40px;
  border-radius: 8px;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(212, 175, 55, 0.3);
}

.btn-start-story:hover:not(:disabled) {
  background: linear-gradient(135deg, #f0c040, #d4af37);
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(212, 175, 55, 0.5);
}

.btn-start-story:disabled {
  background: rgba(100, 100, 100, 0.3);
  color: #666;
  cursor: not-allowed;
  box-shadow: none;
}
</style>
