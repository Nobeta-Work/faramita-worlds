<script setup lang="ts">
import { ref, computed } from 'vue'
import { useWorldStore } from '../store/world'
import { useChronicleStore } from '../store/chronicle'
import { LevelCalculator } from '../core/LevelCalculator'
import { CharacterCard } from '@shared/Interface'
import { User, Book, ChevronRight, ChevronDown, ArrowLeft, Plus, X, Edit, Check, Crown } from 'lucide-vue-next'
import TraitTagCloud from './TraitTagCloud.vue'
import type { CharacterCard as CharCardType } from '@shared/Interface'

const worldStore = useWorldStore()
const chronicleStore = useChronicleStore()
const selectedCharId = ref<string | null>(null)

const allCharacterCards = computed(() =>
  worldStore.cards.filter(c => c.type === 'character') as CharCardType[]
)

const currentPlayerCharId = computed(() =>
  worldStore.meta?.player_character_id || ''
)

const handlePlayerCharChange = async (e: Event) => {
  const value = (e.target as HTMLSelectElement).value
  await worldStore.setPlayerCharacterId(value || null)
  await worldStore.saveToFile()
}
const isEditing = ref(false)
const editForm = ref<any>(null)

const isPlayerCharacter = (card: any) => {
  const configuredPlayerId = (worldStore.meta as any)?.player_character_id
  if (configuredPlayerId && card.id === configuredPlayerId) {
    return true
  }

  return Array.isArray(card.tags) && card.tags.includes('player')
}

const selectedChar = computed(() => {
  if (!selectedCharId.value) return null
  return worldStore.cards.find(c => c.id === selectedCharId.value)
})

const startEdit = () => {
  if (!selectedChar.value) return
  // Deep copy for editing
  editForm.value = JSON.parse(JSON.stringify(selectedChar.value))
  isEditing.value = true
}

const saveEdit = async () => {
  if (!editForm.value) return
  await worldStore.updateCard(editForm.value)
  isEditing.value = false
}

const cancelEdit = () => {
  isEditing.value = false
  editForm.value = null
}

const canEdit = computed(() => {
  return !chronicleStore.isStreaming && !chronicleStore.isWaitingForRoll
})

const activeCards = computed(() => {
  return worldStore.cards.filter(c => {
    if (c.type === 'chapter') {
      const chapter = c as any
      return chapter.is_current === true || chapter.status === 'active'
    }
    
    if (c.type === 'character') {
      const isPlayer = isPlayerCharacter(c)
      // Show if in activeCharacterIds OR if player
      // AI controls visibility via activeCharacterIds
      if (worldStore.activeCharacterIds.includes(c.id)) return true
      if (isPlayer) return true
    }
    
    return false
  })
})

const showAddModal = ref(false)
const inactiveCharacters = computed(() => {
  return worldStore.cards.filter(c => 
    c.type === 'character' && 
    !worldStore.activeCharacterIds.includes(c.id) &&
    !isPlayerCharacter(c)
  )
})

const handleAddCharacter = async (id: string) => {
  await worldStore.updateActiveCharacters([id], [])
  chronicleStore.clearInteraction()
  showAddModal.value = false
}

const filterSecretEntries = (entries: string | string[] | undefined | null) => {
  if (!entries) return []
  let arr = Array.isArray(entries) ? entries : [entries]
  
  // Heuristic fix for split strings (e.g. ["魔", "法"] -> ["魔法"])
  // If the array has multiple items and all are single characters, join them.
  if (arr.length > 1 && arr.every(e => typeof e === 'string' && e.length === 1)) {
    arr = [arr.join('')]
  }

  return arr.filter(entry => {
    if (!entry) return false
    const trimmed = entry.trim()
    // Check for both half-width (?) and full-width （？） in any position
    return !trimmed.includes('(?)') && !trimmed.includes('（？）')
  })
}

const toggleCharDetails = (id: string) => {
  selectedCharId.value = selectedCharId.value === id ? null : id
}

const parseStatus = (s: string) => {
  const match = s.match(/\[(.*?)\](.*)/)
  if (match) {
    return { name: match[1], effect: match[2] }
  }
  return { name: null, effect: s }
}

const getDisplayName = (card: any) => {
  if (card.type === 'character') {
    const levelSetting = worldStore.cards.find(c => c.type === 'setting' && c.category === 'level')
    const classSetting = worldStore.cards.find(c => c.type === 'setting' && c.title === card.class)
    const title = LevelCalculator.getCharacterFullTitle(card as any, levelSetting as any, classSetting as any)
    return `${card.name} (${title})`
  }
  return card.title || card.name || card.id
}

