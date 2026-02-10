<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  text: string
  speed?: number
}>()

const emit = defineEmits(['finish'])

const displayedText = ref('')
let index = 0
let timer: any = null

const type = () => {
  if (index < props.text.length) {
    displayedText.value += props.text.charAt(index)
    index++
    timer = setTimeout(type, props.speed || 30)
  } else {
    emit('finish')
  }
}

watch(() => props.text, (newVal) => {
  // If text is being appended (streaming), we just continue typing
  if (newVal.startsWith(displayedText.value)) {
    if (!timer) type()
  } else {
    // If text changed completely, reset
    displayedText.value = ''
    index = 0
    if (timer) clearTimeout(timer)
    type()
  }
})

onMounted(() => {
  type()
})

onUnmounted(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <span class="typewriter">{{ displayedText }}</span>
</template>

<style scoped>
.typewriter {
  white-space: pre-wrap;
}
</style>
