<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
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
</script>

<template>
  <div class="log-entry">
    <!-- SYSTEM MESSAGE -->
    <div v-if="role === 'system'" class="line system">
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
          <span class="content">
            <template v-if="shouldAnimate">
               <Typewriter 
                 v-if="idx === visibleItemIndex" 
                 :text="item.content" 
                 :speed="20"
                 @finish="onTypewriterFinish"
               />
               <span v-else-if="idx < visibleItemIndex">{{ item.content }}</span>
               <!-- Future items are hidden -->
            </template>
            <template v-else>
              {{ item.content }}
            </template>
          </span>
        </template>
        
        <!-- Dialogue -->
        <template v-else-if="item.type === 'dialogue'">
          <template v-if="shouldAnimate">
            <!-- Only show speaker if we reached this item -->
            <span v-if="idx <= visibleItemIndex" class="speaker">{{ item.speaker_name }}:</span>
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
            <span class="speaker">{{ item.speaker_name }}:</span>
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
  margin-bottom: 8px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  line-height: 1.6;
  font-size: 14px;
  color: var(--text-flow-base);
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
  color: #d4af37;
  font-weight: bold;
  margin-right: 8px;
}

/* System Styling */
.system {
  font-family: 'Consolas', monospace;
  font-size: 13px;
  color: var(--text-flow-system);
}

.system .prefix {
  color: #ff6b6b;
  font-weight: bold;
  margin-right: 8px;
}

/* AI Styling */
.assistant {
  color: var(--text-flow-base);
}

.assistant .prefix {
  color: #4ecdc4;
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

.seq-item.environment .content {
  color: var(--text-flow-env);
}

.seq-item.dialogue .content {
  color: var(--text-flow-dialogue);
}

.streaming {
  color: var(--accent-gold);
  font-style: italic;
  opacity: 0.9;
}

.thinking-dots {
  display: inline-block;
  animation: pulse 1.5s infinite;
  color: #888;
  margin-right: 5px;
}

@keyframes pulse {
  0% { opacity: 0.3; }
  50% { opacity: 1; }
  100% { opacity: 0.3; }
}
</style>
