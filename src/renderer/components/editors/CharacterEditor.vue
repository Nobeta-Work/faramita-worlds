<script setup lang="ts">
import type { CharacterCard, VoiceProfile } from '@shared/Interface'
import { Plus, Trash2 } from 'lucide-vue-next'

const props = defineProps<{
  card: CharacterCard
  section: 'basic' | 'background' | 'voice' | 'inventory' | 'visibility'
}>()

const emit = defineEmits<{
  update: [card: CharacterCard]
}>()

function addListItem(field: 'background' | 'tags' | 'affiliation' | 'status' | 'personality' | 'race') {
  if (field === 'race' && typeof props.card[field] === 'string') {
    ;(props.card as any)[field] = [props.card[field]]
  }
  if (!props.card[field]) (props.card as any)[field] = []
  ;(props.card[field] as string[]).push('')
}

function removeListItem(field: 'background' | 'tags' | 'affiliation' | 'status' | 'personality' | 'race', index: number) {
  ;(props.card[field] as string[]).splice(index, 1)
}

function addInventoryItem() {
  if (!props.card.inventory) props.card.inventory = []
  props.card.inventory.push({ item: '', description: '', effect: null })
}

function removeInventoryItem(index: number) {
  props.card.inventory?.splice(index, 1)
}

function addVoiceListItem(field: 'speech_patterns' | 'example_dialogues') {
  if (!props.card.voice_profile) {
    props.card.voice_profile = { tone: '', vocabulary_level: '口语化', speech_patterns: [], emotional_range: '', example_dialogues: [] }
  }
  props.card.voice_profile[field].push('')
}

function removeVoiceListItem(field: 'speech_patterns' | 'example_dialogues', index: number) {
  props.card.voice_profile?.[field].splice(index, 1)
}

function autoGenerateVoiceProfile() {
  const personality = Array.isArray(props.card.personality) ? props.card.personality.join(' ') : ''
  const className = props.card.class || ''
  const tags = Array.isArray(props.card.tags) ? props.card.tags.join(' ') : ''

  const tone = personality.includes('冷静') || personality.includes('沉稳')
    ? '沉稳克制'
    : personality.includes('热情') || personality.includes('冲动')
      ? '热烈直接'
      : '理性平衡'

  const vocabularyLevel: VoiceProfile['vocabulary_level'] = className.includes('法师') || className.includes('学者')
    ? '学术'
    : tags.includes('贵族')
      ? '典雅'
      : tags.includes('佣兵') || tags.includes('战士')
        ? '粗犷'
        : '口语化'

  const speechPatterns = vocabularyLevel === '学术'
    ? ['根据我的判断', '从逻辑上看', '这并非偶然']
    : vocabularyLevel === '典雅'
      ? ['容我一言', '此事尚需斟酌', '请听我说明']
      : vocabularyLevel === '粗犷'
        ? ['少废话', '跟紧我', '现在就上']
        : ['我觉得', '先这样吧', '你怎么看']

  props.card.voice_profile = {
    tone,
    vocabulary_level: vocabularyLevel,
    speech_patterns: speechPatterns,
    emotional_range: tone.includes('热烈') ? '中高波动' : '低到中等波动',
    example_dialogues: [
      `${props.card.name || '我'}：${speechPatterns[0]}。`,
      `${props.card.name || '我'}：${speechPatterns[1]}。`
    ]
  }
}
</script>

