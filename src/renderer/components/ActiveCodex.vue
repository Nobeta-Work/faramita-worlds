<script setup lang="ts">
import { ref, computed } from 'vue'
import { useWorldStore } from '../store/world'
import { useChronicleStore } from '../store/chronicle'
import { LevelCalculator } from '../core/LevelCalculator'
import { User, Book, ChevronRight, ChevronDown, ArrowLeft, Plus, X, Edit, Check } from 'lucide-vue-next'

const worldStore = useWorldStore()
const chronicleStore = useChronicleStore()
const selectedCharId = ref<string | null>(null)
const isEditing = ref(false)
const editForm = ref<any>(null)

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
    if (c.type === 'chapter') return true
    
    if (c.type === 'character') {
      const isPlayer = c.id === 'char-001' || (c as any).tags?.includes('player')
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
    c.id !== 'char-001' && 
    !(c as any).tags?.includes('player')
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

const attributeLabels: Record<string, string> = {
  str: '力量', dex: '敏捷', con: '体质',
  int: '智力', wis: '感知', cha: '魅力'
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

             <div class="details-section">
                <div class="section-label">六维属性</div>
                <div class="attributes-grid">
                  <div v-for="(label, key) in attributeLabels" :key="key" class="attr-item">
                    <span class="attr-label">{{ label }}</span>
                    <span class="attr-value">{{ (selectedChar as any).attributes[key] }}</span>
                  </div>
                </div>
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
                <div class="section-label">属性</div>
                <div class="attributes-grid">
                  <div v-for="(label, key) in attributeLabels" :key="key" class="attr-item">
                    <span class="attr-label">{{ label }}</span>
                    <input v-model.number="editForm.attributes[key]" type="number" class="edit-input attr-edit" />
                  </div>
                </div>
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
            <span v-if="card.type === 'chapter'" class="current-tag">当前章节</span>
            <ChevronRight 
              v-if="card.type === 'character'" 
              :size="14" 
              class="expand-icon"
            />
          </div>
          
          <div class="card-body">
            <template v-if="card.type === 'character'">
              <!-- Simplified display: Name/Title only (in header). Body empty for compact view -->
            </template>
            
            <template v-else-if="card.type === 'chapter'">
              <div class="chapter-objective">
                <strong>当前目标:</strong> {{ (card as any).objective }}
              </div>
            </template>
          </div>
        </div>
      </div>
    </template>

    <!-- Add Character Modal -->
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
            <span>{{ char.name }}</span>
            <span class="char-id">{{ char.id }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.active-codex {
  padding: 10px;
  width: 100%;
  box-sizing: border-box;
  height: 100%;
  overflow-y: auto;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding: 0 5px;
}

.list-title {
  font-size: 12px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 600;
}

.btn-add-char {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-secondary);
  border-radius: 4px;
  cursor: pointer;
  padding: 4px 8px;
  transition: all 0.2s;
}

.btn-add-char:hover {
  background: rgba(212, 175, 55, 0.1);
  border-color: var(--accent-gold);
  color: var(--accent-gold);
}

.card-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
  width: 100%;
}

.active-card {
  background-color: var(--bg-panel);
  backdrop-filter: var(--glass-backdrop);
  border: var(--glass-border);
  border-left: 3px solid #444;
  padding: 15px;
  border-radius: 8px;
  width: 100%;
  box-sizing: border-box;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.active-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.2);
}

.active-card.character {
  border-left-color: var(--accent-gold);
}

.active-card.chapter {
  border-left-color: #4ecdc4;
}

.clickable {
  cursor: pointer;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-primary);
  font-weight: 600;
}

.card-title {
  flex: 1;
  font-size: 15px;
}

.current-tag {
  font-size: 10px;
  background-color: rgba(78, 205, 196, 0.2);
  color: #4ecdc4;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
}

.expand-icon {
  color: var(--text-secondary);
  opacity: 0.5;
}

.card-body {
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
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
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
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
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.btn-icon.save:hover {
  background: rgba(78, 205, 196, 0.2);
  color: #4ecdc4;
  border-color: #4ecdc4;
}

.btn-icon.cancel:hover {
  background: rgba(255, 107, 107, 0.2);
  color: #ff6b6b;
  border-color: #ff6b6b;
}

.header-title-row {
  margin-bottom: 25px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
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
  color: rgba(255, 255, 255, 0.2);
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
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  border-left: 2px solid var(--accent-gold);
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-item {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 13px;
  color: var(--text-primary);
}

.attributes-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.attr-item {
  background: rgba(0, 0, 0, 0.2);
  padding: 10px;
  border-radius: 4px;
  text-align: center;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.attr-label {
  display: block;
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.attr-value {
  font-size: 16px;
  font-weight: bold;
  color: var(--accent-gold);
}

/* Edit Inputs */
.edit-input {
  width: 100%;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
  padding: 8px;
  border-radius: 4px;
  font-family: inherit;
  box-sizing: border-box;
}

.edit-input:focus {
  outline: none;
  border-color: var(--accent-gold);
  background: rgba(0, 0, 0, 0.5);
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
  background: rgba(0,0,0,0.8);
  backdrop-filter: blur(5px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-content {
  background: #1a1a1a;
  border: 1px solid var(--accent-gold);
  width: 320px;
  max-height: 450px;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  box-shadow: 0 0 30px rgba(0,0,0,0.8);
}

.modal-header {
  padding: 15px 20px;
  border-bottom: 1px solid #333;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(0,0,0,0.2);
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
  color: #666;
  cursor: pointer;
  transition: color 0.2s;
}

.btn-close:hover {
  color: #fff;
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
  border-bottom: 1px solid rgba(255,255,255,0.05);
  cursor: pointer;
  transition: background 0.2s;
  color: var(--text-primary);
}

.char-item:hover {
  background: rgba(255,255,255,0.05);
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