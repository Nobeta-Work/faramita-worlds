<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { Send, Play } from 'lucide-vue-next'

defineProps<{
  isStreaming: boolean
  isWaitingForRoll: boolean
}>()

const emit = defineEmits<{
  (e: 'send', text: string): void
  (e: 'continue'): void
}>()

const userInput = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

function handleSend() {
  if (!userInput.value.trim()) return
  const text = userInput.value
  userInput.value = ''
  emit('send', text)
  nextTick(() => autoResize())
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
  // Shift+Enter allows natural newline
}

function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}
</script>

<template>
  <div class="input-area">
    <textarea
      ref="textareaRef"
      v-model="userInput"
      :placeholder="isWaitingForRoll ? '等待投掷...' : '输入你的行动... (Shift+Enter 换行)'"
      :disabled="isWaitingForRoll"
      @keydown="handleKeydown"
      @input="autoResize"
      rows="1"
    ></textarea>
    <button @click="handleSend" :disabled="isStreaming || isWaitingForRoll" title="发送">
      <Send :size="20" />
    </button>
    <button @click="emit('continue')" :disabled="isStreaming || isWaitingForRoll" title="剧情推进 (AI Continue)">
      <Play :size="20" />
    </button>
  </div>
</template>

<style scoped>
.input-area {
  flex-shrink: 0;
  padding: 14px 16px;
  background-color: var(--bg-panel);
  backdrop-filter: var(--glass-backdrop);
  border-top: var(--glass-border);
  display: flex;
  gap: 10px;
  align-items: flex-end;
  width: 100%;
  box-sizing: border-box;
  z-index: 10;
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--border-default) 65%, transparent);
  overflow: hidden;
}

textarea {
  flex: 1;
  min-width: 0;
  max-width: 100%;
  background-color: var(--bg-elevated);
  border: 1px solid var(--border-default);
  color: var(--text-primary);
  padding: 10px;
  border-radius: var(--radius-sm);
  resize: none;
  min-height: 20px;
  max-height: 100px;
  font-family: inherit;
  box-sizing: border-box;
  transition: all var(--motion-base) ease;
}

textarea:focus {
  outline: none;
  border-color: var(--accent-primary);
  background-color: var(--bg-surface);
  box-shadow: 0 0 0 2px var(--accent-primary-weak);
}

button {
  background-color: var(--accent-gold-weak);
  color: var(--accent-gold);
  border: 1px solid var(--accent-gold);
  padding: 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--motion-base) ease;
}

button:hover {
  background-color: var(--accent-gold);
  color: var(--bg-surface);
  box-shadow: var(--glow-gold);
}

button:disabled {
  background-color: var(--bg-elevated);
  border-color: transparent;
  cursor: not-allowed;
  color: var(--text-muted);
  box-shadow: none;
}
</style>
