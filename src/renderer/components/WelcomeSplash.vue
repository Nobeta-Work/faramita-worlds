<script setup lang="ts">
import { ref } from 'vue'
import { Sparkles, Globe, FileText } from 'lucide-vue-next'
import { useConfigStore } from '../store/config'

const configStore = useConfigStore()
const emit = defineEmits<{
  (e: 'quickStart'): void
  (e: 'createWorld'): void
  (e: 'importText'): void
  (e: 'dismiss'): void
}>()

const dontShowAgain = ref(false)

const handleDismiss = async () => {
  if (dontShowAgain.value) {
    configStore.skipWelcome = true
    await configStore.saveConfig()
  }
  emit('dismiss')
}

const handleAction = async (action: 'quickStart' | 'createWorld' | 'importText') => {
  if (dontShowAgain.value) {
    configStore.skipWelcome = true
    await configStore.saveConfig()
  }
  if (action === 'quickStart') emit('quickStart')
  else if (action === 'createWorld') emit('createWorld')
  else emit('importText')
}
</script>

<template>
  <div class="welcome-overlay" @click.self="handleDismiss">
    <div class="welcome-card">
      <div class="welcome-header">
        <div class="title-line">✦ Faramita Worlds ✦</div>
        <div class="version">v0.2.0</div>
        <div class="tagline">在叙事的世界中铸造你的命运</div>
      </div>

      <div class="action-row">
        <button class="action-btn" @click="handleAction('quickStart')">
          <Sparkles :size="20" />
          <span>快速体验</span>
        </button>
        <button class="action-btn" @click="handleAction('createWorld')">
          <Globe :size="20" />
          <span>创建世界</span>
        </button>
        <button class="action-btn" @click="handleAction('importText')">
          <FileText :size="20" />
          <span>导入文本</span>
        </button>
      </div>

      <label class="skip-check">
        <input type="checkbox" v-model="dontShowAgain" />
        下次不再显示
      </label>
    </div>
  </div>
</template>

<style scoped>
.welcome-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-overlay);
  backdrop-filter: blur(8px);
  animation: fadeIn 0.4s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.welcome-card {
  background: var(--bg-panel);
  border: 1px solid var(--accent-gold);
  border-radius: var(--radius-lg, 12px);
  padding: 48px 40px 32px;
  text-align: center;
  box-shadow: 0 0 40px rgba(0, 0, 0, 0.5), 0 0 80px color-mix(in srgb, var(--accent-gold) 15%, transparent);
  max-width: 480px;
  width: 90%;
  animation: cardIn 0.5s ease 0.1s both;
}

@keyframes cardIn {
  from { opacity: 0; transform: translateY(20px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.welcome-header {
  margin-bottom: 36px;
}

.title-line {
  font-size: 24px;
  font-weight: 700;
  color: var(--accent-gold);
  font-family: 'Georgia', serif;
  letter-spacing: 2px;
}

.version {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 6px;
}

.tagline {
  font-size: 14px;
  color: var(--text-secondary);
  margin-top: 12px;
  font-style: italic;
}

.action-row {
  display: flex;
  gap: 16px;
  justify-content: center;
  margin-bottom: 28px;
}

.action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 20px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md, 8px);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.25s ease;
  min-width: 100px;
}

.action-btn:hover {
  border-color: var(--accent-gold);
  background: var(--bg-elevated);
  box-shadow: 0 0 12px color-mix(in srgb, var(--accent-gold) 25%, transparent);
  transform: translateY(-2px);
}

.action-btn span {
  font-size: 13px;
  font-weight: 600;
}

.skip-check {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-tertiary);
  cursor: pointer;
}

.skip-check input {
  accent-color: var(--accent-gold);
}
</style>
