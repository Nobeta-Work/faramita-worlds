<script setup lang="ts">
import { ref, watch, computed, toRaw } from 'vue'
import { WorldCard, Visibility, Attributes } from '@shared/Interface'
import { useWorldStore } from '../store/world'
import { X, Save, Plus, Trash2 } from 'lucide-vue-next'

const worldStore = useWorldStore()

const props = defineProps<{
  card: WorldCard | null
}>()

const emit = defineEmits(['save', 'close'])

const editedCard = ref<any>(null)

watch(() => props.card, (newCard) => {
  if (newCard) {
    // Deep clone and ensure all reactive paths exist
    const cloned = JSON.parse(JSON.stringify(newCard))
    
    // Defensive initialization for setting cards
    if (cloned.type === 'setting') {
      if (!cloned.tags) cloned.tags = []
      if (!cloned.suffix_names) cloned.suffix_names = []
      if (!cloned.scaling_modes) cloned.scaling_modes = {}
      if (cloned.step === undefined) cloned.step = 20
      if (cloned.default_mode === undefined) cloned.default_mode = ''
    }

    // Defensive initialization for interaction cards
    if (cloned.type === 'interaction') {
      if (cloned.min_level === undefined) cloned.min_level = 1
      if (cloned.element === undefined) cloned.element = ''
      if (cloned.cost === undefined) cloned.cost = ''
      if (cloned.d20_logic === undefined) cloned.d20_logic = null
      if (cloned.effect === undefined) cloned.effect = ''
    }

    // Defensive initialization for character cards
    if (cloned.type === 'character') {
      if (!cloned.personality) cloned.personality = []
      if (!cloned.status) cloned.status = []
      if (!cloned.affiliation) cloned.affiliation = []
      if (!cloned.inventory) cloned.inventory = []
      if (!cloned.background) cloned.background = []
      if (!cloned.tags) cloned.tags = []
    }

    // Defensive initialization for chapter cards
    if (cloned.type === 'chapter') {
      if (!cloned.summary) cloned.summary = ''
      if (!cloned.status) cloned.status = 'pending'
      if (cloned.is_current === undefined) cloned.is_current = false
      if (!cloned.rewards) cloned.rewards = []
      if (!cloned.tags) cloned.tags = []
      if (!cloned.plot_points) cloned.plot_points = []
    }
    
    // Defensive initialization for custom cards
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
    // Strip Vue reactivity before emitting
    const rawData = JSON.parse(JSON.stringify(toRaw(editedCard.value)))
    emit('save', rawData)
  }
}

const addPlotPoint = () => {
  if (editedCard.value && editedCard.value.type === 'chapter') {
    editedCard.value.plot_points.push({
      id: `plot-${Date.now()}`,
      title: '',
      content: '',
      secret_notes: ''
    })
  }
}

const removePlotPoint = (index: number) => {
  if (editedCard.value && editedCard.value.type === 'chapter') {
    editedCard.value.plot_points.splice(index, 1)
  }
}

const addInventoryItem = () => {
  if (editedCard.value && editedCard.value.type === 'character') {
    if (!editedCard.value.inventory) editedCard.value.inventory = []
    editedCard.value.inventory.push({
      item: '',
      description: '',
      effect: null
    })
  }
}

const removeInventoryItem = (index: number) => {
  if (editedCard.value && editedCard.value.type === 'character') {
    editedCard.value.inventory.splice(index, 1)
  }
}

const addListItem = (field: 'background' | 'tags' | 'race' | 'setting_tags' | 'affiliation' | 'status' | 'prefix_names' | 'suffix_names' | 'personality' | 'rewards' | 'chapter_tags') => {
  if (editedCard.value) {
    if (editedCard.value.type === 'character' && (field === 'background' || field === 'tags' || field === 'race' || field === 'affiliation' || field === 'status' || field === 'personality')) {
      if (!editedCard.value[field]) editedCard.value[field] = []
      if (field === 'race' && typeof editedCard.value[field] === 'string') {
        editedCard.value[field] = [editedCard.value[field]]
      }
      editedCard.value[field].push('')
    } else if (editedCard.value.type === 'setting') {
      if (field === 'setting_tags') {
        if (!editedCard.value.tags) editedCard.value.tags = []
        editedCard.value.tags.push('')
      } else if (field === 'suffix_names') {
        if (!editedCard.value.suffix_names) editedCard.value.suffix_names = []
        editedCard.value.suffix_names.push('')
      }
    } else if (editedCard.value.type === 'chapter') {
      if (field === 'rewards') {
        if (!editedCard.value.rewards) editedCard.value.rewards = []
        editedCard.value.rewards.push('')
      } else if (field === 'chapter_tags') {
        if (!editedCard.value.tags) editedCard.value.tags = []
        editedCard.value.tags.push('')
      }
    } else if (editedCard.value.type === 'custom') {
      if (field === 'tags') {
        if (!editedCard.value.tags) editedCard.value.tags = []
        editedCard.value.tags.push('')
      }
    }
  }
}

const removeListItem = (field: 'background' | 'tags' | 'race' | 'setting_tags' | 'affiliation' | 'status' | 'prefix_names' | 'suffix_names' | 'personality' | 'rewards' | 'chapter_tags', index: number, modeKey?: string) => {
  if (editedCard.value) {
    if (editedCard.value.type === 'character' && (field === 'background' || field === 'tags' || field === 'race' || field === 'affiliation' || field === 'status' || field === 'personality')) {
      editedCard.value[field].splice(index, 1)
    } else if (editedCard.value.type === 'setting') {
      if (field === 'setting_tags') {
        editedCard.value.tags.splice(index, 1)
      } else if (field === 'suffix_names') {
        editedCard.value.suffix_names.splice(index, 1)
      } else if (field === 'prefix_names' && modeKey && editedCard.value.scaling_modes?.[modeKey]) {
        editedCard.value.scaling_modes[modeKey].prefix_names.splice(index, 1)
      }
    } else if (editedCard.value.type === 'chapter') {
      if (field === 'rewards') {
        editedCard.value.rewards.splice(index, 1)
      } else if (field === 'chapter_tags') {
        editedCard.value.tags.splice(index, 1)
      }
    } else if (editedCard.value.type === 'custom') {
      if (field === 'tags') {
        editedCard.value.tags.splice(index, 1)
      }
    }
  }
}

const addScalingMode = () => {
  const modeName = prompt('输入新的从属/阵营名称:')
  if (modeName && editedCard.value?.type === 'setting') {
    if (!editedCard.value.scaling_modes) editedCard.value.scaling_modes = {}
    editedCard.value.scaling_modes[modeName] = {
      step: 20,
      prefix_names: ['']
    }
  }
}

const removeScalingMode = (key: string | number) => {
  if (editedCard.value?.type === 'setting' && editedCard.value.scaling_modes) {
    delete editedCard.value.scaling_modes[key.toString()]
  }
}

const addPrefixName = (modeKey: string | number) => {
  if (editedCard.value?.type === 'setting' && editedCard.value.scaling_modes?.[modeKey.toString()]) {
    editedCard.value.scaling_modes[modeKey.toString()].prefix_names.push('')
  }
}

const attributeLabels: Record<keyof Attributes, string> = {
  str: '力量 (STR)',
  dex: '敏捷 (DEX)',
  con: '体质 (CON)',
  int: '智力 (INT)',
  wis: '感知 (WIS)',
  cha: '魅力 (CHA)'
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
      <!-- Visibility Section -->
      <section v-if="editedCard.visible" class="editor-section">
        <h4>可见性设置</h4>
        <div class="form-group inline">
          <label>
            <input type="checkbox" v-model="editedCard.visible.public_visible" /> 公开可见
          </label>
          <label>
            <input type="checkbox" v-model="editedCard.visible.player_visible" /> 玩家可见
          </label>
        </div>
        <div class="form-group">
          <label>解锁条件</label>
          <input type="text" v-model="editedCard.visible.unlock_condition" placeholder="留空则在遇见前不可见" />
        </div>
      </section>

      <!-- Fallback Visibility if missing -->
      <section v-else class="editor-section">
        <h4>可见性设置 (未初始化)</h4>
        <button class="btn-add-text" @click="editedCard.visible = { public_visible: true, player_visible: true, unlock_condition: null }">
          初始化可见性配置
        </button>
      </section>

      <!-- Setting Specific -->
      <template v-if="editedCard.type === 'setting'">
        <section class="editor-section">
          <h4>设定详情</h4>
          <div class="form-group">
            <label>标题</label>
            <input type="text" v-model="editedCard.title" />
          </div>
          <div class="form-group">
            <label>类别 (Category)</label>
            <select v-model="editedCard.category">
              <option value="background">背景故事</option>
              <option value="race">种族设定</option>
              <option value="class">职业系统</option>
              <option value="level">等级/位阶</option>
              <option value="world">地理/世界观</option>
              <option value="rule">规则</option>
            </select>
          </div>
          <div class="form-group">
            <label>内容</label>
            <textarea v-model="editedCard.content" rows="6"></textarea>
          </div>

          <!-- Class Specific: Suffix Names -->
          <template v-if="editedCard.category === 'class'">
            <div class="form-group">
              <label>等级跨度 (Step)</label>
              <input type="number" v-model.number="editedCard.step" />
            </div>
            <div class="list-section">
              <div class="section-header">
                <label>职业后缀 (Suffix Names)</label>
                <button class="btn-add" @click="addListItem('suffix_names')"><Plus :size="14" /></button>
              </div>
              <template v-if="editedCard.suffix_names">
                <div v-for="(name, idx) in editedCard.suffix_names" :key="idx" class="list-item">
                  <input type="text" v-model="editedCard.suffix_names[idx]" placeholder="如：学徒、法师..." />
                  <button class="btn-remove" @click="removeListItem('suffix_names', Number(idx))"><Trash2 :size="14" /></button>
                </div>
              </template>
            </div>
          </template>

          <!-- Level Specific: Scaling Modes -->
          <template v-if="editedCard.category === 'level'">
            <div class="form-group">
              <label>默认阵营/模式</label>
              <input type="text" v-model="editedCard.default_mode" />
            </div>
            <div class="scaling-modes-section">
              <div class="section-header">
                <label>从属/阵营前缀配置</label>
                <button class="btn-add" @click="addScalingMode"><Plus :size="14" /> 添加阵营</button>
              </div>
              <template v-if="editedCard.scaling_modes">
                <div v-for="(mode, key) in editedCard.scaling_modes" :key="key" class="mode-item">
                  <div class="mode-header">
                    <strong>{{ key }}</strong>
                    <div class="mode-actions">
                      <span>Step: </span>
                      <input type="number" v-model.number="mode.step" class="small-input" />
                      <button class="btn-remove" @click="removeScalingMode(key)"><Trash2 :size="12" /></button>
                    </div>
                  </div>
                  <div class="prefix-list">
                    <template v-if="mode.prefix_names">
                      <div v-for="(p, pIdx) in mode.prefix_names" :key="pIdx" class="list-item small">
                        <input type="text" v-model="mode.prefix_names[pIdx]" placeholder="前缀名" />
                        <button class="btn-remove" @click="removeListItem('prefix_names', Number(pIdx), String(key))"><Trash2 :size="12" /></button>
                      </div>
                    </template>
                    <button class="btn-add-text" @click="addPrefixName(key)">+ 添加前缀</button>
                  </div>
                </div>
              </template>
            </div>
          </template>

          <!-- Setting Tags -->
          <div class="list-section">
            <div class="section-header">
              <label>标签 (Tags)</label>
              <button class="btn-add" @click="addListItem('setting_tags')"><Plus :size="14" /></button>
            </div>
            <div v-for="(t, idx) in editedCard.tags" :key="idx" class="list-item">
              <input type="text" v-model="editedCard.tags[idx]" placeholder="输入标签..." />
              <button class="btn-remove" @click="removeListItem('setting_tags', Number(idx))"><Trash2 :size="14" /></button>
            </div>
          </div>
        </section>
      </template>

      <!-- Chapter Specific -->
      <template v-if="editedCard.type === 'chapter'">
        <section class="editor-section">
          <h4>章节详情</h4>
          <div class="form-row">
            <div class="form-group">
              <label>标题</label>
              <input type="text" v-model="editedCard.title" />
            </div>
            <div class="form-group">
              <label>状态</label>
              <select v-model="editedCard.status">
                <option value="pending">准备中</option>
                <option value="active">进行中</option>
                <option value="completed">已完成</option>
              </select>
            </div>
          </div>

          <div class="form-group inline">
            <label>
              <input type="checkbox" v-model="editedCard.is_current" /> 设置为当前活跃章节
            </label>
          </div>

          <div class="form-group">
            <label>章节简介 (Summary)</label>
            <textarea v-model="editedCard.summary" rows="3" placeholder="简述本章节的核心内容..."></textarea>
          </div>

          <div class="form-group">
            <label>核心目标 (Objective)</label>
            <input type="text" v-model="editedCard.objective" placeholder="如：逃离地牢、寻找失踪的村民..." />
          </div>

          <!-- Rewards (Array support) -->
          <div class="list-section">
            <div class="section-header">
              <label>潜在奖励 (Rewards)</label>
              <button class="btn-add" @click="addListItem('rewards')"><Plus :size="14" /></button>
            </div>
            <div v-for="(reward, idx) in editedCard.rewards" :key="idx" class="list-item">
              <input type="text" v-model="editedCard.rewards[idx]" placeholder="奖励内容..." />
              <button class="btn-remove" @click="removeListItem('rewards', Number(idx))"><Trash2 :size="14" /></button>
            </div>
          </div>

          <div class="plot-points">
            <div class="section-header">
              <h5>剧情点 (Plot Points)</h5>
              <button class="btn-add" @click="addPlotPoint"><Plus :size="14" /></button>
            </div>
            <div v-for="(point, index) in editedCard.plot_points" :key="point.id" class="plot-point-item">
              <div class="item-header">
                <input type="text" v-model="point.title" placeholder="剧情点标题" />
                <button class="btn-remove" @click="removePlotPoint(Number(index))"><Trash2 :size="14" /></button>
              </div>
              <textarea v-model="point.content" placeholder="主要内容" rows="3"></textarea>
              <textarea v-model="point.secret_notes" placeholder="秘密笔记 (AI可见)" rows="2"></textarea>
            </div>
          </div>

          <!-- Chapter Tags -->
          <div class="list-section">
            <div class="section-header">
              <label>章节标签 (Tags)</label>
              <button class="btn-add" @click="addListItem('chapter_tags')"><Plus :size="14" /></button>
            </div>
            <div v-for="(t, idx) in editedCard.tags" :key="idx" class="list-item">
              <input type="text" v-model="editedCard.tags[idx]" placeholder="标签..." />
              <button class="btn-remove" @click="removeListItem('chapter_tags', Number(idx))"><Trash2 :size="14" /></button>
            </div>
          </div>
        </section>
      </template>

      <!-- Character Specific -->
      <template v-if="editedCard.type === 'character'">
        <section class="editor-section">
          <h4>人物详情</h4>
          <div class="form-row">
            <div class="form-group">
              <label>姓名</label>
              <input type="text" v-model="editedCard.name" />
            </div>
            <div class="form-group">
              <label>头衔 (Prefix Name)</label>
              <input type="text" v-model="editedCard.prefix_name" placeholder="自定义头衔，留空则自动计算" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>职业</label>
              <input type="text" v-model="editedCard.class" />
            </div>
            <div class="form-group">
              <label>等级</label>
              <input type="number" v-model.number="editedCard.level" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>性别</label>
              <input type="text" v-model="editedCard.gender" placeholder="如：男 / 女 / 未知" />
            </div>
            <div class="form-group">
              <label>年龄</label>
              <input type="number" v-model.number="editedCard.age" />
            </div>
          </div>

          <!-- Personality (Array support) -->
          <div class="list-section">
            <div class="section-header">
              <label>性格特点 (Personality)</label>
              <button class="btn-add" @click="addListItem('personality')"><Plus :size="14" /></button>
            </div>
            <div v-for="(p, idx) in editedCard.personality" :key="idx" class="list-item">
              <input type="text" v-model="editedCard.personality[idx]" placeholder="输入性格标签或描述..." />
              <button class="btn-remove" @click="removeListItem('personality', Number(idx))"><Trash2 :size="14" /></button>
            </div>
          </div>

          <!-- Status (Array support) -->
          <div class="list-section">
            <div class="section-header">
              <label>状态 (Status)</label>
              <button class="btn-add" @click="addListItem('status')"><Plus :size="14" /></button>
            </div>
            <div v-for="(s, idx) in editedCard.status" :key="idx" class="list-item">
              <input type="text" v-model="editedCard.status[idx]" placeholder="输入状态..." />
              <button class="btn-remove" @click="removeListItem('status', Number(idx))"><Trash2 :size="14" /></button>
            </div>
          </div>

          <!-- Affiliation (Array support) -->
          <div class="list-section">
            <div class="section-header">
              <label>从属/阵营 (Affiliation)</label>
              <button class="btn-add" @click="addListItem('affiliation')"><Plus :size="14" /></button>
            </div>
            <div v-for="(a, idx) in editedCard.affiliation" :key="idx" class="list-item">
              <input type="text" v-model="editedCard.affiliation[idx]" placeholder="输入阵营名称..." />
              <button class="btn-remove" @click="removeListItem('affiliation', Number(idx))"><Trash2 :size="14" /></button>
            </div>
          </div>

          <!-- Race (Array support) -->
          <div class="list-section">
            <div class="section-header">
              <label>种族</label>
              <button class="btn-add" @click="addListItem('race')"><Plus :size="14" /></button>
            </div>
            <div v-if="typeof editedCard.race === 'string'" class="form-group">
              <input type="text" v-model="editedCard.race" @focus="addListItem('race')" />
            </div>
            <div v-else v-for="(r, idx) in editedCard.race" :key="idx" class="list-item">
              <input type="text" v-model="editedCard.race[idx]" placeholder="输入种族..." />
              <button class="btn-remove" @click="removeListItem('race', Number(idx))"><Trash2 :size="14" /></button>
            </div>
          </div>

          <h5>基础属性</h5>
          <div class="attributes-grid">
            <div v-for="(label, key) in attributeLabels" :key="key" class="form-group">
              <label>{{ label }}</label>
              <input type="number" v-model.number="editedCard.attributes[key]" />
            </div>
          </div>

          <!-- Background (Multi-entry) -->
          <div class="list-section">
            <div class="section-header">
              <h5>人物背景 (多词条)</h5>
              <button class="btn-add" @click="addListItem('background')"><Plus :size="14" /></button>
            </div>
            <div v-for="(b, idx) in editedCard.background" :key="idx" class="list-item">
              <textarea v-model="editedCard.background[idx]" placeholder="输入背景内容..."></textarea>
              <button class="btn-remove" @click="removeListItem('background', Number(idx))"><Trash2 :size="14" /></button>
            </div>
          </div>

          <!-- Tags (Multi-entry) -->
          <div class="list-section">
            <div class="section-header">
              <h5>标签 (Tags)</h5>
              <button class="btn-add" @click="addListItem('tags')"><Plus :size="14" /></button>
            </div>
            <div v-for="(t, idx) in editedCard.tags" :key="idx" class="list-item">
              <input type="text" v-model="editedCard.tags[idx]" placeholder="输入标签..." />
              <button class="btn-remove" @click="removeListItem('tags', Number(idx))"><Trash2 :size="14" /></button>
            </div>
          </div>

          <div class="inventory-section">
            <div class="section-header">
              <h5>背包物品</h5>
              <button class="btn-add" @click="addInventoryItem"><Plus :size="14" /></button>
            </div>
            <div v-for="(item, index) in editedCard.inventory" :key="index" class="inventory-item">
              <input type="text" v-model="item.item" placeholder="物品名称" />
              <textarea v-model="item.description" placeholder="描述"></textarea>
              <button class="btn-remove" @click="removeInventoryItem(Number(index))"><Trash2 :size="14" /></button>
            </div>
          </div>
        </section>
      </template>

      <!-- Interaction Specific -->
      <template v-if="editedCard.type === 'interaction'">
        <section class="editor-section">
          <h4>交互详情</h4>
          <div class="form-group">
            <label>名称</label>
            <input type="text" v-model="editedCard.name" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>最低等级</label>
              <input type="number" v-model.number="editedCard.min_level" />
            </div>
            <div class="form-group">
              <label>消耗 (Cost)</label>
              <input type="text" v-model="editedCard.cost" placeholder="如：10 MP" />
            </div>
          </div>
          <div class="form-group">
            <label>元素属性</label>
            <input type="text" v-model="editedCard.element" placeholder="如：火、水、光明..." />
          </div>
          <div class="form-group">
            <label>判定逻辑 (D20 Logic)</label>
            <input type="text" v-model="editedCard.d20_logic" placeholder="格式：d20 [成功阈值]，如：d20 10" />
          </div>
          <div class="form-group">
            <label>效果描述</label>
            <textarea v-model="editedCard.effect" rows="5"></textarea>
          </div>
        </section>
      </template>

      <!-- Custom Specific -->
      <template v-if="editedCard.type === 'custom'">
        <section class="editor-section">
          <h4>{{ editedCard.category }} 详情</h4>
          <div class="form-group">
            <label>标题</label>
            <input type="text" v-model="editedCard.title" />
          </div>
          <div class="form-group">
            <label>分类 (Category)</label>
            <input type="text" v-model="editedCard.category" />
          </div>
          <div class="form-group">
            <label>内容</label>
            <textarea v-model="editedCard.content" rows="10"></textarea>
          </div>
          
          <div class="list-section">
            <div class="section-header">
              <label>标签 (Tags)</label>
              <button class="btn-add" @click="addListItem('tags')"><Plus :size="14" /></button>
            </div>
            <div v-for="(t, idx) in editedCard.tags" :key="idx" class="list-item">
              <input type="text" v-model="editedCard.tags[idx]" placeholder="输入标签..." />
              <button class="btn-remove" @click="removeListItem('tags', Number(idx))"><Trash2 :size="14" /></button>
            </div>
          </div>
        </section>
      </template>
    </div>

    <!-- Footer with World Name -->
    <div class="editor-footer">
      <span class="world-name">{{ worldStore.meta?.name || '未知世界书' }}</span>
    </div>
  </div>
</template>

<style scoped>
.card-editor {
  position: absolute;
  top: 0;
  right: 0;
  width: 100%;
  height: 100%;
  background-color: #1a1a1a;
  z-index: 100;
  display: flex;
  flex-direction: column;
  box-shadow: -5px 0 15px rgba(0,0,0,0.5);
}

.editor-header {
  padding: 15px;
  background-color: #252525;
  border-bottom: 1px solid #333;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.editor-header h3 {
  margin: 0;
  font-size: 16px;
  color: #d4af37;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.header-actions button {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  transition: color 0.2s;
}

.header-actions button:hover {
  color: #fff;
}

.btn-save:hover {
  color: #4caf50 !important;
}

.editor-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.editor-section {
  margin-bottom: 25px;
  border-bottom: 1px solid #2a2a2a;
  padding-bottom: 15px;
}

.editor-section h4 {
  margin: 0 0 15px 0;
  color: #888;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.form-group {
  margin-bottom: 15px;
}

.form-group.inline {
  display: flex;
  gap: 20px;
}

.form-group label {
  display: block;
  font-size: 12px;
  color: #aaa;
  margin-bottom: 5px;
}

.form-group input[type="text"],
.form-group input[type="number"],
.form-group textarea {
  width: 100%;
  background-color: #2a2a2a;
  border: 1px solid #444;
  color: #eee;
  padding: 8px;
  border-radius: 4px;
  outline: none;
  box-sizing: border-box;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}

.attributes-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px;
  margin-bottom: 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.section-header h5 {
  margin: 0;
  color: #d4af37;
  font-size: 13px;
}

.list-section {
  margin-bottom: 20px;
}

.list-item {
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
  align-items: flex-start;
}

.list-item input, .list-item textarea {
  flex: 1;
}

.plot-point-item, .inventory-item {
  background-color: #222;
  border: 1px solid #333;
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 10px;
}

.item-header {
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
}

.btn-add, .btn-remove {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
}

.btn-add:hover { color: #4caf50; }
.btn-remove:hover { color: #f44336; }

.mode-item {
  background-color: #222;
  border: 1px solid #333;
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 10px;
}

.mode-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  border-bottom: 1px solid #333;
  padding-bottom: 5px;
}

.mode-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
}

.small-input {
  width: 40px !important;
  padding: 2px !important;
  text-align: center;
}

.list-item.small {
  margin-bottom: 4px;
}

.btn-add-text {
  background: none;
  border: 1px dashed #444;
  color: #888;
  font-size: 11px;
  padding: 4px;
  width: 100%;
  cursor: pointer;
  margin-top: 5px;
}

.btn-add-text:hover {
  color: #d4af37;
  border-color: #d4af37;
}

textarea {
  resize: vertical;
}

.editor-footer {
  padding: 10px 15px;
  background-color: #252525;
  border-top: 1px solid #333;
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.world-name {
  font-size: 12px;
  color: #666;
  font-style: italic;
}
</style>
