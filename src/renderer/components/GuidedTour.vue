<script setup lang="ts">
import { ref, computed } from 'vue'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const currentStep = ref(0)

const steps = [
  {
    title: '叙事区',
    description: '这里是故事发生的地方。AI 会以结构化叙事呈现环境描述和角色对话。',
    target: '.zone-a',
    position: 'right' as const
  },
  {
    title: '输入行动',
    description: '在底部输入栏描述你的角色想要做什么，按回车或点击发送按钮提交。',
    target: '.chronicle-input',
    position: 'top' as const
  },
  {
    title: '角色面板',
    description: '右侧面板显示活跃角色的特质标签、背景和状态。点击角色查看详情。',
    target: '.active-area',
    position: 'left' as const
  },
  {
    title: '投骰区',
    description: '当叙事触发判定时，点击骰子区投掷 2d6。结果将决定故事走向——金色大成功、蓝色部分成功、红色失败。',
    target: '.dice-area',
    position: 'left' as const
  }
]

const step = computed(() => steps[currentStep.value])
const isLast = computed(() => currentStep.value >= steps.length - 1)

const next = () => {
  if (isLast.value) {
    emit('close')
  } else {
    currentStep.value++
  }
}

const prev = () => {
  if (currentStep.value > 0) currentStep.value--
}

const skip = () => emit('close')
</script>

<template>
  <div class="tour-overlay">
    <div class="tour-backdrop" @click="skip"></div>

    <div class="tour-tooltip" :class="step.position">
      <div class="tooltip-step">{{ currentStep + 1 }} / {{ steps.length }}</div>
      <div class="tooltip-title">{{ step.title }}</div>
      <div class="tooltip-desc">{{ step.description }}</div>
      <div class="tooltip-actions">
        <button v-if="currentStep > 0" class="btn-prev" @click="prev">上一步</button>
        <span class="spacer"></span>
        <button class="btn-skip" @click="skip">跳过</button>
        <button class="btn-next" @click="next">
          {{ isLast ? '开始冒险' : '下一步' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tour-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  pointer-events: none;
}

.tour-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  pointer-events: auto;
}

.tour-tooltip {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--bg-panel);
  border: 1px solid var(--accent-gold);
  border-radius: var(--radius-md, 8px);
  padding: 24px 28px;
  max-width: 360px;
  width: 90%;
  box-shadow: 0 0 30px rgba(0, 0, 0, 0.6), 0 0 60px color-mix(in srgb, var(--accent-gold) 10%, transparent);
  pointer-events: auto;
  animation: tooltipIn 0.3s ease;
  z-index: 1;
}

@keyframes tooltipIn {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

.tooltip-step {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-bottom: 6px;
}

.tooltip-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--accent-gold);
  margin-bottom: 8px;
}

.tooltip-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.7;
  margin-bottom: 18px;
}

.tooltip-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.spacer { flex: 1; }

.btn-prev, .btn-skip, .btn-next {
  padding: 6px 14px;
  border-radius: var(--radius-sm, 4px);
  font-size: 13px;
  cursor: pointer;
  border: 1px solid var(--border-default);
  transition: all 0.2s ease;
}

.btn-prev {
  background: transparent;
  color: var(--text-secondary);
  border-color: var(--border-default);
}
.btn-prev:hover {
  color: var(--text-primary);
  border-color: var(--text-secondary);
}

.btn-skip {
  background: transparent;
  color: var(--text-tertiary);
  border: none;
}
.btn-skip:hover {
  color: var(--text-secondary);
}

.btn-next {
  background: color-mix(in srgb, var(--accent-gold) 15%, transparent);
  color: var(--accent-gold);
  border-color: var(--accent-gold);
}
.btn-next:hover {
  background: color-mix(in srgb, var(--accent-gold) 25%, transparent);
  box-shadow: 0 0 8px color-mix(in srgb, var(--accent-gold) 20%, transparent);
}
</style>
