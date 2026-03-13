<script setup lang="ts">
import { ref, watch, computed, toRaw } from 'vue'
import { WorldCard, Visibility } from '@shared/Interface'
import { useWorldStore } from '../store/world'
import { X, Save } from 'lucide-vue-next'
import AccordionPanel from './AccordionPanel.vue'
import TraitTagEditor from './TraitTagEditor.vue'
import CharacterEditor from './editors/CharacterEditor.vue'
import SettingEditor from './editors/SettingEditor.vue'
import ChapterEditor from './editors/ChapterEditor.vue'
import InteractionEditor from './editors/InteractionEditor.vue'
import CustomEditor from './editors/CustomEditor.vue'

const worldStore = useWorldStore()

const props = defineProps<{
  card: WorldCard | null
}>()

const emit = defineEmits(['save', 'close', 'activate-chapter'])

const editedCard = ref<any>(null)

watch(() => props.card, (newCard) => {
  if (newCard) {
    const cloned = JSON.parse(JSON.stringify(newCard))

    // Defensive initialization
    if (cloned.type === 'setting') {
      if (!cloned.tags) cloned.tags = []
      if (!cloned.suffix_names) cloned.suffix_names = []
      if (!cloned.scaling_modes) cloned.scaling_modes = {}
      if (cloned.step === undefined) cloned.step = 20
      if (cloned.default_mode === undefined) cloned.default_mode = ''
    }
    if (cloned.type === 'interaction') {
      if (cloned.min_level === undefined) cloned.min_level = 1
      if (cloned.element === undefined) cloned.element = ''
      if (cloned.cost === undefined) cloned.cost = ''
      if (cloned.d20_logic === undefined) cloned.d20_logic = null
      if (cloned.effect === undefined) cloned.effect = ''
      if (!cloned.description) cloned.description = ''
      if (!cloned.difficulty) cloned.difficulty = 'normal'
      if (!cloned.related_tags) cloned.related_tags = []
      if (!cloned.prerequisite_tags) cloned.prerequisite_tags = []
    }
    if (cloned.type === 'character') {
      if (!cloned.personality) cloned.personality = []
      if (!cloned.status) cloned.status = []
      if (!cloned.affiliation) cloned.affiliation = []
      if (!cloned.inventory) cloned.inventory = []
      if (!cloned.background) cloned.background = []
      if (!cloned.tags) cloned.tags = []
      if (!cloned.traits) cloned.traits = []
      if (!cloned.voice_profile) {
        cloned.voice_profile = {
          tone: '',
          vocabulary_level: '口语化',
          speech_patterns: [],
          emotional_range: '',
          example_dialogues: []
        }
      }
    }
    if (cloned.type === 'chapter') {
      if (!cloned.summary) cloned.summary = ''
      if (!cloned.status) cloned.status = 'pending'
      if (cloned.is_current === undefined) cloned.is_current = false
      if (!cloned.rewards) cloned.rewards = []
      if (!cloned.tags) cloned.tags = []
      if (!cloned.plot_points) cloned.plot_points = []
    }
    if (cloned.type === 'custom') {
      if (!cloned.title) cloned.title = ''
      if (!cloned.content) cloned.content = ''
      if (!cloned.tags) cloned.tags = []
      if (!cloned.category) cloned.category = '未分类'
    }

    editedCard.value = cloned
  } else {
    editedCard.value = null
  }
}, { immediate: true, deep: true })

const handleSave = () => {
  if (editedCard.value) {
    const rawData = JSON.parse(JSON.stringify(toRaw(editedCard.value)))
    emit('save', rawData)
  }
}

// --- Summaries for accordion headers ---
const cardSummary = computed(() => {
  const c = editedCard.value
  if (!c) return ''
  switch (c.type) {
    case 'character': return `${c.name || '?'} · Lv.${c.level} ${c.class || ''}`
    case 'setting': return `${c.title || '?'} · ${c.category || ''}`
    case 'chapter': return `${c.title || '?'} · ${c.status || ''}`
    case 'interaction': return `${c.name || '?'} · ${c.difficulty || ''}`
    case 'custom': return `${c.title || '?'} · ${c.category || ''}`
    default: return ''
  }
})

function onTraitsUpdate(traits: any[]) {
  if (editedCard.value) editedCard.value.traits = traits
}

function initVisibility() {
  if (editedCard.value) {
    editedCard.value.visible = { public_visible: true, player_visible: true, unlock_condition: null }
  }
}
</script>

