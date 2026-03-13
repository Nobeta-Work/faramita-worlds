<script setup lang="ts">
import { computed, ref } from 'vue'
import Typewriter from './Typewriter.vue'

const props = defineProps<{
  role: 'user' | 'assistant' | 'system'
  content: string
  turn: number
  timestamp?: number
  isStreaming?: boolean
}>()

const emit = defineEmits(['rollback'])

const visibleItemIndex = ref(0)
const animationFinished = ref(false)

const shouldAnimate = computed(() => {
  // Only animate if it's not streaming (it's a final result), 
  // AND it's a recent message (less than 2 seconds old),
  // AND it hasn't finished animating yet.
  if (props.isStreaming) return false
  if (animationFinished.value) return false
  if (!props.timestamp) return false
  
  const isRecent = (Date.now() - props.timestamp) < 3000
  return isRecent
})

const onTypewriterFinish = () => {
  visibleItemIndex.value++
}

const onSystemTypewriterFinish = () => {
  animationFinished.value = true
}

// Watch for sequence changes to reset if needed? 
// No, purely props based. If component remounts, state resets.

const parsedSequence = computed(() => {
  if (props.role !== 'assistant') return null
  try {
    const json = JSON.parse(props.content)
    if (json && Array.isArray(json.sequence)) {
      return json.sequence
    }
    return null
  } catch (e) {
    return null
  }
})

const isDiceMessage = computed(() => {
  return props.role === 'system' && props.content.startsWith('[DICE]')
})

const diceDisplayText = computed(() => {
  if (!isDiceMessage.value) return ''
  return props.content.replace(/^\[DICE\]\s*/, '')
})

// Generate a stable color from speaker name for character color coding
const speakerColor = (name: string) => {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = ((hash % 360) + 360) % 360
  return `hsl(${hue}, 55%, 65%)`
}
</script>

<template>
  <div class="log-entry" :class="{ 'dice-entry': isDiceMessage }">
    <!-- DICE ROLL (COMPACT) -->
    <div v-if="isDiceMessage" class="dice-line">
      <span class="dice-icon">🎲</span>
      <span class="dice-text">{{ diceDisplayText }}</span>
    </div>

    <!-- SYSTEM MESSAGE -->
    <div v-else-if="role === 'system'" class="line system">
      <span class="prefix">[SYSTEM]</span>
      <span class="content">
        <Typewriter 
          v-if="shouldAnimate" 
          :text="content" 
          :speed="20"
          @finish="onSystemTypewriterFinish"
        />
        <template v-else>{{ content }}</template>
      </span>
    </div>

    <!-- USER INPUT -->
    <div v-else-if="role === 'user'" class="line user">
      <span class="prefix">&gt;</span>
      <span class="content">{{ content }}</span>
    </div>

    <!-- AI ASSISTANT (STREAMING) -->
    <div v-else-if="isStreaming" class="line assistant streaming">
      <span class="prefix">[Gamemaster]</span>
      <span class="content">
        <span class="thinking-dots">...</span>
        {{ content || 'Thinking...' }}
      </span>
    </div>

    <!-- AI ASSISTANT (STRUCTURED) -->
    <div v-else-if="parsedSequence" class="line assistant">
      <div v-for="(item, idx) in parsedSequence" :key="idx" class="seq-item" :class="item.type">
        <!-- Environment Text -->
        <template v-if="item.type === 'environment'">
          <div class="env-block">
            <template v-if="shouldAnimate">
               <Typewriter 
                 v-if="idx === visibleItemIndex" 
                 :text="item.content" 
                 :speed="20"
                 @finish="onTypewriterFinish"
               />
               <span v-else-if="idx < visibleItemIndex">{{ item.content }}</span>
            </template>
            <template v-else>
              {{ item.content }}
            </template>
          </div>
        </template>
        
        <!-- Dialogue -->
        <template v-else-if="item.type === 'dialogue'">
          <template v-if="shouldAnimate">
            <span v-if="idx <= visibleItemIndex" class="speaker" :style="{ color: speakerColor(item.speaker_name || '') }">{{ item.speaker_name }}:</span>
            <span v-if="idx <= visibleItemIndex" class="content">"
              <Typewriter 
                 v-if="idx === visibleItemIndex" 
                 :text="item.content" 
                 :speed="30"
                 @finish="onTypewriterFinish"
               />
               <span v-else-if="idx < visibleItemIndex">{{ item.content }}</span>
            "</span>
          </template>
          <template v-else>
            <span class="speaker" :style="{ color: speakerColor(item.speaker_name || '') }">{{ item.speaker_name }}:</span>
            <span class="content">"{{ item.content }}"</span>
          </template>
        </template>
      </div>

    </div>

    <!-- AI ASSISTANT (FALLBACK) -->
    <div v-else class="line assistant">
      <span class="content">{{ content }}</span>
    </div>
  </div>
</template>

<style scoped>
.log-entry {
  width: 100%;
  margin-bottom: 2px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid color-mix(in srgb, var(--border-default) 72%, transparent);
  background: color-mix(in srgb, var(--bg-elevated) 84%, transparent);
  backdrop-filter: blur(4px);
  font-family: var(--font-sans);
  line-height: 1.6;
  font-size: inherit;
  color: var(--text-flow-base);
  transition: all var(--motion-base) ease;
}

.log-entry:hover {
  border-color: color-mix(in srgb, var(--border-strong) 80%, transparent);
  background: color-mix(in srgb, var(--bg-elevated) 96%, transparent);
}

.line {
  word-wrap: break-word;
  white-space: pre-wrap;
}

/* User Styling */
.user {
  color: var(--text-flow-user);
}

.user .prefix {
  color: var(--accent-gold);
  font-weight: bold;
  margin-right: 8px;
}

/* System Styling */
.system {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  font-size: 0.93em;
  color: var(--text-flow-system);
}

.system .prefix {
  color: var(--state-danger);
  font-weight: bold;
  margin-right: 8px;
}

/* AI Styling */
.assistant {
  color: var(--text-flow-base);
}

.assistant .prefix {
  color: var(--state-success);
  font-weight: bold;
  margin-right: 8px;
}

.seq-item {
  margin-bottom: 4px;
}

.speaker {
  color: var(--text-flow-speaker);
  font-weight: bold;
  margin-right: 6px;
}

.env-block {
  border-left: 2px solid var(--accent-gold);
  padding-left: 1em;
  text-indent: 2em;
  line-height: 1.8;
  color: var(--text-flow-env);
}

/* Dice roll compact styling */
.log-entry.dice-entry {
  padding: 3px 10px;
  border-color: color-mix(in srgb, var(--accent-gold) 25%, transparent);
  background: color-mix(in srgb, var(--accent-gold) 4%, transparent);
}

.dice-line {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 0.88em;
  white-space: normal;
}

.dice-icon {
  font-size: 13px;
  flex-shrink: 0;
}

.dice-text {
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.seq-item.dialogue .content {
  color: var(--text-flow-dialogue);
}

.streaming {
  color: var(--accent-gold);
  font-style: italic;
  opacity: 0.9;
  border-left: 2px solid color-mix(in srgb, var(--accent-gold) 65%, transparent);
  padding-left: 8px;
}

.thinking-dots {
  display: inline-block;
  animation: pulse 1.5s infinite;
  color: var(--text-muted);
  margin-right: 5px;
}

@keyframes pulse {
  0% { opacity: 0.3; }
  50% { opacity: 1; }
  100% { opacity: 0.3; }
}
</style>