const traitTypeLabels: Record<string, string> = {
  strength: '✦ 优势',
  flaw: '✧ 弱点',
  bond: '♦ 羁绊',
  mark: '★ 印记'
}
</script>

<template>
  <div class="active-codex">
    <!-- Detail View -->
    <template v-if="selectedChar">
      <div class="detail-view">
        <div class="detail-header">
          <button class="btn-back" @click="selectedCharId = null">
            <ArrowLeft :size="16" /> 返回
          </button>
          <div class="header-actions">
             <button v-if="!isEditing && canEdit" class="btn-icon" @click="startEdit" title="Edit">
               <Edit :size="16" />
             </button>
             <template v-if="isEditing">
               <button class="btn-icon save" @click="saveEdit" title="Save">
                 <Check :size="16" />
               </button>
               <button class="btn-icon cancel" @click="cancelEdit" title="Cancel">
                 <X :size="16" />
               </button>
             </template>
          </div>
        </div>
        
        <div class="header-title-row">
          <div v-if="!isEditing" class="header-title">{{ getDisplayName(selectedChar) }}</div>
          <input v-else v-model="editForm.name" class="edit-input title-input" placeholder="Name" />
        </div>

        <div class="detail-content">
          <!-- VIEW MODE -->
          <template v-if="!isEditing">
             <div class="details-section">
                <div class="section-label">头衔/职业</div>
                <div class="section-value">{{ LevelCalculator.getCharacterFullTitle(selectedChar as any, worldStore.cards.find(c => c.type === 'setting' && c.category === 'level') as any, worldStore.cards.find(c => c.type === 'setting' && c.title === (selectedChar as any).class) as any) }} (等级.{{ (selectedChar as any).level }})</div>
             </div>

             <div class="details-section">
                <div class="section-label">基本信息</div>
                <div class="char-brief">
                  <span v-for="r in filterSecretEntries((selectedChar as any).race)" :key="r" class="brief-item">{{ r }}</span>
                  <span class="separator">|</span>
                  <span class="brief-item">{{ (selectedChar as any).gender }}</span>
                </div>
             </div>
             
             <div v-if="filterSecretEntries((selectedChar as any).status).length" class="details-section">
                <div class="section-label">状态 (Status)</div>
                <div class="tags-list">
                  <span v-for="s in filterSecretEntries((selectedChar as any).status)" :key="s" class="tag-item status-tag">
                    <strong v-if="parseStatus(s).name">[{{ parseStatus(s).name }}]</strong>
                    {{ parseStatus(s).effect }}
                  </span>
                </div>
             </div>

             <div v-if="filterSecretEntries((selectedChar as any).background).length" class="details-section">
                <div class="section-label">背景 (Background)</div>
                <div class="background-list">
                  <div v-for="(bg, idx) in filterSecretEntries((selectedChar as any).background)" :key="idx" class="background-item">
                    {{ bg }}
                  </div>
                </div>
             </div>

             <div v-if="(selectedChar as any).traits && (selectedChar as any).traits.length" class="details-section">
                <div class="section-label">特质 (Traits)</div>
                <TraitTagCloud :traits="(selectedChar as any).traits" />
             </div>
          </template>

          <!-- EDIT MODE -->
          <template v-else>
             <div class="details-section">
                <div class="section-label">基本信息</div>
                <div class="edit-row">
                   <label>Gender</label>
                   <input v-model="editForm.gender" class="edit-input" />
                </div>
                <div class="edit-row">
                   <label>Level</label>
                   <input v-model.number="editForm.level" type="number" class="edit-input" />
                </div>
             </div>

             <div class="details-section">
                <div class="section-label">状态 (Status) - 逗号分隔</div>
                <input 
                  :value="Array.isArray(editForm.status) ? editForm.status.join(', ') : editForm.status" 
                  @input="e => editForm.status = (e.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(s => s)"
                  class="edit-input full-width"
                />
             </div>

             <div class="details-section">
                <div class="section-label">特质 (Traits) - 仅查看模式可编辑</div>
                <div v-if="editForm.traits && editForm.traits.length" class="traits-list">
                  <div v-for="(trait, idx) in editForm.traits" :key="idx" class="trait-item" :class="trait.type">
                    <span class="trait-type">{{ traitTypeLabels[trait.type] || trait.type }}</span>
                    <input v-model="editForm.traits[idx].text" class="edit-input" style="flex:1" />
                    <select v-model="editForm.traits[idx].type" class="edit-input" style="width:80px">
                      <option value="strength">优势</option>
                      <option value="flaw">弱点</option>
                      <option value="bond">羁绊</option>
                      <option value="mark">印记</option>
                    </select>
                    <input v-model.number="editForm.traits[idx].weight" type="number" min="1" max="3" class="edit-input" style="width:50px" />
                    <button class="btn-icon cancel" @click="editForm.traits.splice(idx, 1)" title="删除"><X :size="12" /></button>
                  </div>
                </div>
                <button class="btn-add-char" @click="editForm.traits = [...(editForm.traits || []), { type: 'strength', text: '', weight: 1 }]" style="margin-top:5px">
                  <Plus :size="12" /> 添加特质
                </button>
             </div>
          </template>

        </div>
      </div>
    </template>

    <!-- List View -->
    <template v-else>
      <div class="list-header">
        <div class="list-title">Active Information</div>
        <button class="btn-add-char" @click="showAddModal = true" title="添加活跃角色">
          <Plus :size="14" />
        </button>
      </div>

      <div v-if="allCharacterCards.length" class="player-selector">
        <Crown :size="12" class="player-icon" />
        <select :value="currentPlayerCharId" @change="handlePlayerCharChange" class="player-select">
          <option value="">自动</option>
          <option v-for="c in allCharacterCards" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>

      <div v-if="activeCards.length === 0" class="empty-state">
        暂无活跃信息 (探索剧情以解锁角色)
      </div>
      
      <div class="card-list">
        <div 
          v-for="card in activeCards" 
          :key="card.id" 
          class="active-card" 
          :class="[card.type, { clickable: card.type === 'character' }]"
          @click="card.type === 'character' && toggleCharDetails(card.id)"
        >
          <div class="card-header">
            <User v-if="card.type === 'character'" :size="16" />
            <Book v-else :size="16" />
            <span class="card-title">{{ getDisplayName(card) }}</span>
            <span v-if="card.type === 'chapter' && (card as any).is_current" class="current-tag">当前章节</span>
            <span v-else-if="card.type === 'chapter'" class="current-tag active-tag">活跃章节</span>
            <ChevronRight 
              v-if="card.type === 'character'" 
              :size="14" 
              class="expand-icon"
            />
          </div>
          
          <div v-if="card.type === 'chapter' && (card as any).objective" class="card-body">
            <span class="chapter-objective">{{ (card as any).objective }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- Add Character Modal -->
    <transition name="modal">
    <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>添加活跃角色</h3>
          <button class="btn-close" @click="showAddModal = false"><X :size="18" /></button>
        </div>
        <div class="modal-body">
          <div v-if="inactiveCharacters.length === 0" class="empty-list">
            没有可添加的角色
          </div>
          <div 
            v-for="char in inactiveCharacters" 
            :key="char.id" 
            class="char-item"
            @click="handleAddCharacter(char.id)"
          >
            <User :size="14" />
            <span>{{ (char as CharacterCard).name }}</span>
            <span class="char-id">{{ char.id }}</span>
          </div>
        </div>
      </div>
    </div>
    </transition>
  </div>
</template>

<style scoped>
.active-codex {
  padding: 8px;
  width: 100%;
  box-sizing: border-box;
  height: 100%;
  overflow-y: auto;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding: 0 4px;
}

.list-title {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 600;
}

.btn-add-char {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
  border-radius: 4px;
  cursor: pointer;
  padding: 4px 8px;
  transition: all 0.2s;
}

.btn-add-char:hover {
  background: var(--bg-elevated);
  border-color: var(--accent-gold);
  color: var(--accent-gold);
}

.player-selector {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  padding: 4px 6px;
  background: color-mix(in srgb, var(--accent-gold) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-gold) 25%, transparent);
  border-radius: var(--radius-sm);
}