<template>
  <!-- Basic -->
  <div v-if="section === 'basic'" class="editor-fields">
    <div class="form-row">
      <div class="form-group">
        <label>姓名</label>
        <input type="text" v-model="card.name" />
      </div>
      <div class="form-group">
        <label>头衔 (Prefix Name)</label>
        <input type="text" v-model="card.prefix_name" placeholder="自定义头衔，留空则自动计算" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>职业</label>
        <input type="text" v-model="card.class" />
      </div>
      <div class="form-group">
        <label>等级</label>
        <input type="number" v-model.number="card.level" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>性别</label>
        <input type="text" v-model="card.gender" placeholder="如：男 / 女 / 未知" />
      </div>
      <div class="form-group">
        <label>年龄</label>
        <input type="number" v-model.number="card.age" />
      </div>
    </div>
    <!-- Race -->
    <div class="list-section">
      <div class="section-header">
        <label>种族</label>
        <button class="btn-add" @click="addListItem('race')"><Plus :size="14" /></button>
      </div>
      <div v-if="typeof card.race === 'string'" class="form-group">
        <input type="text" v-model="(card as any).race" @focus="addListItem('race')" />
      </div>
      <div v-else v-for="(r, idx) in card.race" :key="idx" class="list-item">
        <input type="text" v-model="(card.race as string[])[idx]" placeholder="输入种族..." />
        <button class="btn-remove" @click="removeListItem('race', idx)"><Trash2 :size="14" /></button>
      </div>
    </div>
  </div>

  <!-- Background -->
  <div v-else-if="section === 'background'" class="editor-fields">
    <!-- Personality -->
    <div class="list-section">
      <div class="section-header">
        <label>性格特点 (Personality)</label>
        <button class="btn-add" @click="addListItem('personality')"><Plus :size="14" /></button>
      </div>
      <div v-for="(p, idx) in card.personality" :key="idx" class="list-item">
        <input type="text" v-model="(card.personality as string[])[idx]" placeholder="输入性格标签或描述..." />
        <button class="btn-remove" @click="removeListItem('personality', idx)"><Trash2 :size="14" /></button>
      </div>
    </div>
    <!-- Status -->
    <div class="list-section">
      <div class="section-header">
        <label>状态 (Status)</label>
        <button class="btn-add" @click="addListItem('status')"><Plus :size="14" /></button>
      </div>
      <div v-for="(s, idx) in card.status" :key="idx" class="list-item">
        <input type="text" v-model="(card.status as string[])[idx]" placeholder="输入状态..." />
        <button class="btn-remove" @click="removeListItem('status', idx)"><Trash2 :size="14" /></button>
      </div>
    </div>
    <!-- Affiliation -->
    <div class="list-section">
      <div class="section-header">
        <label>从属/阵营 (Affiliation)</label>
        <button class="btn-add" @click="addListItem('affiliation')"><Plus :size="14" /></button>
      </div>
      <div v-for="(a, idx) in card.affiliation" :key="idx" class="list-item">
        <input type="text" v-model="card.affiliation[idx]" placeholder="输入阵营名称..." />
        <button class="btn-remove" @click="removeListItem('affiliation', idx)"><Trash2 :size="14" /></button>
      </div>
    </div>
    <!-- Background entries -->
    <div class="list-section">
      <div class="section-header">
        <label>人物背景 (多词条)</label>
        <button class="btn-add" @click="addListItem('background')"><Plus :size="14" /></button>
      </div>
      <div v-for="(b, idx) in card.background" :key="idx" class="list-item">
        <textarea v-model="(card.background as string[])[idx]" placeholder="输入背景内容..."></textarea>
        <button class="btn-remove" @click="removeListItem('background', idx)"><Trash2 :size="14" /></button>
      </div>
    </div>
    <!-- Tags -->
    <div class="list-section">
      <div class="section-header">
        <label>标签 (Tags)</label>
        <button class="btn-add" @click="addListItem('tags')"><Plus :size="14" /></button>
      </div>
      <div v-for="(t, idx) in card.tags" :key="idx" class="list-item">
        <input type="text" v-model="card.tags[idx]" placeholder="输入标签..." />
        <button class="btn-remove" @click="removeListItem('tags', idx)"><Trash2 :size="14" /></button>
      </div>
    </div>
  </div>

  <!-- Voice -->
  <div v-else-if="section === 'voice'" class="editor-fields">
    <div class="section-header" style="margin-bottom:10px">
      <span></span>
      <button class="btn-add-text" @click="autoGenerateVoiceProfile">AI 自动分析</button>
    </div>
    <template v-if="card.voice_profile">
      <div class="form-group">
        <label>语气 (Tone)</label>
        <input type="text" v-model="card.voice_profile.tone" placeholder="如：沉稳威严 / 活泼调皮" />
      </div>
      <div class="form-group">
        <label>词汇风格 (Vocabulary Level)</label>
        <select v-model="card.voice_profile.vocabulary_level">
          <option value="典雅">典雅</option>
          <option value="口语化">口语化</option>
          <option value="粗犷">粗犷</option>
          <option value="学术">学术</option>
        </select>
      </div>
      <div class="list-section">
        <div class="section-header">
          <label>常用句式 (Speech Patterns)</label>
          <button class="btn-add" @click="addVoiceListItem('speech_patterns')"><Plus :size="14" /></button>
        </div>
        <div v-for="(pattern, idx) in card.voice_profile.speech_patterns" :key="`sp-${idx}`" class="list-item">
          <input type="text" v-model="card.voice_profile.speech_patterns[idx]" placeholder="口头禅 / 常用句式" />
          <button class="btn-remove" @click="removeVoiceListItem('speech_patterns', idx)"><Trash2 :size="14" /></button>
        </div>
      </div>
      <div class="form-group">
        <label>情绪范围 (Emotional Range)</label>
        <input type="text" v-model="card.voice_profile.emotional_range" placeholder="如：低到中等波动 / 中高波动" />
      </div>
      <div class="list-section">
        <div class="section-header">
          <label>示例对话 (Example Dialogues)</label>
          <button class="btn-add" @click="addVoiceListItem('example_dialogues')"><Plus :size="14" /></button>
        </div>
        <div v-for="(line, idx) in card.voice_profile.example_dialogues" :key="`ed-${idx}`" class="list-item">
          <input type="text" v-model="card.voice_profile.example_dialogues[idx]" placeholder="示例台词" />
          <button class="btn-remove" @click="removeVoiceListItem('example_dialogues', idx)"><Trash2 :size="14" /></button>
        </div>
      </div>
    </template>
  </div>

  <!-- Inventory -->
  <div v-else-if="section === 'inventory'" class="editor-fields">
    <div class="section-header" style="margin-bottom:8px">
      <span></span>
      <button class="btn-add" @click="addInventoryItem"><Plus :size="14" /></button>
    </div>
    <div v-for="(item, index) in card.inventory" :key="index" class="inventory-item">
      <input type="text" v-model="item.item" placeholder="物品名称" />
      <textarea v-model="item.description" placeholder="描述"></textarea>
      <button class="btn-remove" @click="removeInventoryItem(index)"><Trash2 :size="14" /></button>
    </div>
  </div>

  <!-- Visibility -->
  <div v-else-if="section === 'visibility'" class="editor-fields">
    <template v-if="card.visible">
      <div class="form-group inline">
        <label><input type="checkbox" v-model="card.visible.public_visible" /> 公开可见</label>
        <label><input type="checkbox" v-model="card.visible.player_visible" /> 玩家可见</label>
      </div>
      <div class="form-group">
        <label>解锁条件</label>
        <input type="text" v-model="card.visible.unlock_condition" placeholder="留空则在遇见前不可见" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.editor-fields { display: flex; flex-direction: column; gap: 4px; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
.form-group { margin-bottom: 12px; }
.form-group.inline { display: flex; gap: 20px; }
.form-group label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 5px; }
.form-group input[type="text"],
.form-group input[type="number"],
.form-group textarea,
.form-group select {
  width: 100%; background: var(--bg-elevated); border: 1px solid var(--border-default);
  color: var(--text-primary); padding: 8px; border-radius: 4px; outline: none; box-sizing: border-box;
  transition: all var(--motion-base) ease;
}
.form-group input:focus, .form-group textarea:focus, .form-group select:focus {
  border-color: var(--accent-primary); box-shadow: 0 0 0 2px var(--accent-primary-weak);
}
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.list-section { margin-bottom: 16px; }
.list-item { display: flex; gap: 10px; margin-bottom: 8px; align-items: flex-start; }
.list-item input, .list-item textarea { flex: 1; background: var(--bg-elevated); border: 1px solid var(--border-default); color: var(--text-primary); padding: 8px; border-radius: 4px; outline: none; box-sizing: border-box; }
.btn-add, .btn-remove { background: none; border: none; color: var(--text-muted); cursor: pointer; }
.btn-add:hover { color: var(--state-success); }
.btn-remove:hover { color: var(--state-danger); }
.btn-add-text { background: none; border: 1px dashed var(--border-strong); color: var(--text-secondary); font-size: 11px; padding: 4px 8px; cursor: pointer; transition: all var(--motion-base); }
.btn-add-text:hover { color: var(--accent-gold); border-color: var(--accent-gold); }
.inventory-item { background: transparent; border: 1px solid var(--border-default); padding: 10px; border-radius: 4px; margin-bottom: 10px; }
textarea { resize: vertical; }
</style>
