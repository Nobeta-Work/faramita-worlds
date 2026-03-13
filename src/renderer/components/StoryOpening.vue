<script setup lang="ts">
import { BookOpen, Play } from 'lucide-vue-next'

defineProps<{
  worldName: string
  disabled: boolean
}>()

const emit = defineEmits<{
  (e: 'start'): void
}>()
</script>

<template>
  <div class="start-story-overlay">
    <div class="start-story-card">
      <BookOpen :size="48" class="start-icon" />
      <h2>欢迎来到 {{ worldName }}</h2>
      <p class="start-hint">点击下方按钮，开启你的冒险之旅</p>
      <button class="btn-start-story" @click="emit('start')" :disabled="disabled">
        <Play :size="20" />
        开始故事
      </button>
    </div>
  </div>
</template>

<style scoped>
.start-story-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-overlay);
  backdrop-filter: blur(6px);
  z-index: 100;
}

.start-story-card {
  background: linear-gradient(135deg, var(--bg-surface), color-mix(in srgb, var(--bg-elevated) 90%, transparent));
  border: 1px solid color-mix(in srgb, var(--accent-gold) 55%, var(--border-default));
  border-radius: 16px;
  padding: 50px 60px;
  text-align: center;
  box-shadow: var(--shadow-strong), var(--glow-gold);
  max-width: 500px;
  animation: fadeInScale 0.5s ease-out;
}

@keyframes fadeInScale {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}

.start-icon {
  color: var(--accent-gold);
  margin-bottom: 20px;
  filter: drop-shadow(0 0 10px color-mix(in srgb, var(--accent-gold) 55%, transparent));
}

.start-story-card h2 {
  margin: 0 0 15px 0;
  font-size: 28px;
  color: var(--accent-gold);
  font-family: 'Georgia', serif;
  letter-spacing: 2px;
  text-shadow: 0 0 20px color-mix(in srgb, var(--accent-gold) 40%, transparent);
}

.start-hint {
  margin: 0 0 30px 0;
  font-size: 15px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.btn-start-story {
  background: linear-gradient(135deg, var(--accent-gold), var(--accent-gold-strong));
  color: var(--bg-surface);
  border: none;
  padding: 15px 40px;
  border-radius: 8px;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  transition: all var(--motion-slow) ease;
  box-shadow: var(--glow-gold);
}

.btn-start-story:hover:not(:disabled) {
  background: linear-gradient(135deg, var(--accent-gold-strong), var(--accent-gold));
  transform: translateY(-2px);
  box-shadow: var(--shadow-soft), var(--glow-gold);
}

.btn-start-story:disabled {
  background: var(--bg-elevated);
  color: var(--text-muted);
  cursor: not-allowed;
  box-shadow: none;
}
</style>
