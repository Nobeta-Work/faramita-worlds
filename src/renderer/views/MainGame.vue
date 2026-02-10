<script setup lang="ts">
import { onMounted } from 'vue'
import { useWorldStore } from '../store/world'
import { useChronicleStore } from '../store/chronicle'
import ChronicleZone from '../components/ChronicleZone.vue'
import CodexZone from '../components/CodexZone.vue'

const worldStore = useWorldStore()
const chronicleStore = useChronicleStore()

onMounted(async () => {
  await worldStore.loadWorld()
  await chronicleStore.loadHistory()
})
</script>

<template>
  <div class="main-game">
    <div class="zone-a">
      <ChronicleZone />
    </div>
    <div class="zone-b">
      <CodexZone />
    </div>
  </div>
</template>

<style scoped>
.main-game {
  display: grid;
  grid-template-columns: 70% 30%;
  height: 100%;
  min-height: 0;
  width: 100%;
  background-color: transparent;
  overflow: hidden;
}

.zone-a {
  border-right: var(--glass-border);
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden; /* Ensure it doesn't expand beyond viewport */
  background: rgba(0, 0, 0, 0.2); /* Slight tint */
}

.zone-b {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background-color: transparent;
}
</style>