.player-icon {
  color: var(--accent-gold);
  flex-shrink: 0;
}

.player-select {
  flex: 1;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  color: var(--text-primary);
  border-radius: 4px;
  padding: 3px 24px 3px 6px;
  font-size: 12px;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%237f8897' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;
  outline: none;
  transition: all 0.15s;
}

.player-select:focus {
  border-color: var(--accent-gold);
  box-shadow: 0 0 0 2px var(--accent-gold-weak);
}

.player-select option {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.card-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.active-card {
  background-color: transparent;
  border-left: 2px solid var(--border-default);
  padding: 6px 10px;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  width: 100%;
  box-sizing: border-box;
  transition: background-color var(--motion-base) ease;
}

.active-card:hover {
  background-color: var(--bg-hover);
}

.active-card.character {
  border-left-color: var(--accent-gold);
}

.active-card.chapter {
  border-left-color: var(--state-success);
}

.clickable {
  cursor: pointer;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-primary);
}

.card-header svg {
  flex-shrink: 0;
  color: var(--text-muted);
}

.card-title {
  flex: 1;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.current-tag {
  font-size: 9px;
  background-color: color-mix(in srgb, var(--state-success) 20%, transparent);
  color: var(--state-success);
  padding: 1px 5px;
  border-radius: 3px;
  text-transform: uppercase;
  flex-shrink: 0;
}

.current-tag.active-tag {
  background-color: color-mix(in srgb, var(--text-muted) 15%, transparent);
  color: var(--text-muted);
}

.expand-icon {
  color: var(--text-muted);
  opacity: 0.4;
  flex-shrink: 0;
}

.card-body {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
  padding-left: 22px;
}

/* Detail View Styles */
.detail-view {
  background-color: var(--bg-panel);
  backdrop-filter: var(--glass-backdrop);
  border: var(--glass-border);
  border-radius: 8px;
  padding: 20px;
  min-height: 100%;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20px;
}

.btn-back {
  background: none;
  border: none;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  font-size: 14px;
  padding: 0;
}

.btn-back:hover {
  color: var(--text-primary);
}

.header-actions {
  display: flex;
  gap: 10px;
}

.btn-icon {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
  width: 30px;
  height: 30px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-icon:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.btn-icon.save:hover {
  background: color-mix(in srgb, var(--state-success) 20%, transparent);
  color: var(--state-success);
  border-color: var(--state-success);
}

.btn-icon.cancel:hover {
  background: color-mix(in srgb, var(--state-danger) 20%, transparent);
  color: var(--state-danger);
  border-color: var(--state-danger);
}

.header-title-row {
  margin-bottom: 25px;
  border-bottom: 1px solid var(--border-default);
  padding-bottom: 15px;
}

.header-title {
  font-size: 20px;
  font-weight: bold;
  color: var(--accent-gold);
  font-family: 'Georgia', serif;
}

.details-section {
  margin-bottom: 25px;
}

.section-label {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: 8px;
  letter-spacing: 1px;
}

.section-value {
  color: var(--text-primary);
  font-size: 14px;
}

.char-brief {
  display: flex;
  gap: 10px;
  color: var(--text-primary);
}

.separator {
  color: var(--text-muted);
}

.background-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.background-item {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  padding: 8px;
  background: var(--bg-surface);
  border-radius: 4px;
  border-left: 2px solid var(--accent-gold);
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-item {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 13px;
  color: var(--text-primary);
}

.traits-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.trait-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-surface);
  padding: 8px 10px;
  border-radius: 4px;
  border-left: 3px solid var(--border-default);
  font-size: 13px;
}

.trait-item.strength { border-left-color: var(--accent-gold); }
.trait-item.flaw { border-left-color: var(--state-danger); }
.trait-item.bond { border-left-color: var(--state-info, #5599dd); }
.trait-item.mark { border-left-color: var(--state-warning, #cc8800); }

.trait-type {
  font-size: 11px;
  color: var(--text-secondary);
  min-width: 50px;
}

.trait-text {
  flex: 1;
  color: var(--text-primary);
}

.trait-weight {
  font-size: 11px;
  color: var(--accent-gold);
  font-weight: bold;
}

/* Edit Inputs */
.edit-input {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border-default);
  color: var(--text-primary);
  padding: 8px;
  border-radius: 4px;
  font-family: inherit;
  box-sizing: border-box;
}

.edit-input:focus {
  outline: none;
  border-color: var(--accent-gold);
  background: var(--bg-input-focus);
}

.title-input {
  font-size: 18px;
  font-weight: bold;
  color: var(--accent-gold);
}

.edit-row {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
}

.edit-row label {
  width: 60px;
  color: var(--text-secondary);
  font-size: 13px;
}

/* Modal Styling */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: var(--bg-overlay);
  backdrop-filter: blur(6px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-enter-active { transition: all 0.25s ease; }
.modal-leave-active { transition: all 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .modal-content { transform: scale(0.95); }
.modal-leave-to .modal-content { transform: scale(0.97); }

.modal-content {
  background: var(--bg-panel);
  border: 1px solid var(--accent-gold);
  width: 320px;
  max-height: 450px;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  box-shadow: var(--shadow-strong);
  transition: transform 0.25s ease;
}

.modal-header {
  padding: 15px 20px;
  border-bottom: 1px solid var(--border-default);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-header);
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--accent-gold);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.btn-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--motion-base) ease;
  border-radius: var(--radius-sm);
}

.btn-close:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.modal-body {
  padding: 10px;
  overflow-y: auto;
}

.char-item {
  padding: 12px 15px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--border-default);
  cursor: pointer;
  transition: background 0.2s;
  color: var(--text-primary);
}

.char-item:hover {
  background: var(--bg-hover);
  color: var(--accent-gold);
}

.char-item:last-child {
  border-bottom: none;
}

.char-id {
  font-size: 11px;
  color: var(--text-secondary);
  margin-left: auto;
  font-family: monospace;
}

.empty-list {
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
  font-style: italic;
}
</style>