<template>
  <div v-if="editedCard" class="card-editor">
    <div class="editor-header">
      <h3>编辑世界卡: {{ editedCard.type }}</h3>
      <div class="header-actions">
        <button class="btn-save" @click="handleSave" title="保存">
          <Save :size="18" />
        </button>
        <button class="btn-close" @click="emit('close')" title="关闭">
          <X :size="18" />
        </button>
      </div>
    </div>

    <div class="editor-content">

      <!-- ============ Setting ============ -->
      <template v-if="editedCard.type === 'setting'">
        <AccordionPanel title="设定详情" :summary="cardSummary">
          <SettingEditor :card="editedCard" />
        </AccordionPanel>
      </template>

      <!-- ============ Chapter ============ -->
      <template v-if="editedCard.type === 'chapter'">
        <AccordionPanel title="章节详情" :summary="cardSummary">
          <ChapterEditor :card="editedCard" @activate-chapter="emit('activate-chapter')" />
        </AccordionPanel>
      </template>

      <!-- ============ Character ============ -->
      <template v-if="editedCard.type === 'character'">
        <AccordionPanel title="基本信息" :summary="cardSummary">
          <CharacterEditor :card="editedCard" section="basic" />
        </AccordionPanel>

        <AccordionPanel title="特质标签" :summary="`${(editedCard.traits || []).length} 个特质`">
          <TraitTagEditor
            :traits="editedCard.traits || []"
            :characterName="editedCard.name"
            :characterClass="editedCard.class"
            @update="onTraitsUpdate"
          />
        </AccordionPanel>

        <AccordionPanel title="背景与人格">
          <CharacterEditor :card="editedCard" section="background" />
        </AccordionPanel>

        <AccordionPanel title="声线配置" :initialOpen="false">
          <CharacterEditor :card="editedCard" section="voice" />
        </AccordionPanel>

        <AccordionPanel title="物品栏" :initialOpen="false">
          <CharacterEditor :card="editedCard" section="inventory" />
        </AccordionPanel>

        <AccordionPanel title="可见性" :initialOpen="false">
          <CharacterEditor :card="editedCard" section="visibility" />
        </AccordionPanel>
      </template>

      <!-- ============ Interaction ============ -->
      <template v-if="editedCard.type === 'interaction'">
        <AccordionPanel title="交互详情" :summary="cardSummary">
          <InteractionEditor :card="editedCard" />
        </AccordionPanel>
      </template>

      <!-- ============ Custom ============ -->
      <template v-if="editedCard.type === 'custom'">
        <AccordionPanel title="自定义详情" :summary="cardSummary">
          <CustomEditor :card="editedCard" />
        </AccordionPanel>
      </template>

      <!-- Visibility (non-character types) -->
      <template v-if="editedCard.type !== 'character'">
        <AccordionPanel title="可见性" :initialOpen="false">
          <template v-if="editedCard.visible">
            <div class="form-group inline">
              <label><input type="checkbox" v-model="editedCard.visible.public_visible" /> 公开可见</label>
              <label><input type="checkbox" v-model="editedCard.visible.player_visible" /> 玩家可见</label>
            </div>
            <div class="form-group">
              <label>解锁条件</label>
              <input type="text" v-model="editedCard.visible.unlock_condition" placeholder="留空则在遇见前不可见" />
            </div>
          </template>
          <button v-else class="btn-init" @click="initVisibility">初始化可见性配置</button>
        </AccordionPanel>
      </template>
    </div>

    <div class="editor-footer">
      <span class="world-name">{{ worldStore.meta?.name || '未知世界书' }}</span>
    </div>
  </div>
</template>

<style scoped>
.card-editor {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.editor-header {
  padding: 15px;
  border-bottom: 1px solid var(--border-default);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.editor-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--accent-gold);
}

.header-actions {
  display: flex;
  gap: 10px;
}

.header-actions button {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color var(--motion-base);
}

.header-actions button:hover { color: var(--text-primary); }
.btn-save:hover { color: var(--state-success) !important; }

.editor-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-group {
  margin-bottom: 12px;
}

.form-group.inline {
  display: flex;
  gap: 20px;
}

.form-group label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 5px;
}

.form-group input[type="text"],
.form-group input[type="number"],
.form-group textarea,
.form-group select {
  width: 100%;
  background-color: var(--bg-elevated);
  border: 1px solid var(--border-default);
  color: var(--text-primary);
  padding: 8px;
  border-radius: 4px;
  outline: none;
  box-sizing: border-box;
  transition: all var(--motion-base) ease;
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px var(--accent-primary-weak);
}

.btn-init {
  background: none;
  border: 1px dashed var(--border-strong);
  color: var(--text-secondary);
  font-size: 12px;
  padding: 8px;
  width: 100%;
  cursor: pointer;
  transition: all var(--motion-base) ease;
}

.btn-init:hover {
  color: var(--accent-gold);
  border-color: var(--accent-gold);
}

.editor-footer {
  padding: 10px 15px;
  border-top: 1px solid var(--border-default);
  display: flex;
  justify-content: flex-end;
}

.world-name {
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}
</style>
