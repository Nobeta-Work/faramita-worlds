<script setup lang="ts">
import { computed, ref } from 'vue'
import { Upload, FileText, Sparkles, ListChecks, Check, X, Pause, Play, Ban, ChevronDown, ChevronRight } from 'lucide-vue-next'
import { TextParser, type ParsedDocument, type ParsedSection } from '../core/TextParser'
import { extractWorldbookCards, type ParseMode } from '../core/skills/WorldbookExtractSkill'
import type { TaskQueue } from '../core/TaskQueue'
import type { TaskProgress } from '../core/TaskQueue'
import type { WorldCard } from '@shared/Interface'
import type { ValidationReport } from '../core/WorldValidator'
import ProgressBar from './ProgressBar.vue'

const emit = defineEmits<{
  close: []
  completed: [message: string]
  failed: [message: string]
}>()

const step = ref(1)
const loading = ref(false)
const fileName = ref('')
const fileContent = ref('')
const parseMode = ref<ParseMode>('conservative')
const worldbookMeta = ref({
  name: '',
  author: '',
  description: '',
  default_language: 'zh-CN',
  tagsText: '',
  player_character_id: ''
})
const parsedDocument = ref<ParsedDocument | null>(null)
const extractedCards = ref<WorldCard[]>([])
const selectedCardIds = ref<Set<string>>(new Set())
const expandedCardIds = ref<Set<string>>(new Set())
const extractionReport = ref<{
  extracted: number
  deduplicated: number
  parseFailed: boolean
  autoFixed: number
  validation: ValidationReport
} | null>(null)
const taskProgress = ref<TaskProgress | null>(null)
const activeTaskQueue = ref<TaskQueue<ParsedSection> | null>(null)

const selectedCards = computed(() => extractedCards.value.filter((card) => selectedCardIds.value.has(card.id)))

const PAGE_SIZE = 50

const sectionPage = ref(0)
const cardPage = ref(0)

const pagedSections = computed(() => {
  const all = parsedDocument.value?.sections || []
  const start = sectionPage.value * PAGE_SIZE
  return all.slice(start, start + PAGE_SIZE)
})

const sectionPageCount = computed(() => Math.ceil((parsedDocument.value?.totalSections || 0) / PAGE_SIZE))

const pagedCards = computed(() => {
  const start = cardPage.value * PAGE_SIZE
  return extractedCards.value.slice(start, start + PAGE_SIZE)
})

const cardPageCount = computed(() => Math.ceil(extractedCards.value.length / PAGE_SIZE))

const cardStats = computed(() => {
  const counts: Record<string, number> = {}
  for (const card of selectedCards.value) {
    counts[card.type] = (counts[card.type] || 0) + 1
  }
  return counts
})

const textTypeLabel: Record<string, string> = {
  narrative: '叙事',
  setting: '设定',
  dialogue: '对话',
  description: '描写'
}

const resetWizard = () => {
  step.value = 1
  loading.value = false
  fileName.value = ''
  fileContent.value = ''
  parseMode.value = 'conservative'
  worldbookMeta.value = {
    name: '',
    author: '',
    description: '',
    default_language: 'zh-CN',
    tagsText: '',
    player_character_id: ''
  }
  parsedDocument.value = null
  extractedCards.value = []
  selectedCardIds.value = new Set()
  expandedCardIds.value = new Set()
  extractionReport.value = null
  taskProgress.value = null
  activeTaskQueue.value = null
}

const closeWizard = () => {
  if (activeTaskQueue.value) {
    activeTaskQueue.value.cancel()
  }
  resetWizard()
  emit('close')
}

const importTextFile = async () => {
  loading.value = true
  try {
    const result = await (window as any).api.importTextFile()
    if (!result.success) {
      if (!result.cancelled) {
        emit('failed', `文本导入失败: ${result.error || '未知错误'}`)
      }
      return
    }

    fileName.value = result.filename || 'imported.txt'
    fileContent.value = result.content || ''
    worldbookMeta.value.name = deriveWorldbookName(fileName.value)
    parsedDocument.value = TextParser.parse(fileContent.value, fileName.value)

    if (!parsedDocument.value.sections.length) {
      emit('failed', '未识别到有效段落，请检查文本内容')
      return
    }

    step.value = 2
  } catch (error: any) {
    emit('failed', `文本导入失败: ${error.message}`)
  } finally {
    loading.value = false
  }
}

const updateSectionTextType = (index: number, textType: ParsedSection['textType']) => {
  if (!parsedDocument.value) return
  const section = parsedDocument.value.sections[index]
  if (section) {
    section.textType = textType
  }
}

const startExtraction = async () => {
  if (!parsedDocument.value) return

  loading.value = true
  extractedCards.value = []
  taskProgress.value = null
  step.value = 3

  try {
    const { result: extracted, taskQueue } = await extractWorldbookCards(
      parsedDocument.value,
      fileName.value,
      parseMode.value,
      (progress) => {
        taskProgress.value = { ...progress }
      },
      (tq) => {
        activeTaskQueue.value = tq
      }
    )

    extractedCards.value = extracted.cards
    extractionReport.value = extracted.report
    selectedCardIds.value = new Set(extracted.cards.map((card) => card.id))

    if (!extracted.cards.length) {
      emit('failed', '抽取完成，但未生成可入库卡片')
      return
    }

    step.value = 4
  } catch (error: any) {
    emit('failed', `抽取失败: ${error.message}`)
  } finally {
    loading.value = false
    activeTaskQueue.value = null
  }
}

const pauseExtraction = () => {
  activeTaskQueue.value?.pause()
}

const resumeExtraction = () => {
  activeTaskQueue.value?.resume()
}

const cancelExtraction = () => {
  activeTaskQueue.value?.cancel()
}

const toggleCard = (id: string) => {
  const next = new Set(selectedCardIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  selectedCardIds.value = next
}

const toggleCardExpand = (id: string) => {
  const next = new Set(expandedCardIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  expandedCardIds.value = next
}

const confirmGenerate = async () => {
  if (selectedCards.value.length === 0) {
    emit('failed', '请至少选择一张卡片后再生成')
    return
  }

  const worldName = worldbookMeta.value.name.trim()
  if (!worldName) {
    emit('failed', '请填写世界书名称')
    return
  }

  loading.value = true
  try {
    const tags = worldbookMeta.value.tagsText
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

    const uuid = crypto.randomUUID()
    const entries = {
      setting_cards: selectedCards.value.filter((card) => card.type === 'setting'),
      chapter_cards: selectedCards.value.filter((card) => card.type === 'chapter'),
      character_cards: selectedCards.value.filter((card) => card.type === 'character'),
      interaction_cards: selectedCards.value.filter((card) => card.type === 'interaction'),
      custom_cards: selectedCards.value.filter((card) => card.type === 'custom')
    }

    const content = JSON.stringify({
      world_meta: {
        uuid,
        name: worldName,
        version: '1.0.0',
        author: worldbookMeta.value.author.trim(),
        description: worldbookMeta.value.description.trim(),
        schema_version: 2,
        default_language: worldbookMeta.value.default_language.trim() || 'zh-CN',
        tags,
        player_character_id: worldbookMeta.value.player_character_id || undefined
      },
      entries
    }, null, 2)

    const result = await window.api.saveWorldFile(content, worldName, uuid)
    if (!result.success) {
      emit('failed', `世界书创建失败: ${result.error || '未知错误'}`)
      return
    }

    const deduplicated = extractionReport.value?.deduplicated || 0
    emit('completed', `新世界书已创建：${worldName}（卡片 ${selectedCards.value.length}，去重 ${deduplicated}）`)
    closeWizard()
  } catch (error: any) {
    emit('failed', `世界书创建失败: ${error.message}`)
  } finally {
    loading.value = false
  }
}

const deriveWorldbookName = (name: string) => {
  const base = name.replace(/\.[^.]+$/, '').trim()
  return base || '新世界书'
}

const getCardDisplayFields = (card: WorldCard): Array<{ label: string; value: string; inferred?: boolean }> => {
  const fields: Array<{ label: string; value: string; inferred?: boolean }> = []
  const raw = card as any

  if (card.type === 'character') {
    if (raw.name) fields.push({ label: '名称', value: raw.name })
    if (raw.race) fields.push({ label: '种族', value: raw.race, inferred: raw.race === '未知' })
    if (raw.class) fields.push({ label: '职业', value: raw.class, inferred: raw.class === '未知' })
    if (raw.level) fields.push({ label: '等级', value: String(raw.level) })
    if (raw.gender) fields.push({ label: '性别', value: raw.gender })
    if (raw.age) fields.push({ label: '年龄', value: String(raw.age) })
    if (raw.background?.length) fields.push({ label: '背景', value: raw.background.join('；') })
  } else if (card.type === 'setting') {
    if (raw.title) fields.push({ label: '标题', value: raw.title })
    if (raw.category) fields.push({ label: '分类', value: raw.category })
    if (raw.content) fields.push({ label: '内容', value: raw.content.slice(0, 200) })
  } else if (card.type === 'chapter') {
    if (raw.title) fields.push({ label: '标题', value: raw.title })
    if (raw.summary) fields.push({ label: '摘要', value: raw.summary })
    if (raw.objective) fields.push({ label: '目标', value: raw.objective })
  } else if (card.type === 'interaction') {
    if (raw.name) fields.push({ label: '名称', value: raw.name })
    if (raw.effect) fields.push({ label: '效果', value: raw.effect })
  } else {
    if (raw.title) fields.push({ label: '标题', value: raw.title })
    if (raw.content) fields.push({ label: '内容', value: raw.content.slice(0, 200) })
  }

  if (raw.tags?.length) fields.push({ label: '标签', value: raw.tags.join(', ') })

  return fields
}
</script>

<template>
  <div class="wizard-page">
    <div class="wizard-header">
      <h3>世界书导入向导</h3>
      <button class="btn-secondary" @click="closeWizard"><X :size="14" /> 返回</button>
    </div>

      <div class="wizard-steps">
        <span :class="['step-chip', { active: step >= 1 }]">1 选择文件</span>
        <span :class="['step-chip', { active: step >= 2 }]">2 分段预览</span>
        <span :class="['step-chip', { active: step >= 3 }]">3 AI 抽取</span>
        <span :class="['step-chip', { active: step >= 4 }]">4 审核卡片</span>
        <span :class="['step-chip', { active: step >= 5 }]">5 生成世界书</span>
      </div>

      <!-- Step 1: 文件选择 + 解析模式 -->
      <div v-if="step === 1" class="wizard-body">
        <p class="hint">支持 .txt 与 .md。可直接导入小说正文、设定集等普通文本，AI 会抽取为规范世界书卡片。</p>
        <div class="mode-selector">
          <label class="mode-option" :class="{ selected: parseMode === 'conservative' }">
            <input type="radio" v-model="parseMode" value="conservative" />
            <div class="mode-info">
              <span class="mode-title">保守模式</span>
              <span class="mode-desc">严格引用原文，不做推断，适合设定集</span>
            </div>
          </label>
          <label class="mode-option" :class="{ selected: parseMode === 'generative' }">
            <input type="radio" v-model="parseMode" value="generative" />
            <div class="mode-info">
              <span class="mode-title">发散模式</span>
              <span class="mode-desc">基于上下文推断补全，适合小说正文</span>
            </div>
          </label>
        </div>
        <button class="btn-primary" :disabled="loading" @click="importTextFile">
          <Upload :size="16" /> {{ loading ? '读取中...' : '选择文本文件' }}
        </button>
      </div>

      <!-- Step 2: 段落结构树预览 + 文本类型标注 -->
      <div v-else-if="step === 2" class="wizard-body">
        <div class="meta-row"><FileText :size="14" /> 文件：{{ fileName }}</div>
        <div class="meta-row">
          分段数：{{ parsedDocument?.totalSections || 0 }} ·
          总字符：{{ parsedDocument?.totalChars?.toLocaleString() || 0 }} ·
          模式：{{ parseMode === 'conservative' ? '保守' : '发散' }}
        </div>
        <div class="preview-list">
          <div
            v-for="(section, index) in pagedSections"
            :key="`${section.title}-${sectionPage * PAGE_SIZE + index}`"
            class="preview-item"
          >
            <div class="preview-title-row">
              <span class="preview-indent" :style="{ width: `${(section.level - 1) * 16}px` }" />
              <span class="preview-title">{{ section.title }}</span>
              <span class="preview-chars">{{ section.charCount }} 字</span>
            </div>
            <div class="preview-meta">
              <span class="preview-level">L{{ section.level }}</span>
              <select
                class="text-type-select"
                :value="section.textType"
                @change="updateSectionTextType(sectionPage * PAGE_SIZE + index, ($event.target as HTMLSelectElement).value as any)"
              >
                <option value="narrative">叙事</option>
                <option value="setting">设定</option>
                <option value="dialogue">对话</option>
                <option value="description">描写</option>
              </select>
              <span class="preview-entities" v-if="section.entities.length">
                实体 {{ section.entities.length }}
              </span>
            </div>
          </div>
        </div>
        <div v-if="sectionPageCount > 1" class="pagination-bar">
          <button class="btn-page" :disabled="sectionPage <= 0" @click="sectionPage--">上一页</button>
          <span class="page-info">{{ sectionPage + 1 }} / {{ sectionPageCount }}</span>
          <button class="btn-page" :disabled="sectionPage >= sectionPageCount - 1" @click="sectionPage++">下一页</button>
        </div>
        <div class="actions">
          <button class="btn-secondary" @click="step = 1">返回</button>
          <button class="btn-primary" :disabled="loading" @click="startExtraction">
            <Sparkles :size="16" /> {{ loading ? '准备中...' : '开始 AI 语义抽取' }}
          </button>
        </div>
      </div>

      <!-- Step 3: 长任务进度面板 -->
      <div v-else-if="step === 3" class="wizard-body">
        <div class="meta-row"><Sparkles :size="14" /> AI 语义抽取进行中</div>
        <ProgressBar v-if="taskProgress" :progress="taskProgress" />
        <div class="realtime-cards" v-if="extractedCards.length">
          <div class="meta-row">实时产出 {{ extractedCards.length }} 张卡片</div>
        </div>
        <div class="task-controls">
          <button
            v-if="taskProgress?.status === 'running'"
            class="btn-secondary"
            @click="pauseExtraction"
          >
            <Pause :size="14" /> 暂停
          </button>
          <button
            v-if="taskProgress?.status === 'paused'"
            class="btn-primary"
            @click="resumeExtraction"
          >
            <Play :size="14" /> 继续
          </button>
          <button
            v-if="taskProgress?.status === 'running' || taskProgress?.status === 'paused'"
            class="btn-danger"
            @click="cancelExtraction"
          >
            <Ban :size="14" /> 取消
          </button>
        </div>
        <div v-if="taskProgress?.errors?.length" class="error-list">
          <div v-for="(err, i) in taskProgress.errors" :key="i" class="error-item">{{ err }}</div>
        </div>
      </div>

      <!-- Step 4: 卡片逐条预览 -->
      <div v-else-if="step === 4" class="wizard-body">
        <div class="meta-row"><ListChecks :size="14" /> 抽取到 {{ extractedCards.length }} 张卡片</div>
        <div class="meta-row" v-if="extractionReport">
          去重 {{ extractionReport.deduplicated }} · 自动修复 {{ extractionReport.autoFixed }} · 解析兜底 {{ extractionReport.parseFailed ? '是' : '否' }}
        </div>
        <div class="meta-row" v-if="extractionReport?.validation">
          校验：错误 {{ extractionReport.validation.stats.errors }} · 警告 {{ extractionReport.validation.stats.warnings }}
        </div>
        <div v-if="extractionReport?.validation?.issues?.length" class="report-list">
          <div
            v-for="(issue, index) in extractionReport.validation.issues.slice(0, 8)"
            :key="`${issue.cardId}-${issue.field}-${index}`"
            class="report-item"
            :class="issue.level"
          >
            <span class="report-level">{{ issue.level.toUpperCase() }}</span>
            <span class="report-msg">{{ issue.cardId }} / {{ issue.field }}：{{ issue.message }}</span>
          </div>
        </div>
        <div class="review-list">
          <div v-for="card in pagedCards" :key="card.id" class="review-card">
            <div class="review-card-header" @click="toggleCardExpand(card.id)">
              <input
                type="checkbox"
                :checked="selectedCardIds.has(card.id)"
                @change.stop="toggleCard(card.id)"
                @click.stop
              />
              <component :is="expandedCardIds.has(card.id) ? ChevronDown : ChevronRight" :size="14" />
              <span class="review-type">[{{ card.type }}]</span>
              <span class="review-name">{{ (card as any).name || (card as any).title || card.id }}</span>
              <span v-if="parseMode === 'generative'" class="inferred-badge">inferred</span>
            </div>
            <div v-if="expandedCardIds.has(card.id)" class="review-card-body">
              <div
                v-for="field in getCardDisplayFields(card)"
                :key="field.label"
                class="review-field"
              >
                <span class="review-field-label">{{ field.label }}</span>
                <span class="review-field-value" :class="{ 'is-inferred': field.inferred }">
                  {{ field.value }}
                  <span v-if="field.inferred" class="inferred-tag">[inferred]</span>
                </span>
              </div>
            </div>
          </div>
        </div>
        <div v-if="cardPageCount > 1" class="pagination-bar">
          <button class="btn-page" :disabled="cardPage <= 0" @click="cardPage--">上一页</button>
          <span class="page-info">{{ cardPage + 1 }} / {{ cardPageCount }}</span>
          <button class="btn-page" :disabled="cardPage >= cardPageCount - 1" @click="cardPage++">下一页</button>
        </div>
        <div class="actions">
          <button class="btn-secondary" @click="step = 2">返回</button>
          <button class="btn-primary" @click="step = 5">
            下一步（已选 {{ selectedCards.length }}）
          </button>
        </div>
      </div>

      <!-- Step 5: 世界书元数据 + 统计 + 生成 -->
      <div v-else class="wizard-body">
        <p class="hint">将基于所选卡片创建新的世界书文件（不会覆盖当前已加载世界书）。</p>
        <div class="stats-bar" v-if="Object.keys(cardStats).length">
          <span v-for="(count, type) in cardStats" :key="type" class="stat-chip">
            {{ type }} × {{ count }}
          </span>
          <span class="stat-chip stat-total">共 {{ selectedCards.length }} 张</span>
        </div>
        <div class="field-row">
          <div class="field flex-2">
            <label>世界书名称 *</label>
            <input v-model="worldbookMeta.name" type="text" placeholder="输入新世界书名称" />
          </div>
          <div class="field flex-1">
            <label>默认语言</label>
            <input v-model="worldbookMeta.default_language" type="text" placeholder="zh-CN" />
          </div>
        </div>
        <div class="field">
          <label>作者</label>
          <input v-model="worldbookMeta.author" type="text" placeholder="可选" />
        </div>
        <div class="field">
          <label>描述</label>
          <textarea v-model="worldbookMeta.description" rows="3" placeholder="可选" />
        </div>
        <div class="field">
          <label>标签（逗号分隔）</label>
          <input v-model="worldbookMeta.tagsText" type="text" placeholder="奇幻, 科幻, 战锤" />
        </div>
        <div class="field" v-if="selectedCards.filter(c => c.type === 'character').length">
          <label>玩家角色</label>
          <select v-model="worldbookMeta.player_character_id">
            <option value="">自动（第一个角色卡）</option>
            <option v-for="c in selectedCards.filter(c => c.type === 'character')" :key="c.id" :value="c.id">
              {{ c.name }}
            </option>
          </select>
        </div>
        <div class="actions">
          <button class="btn-secondary" @click="step = 4">返回</button>
          <button class="btn-primary" :disabled="loading" @click="confirmGenerate">
            <Check :size="16" /> {{ loading ? '创建中...' : '创建新世界书' }}
          </button>
        </div>
      </div>
  </div>
</template>

<style scoped>
.wizard-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  padding: 24px 32px;
  overflow: auto;
  background: var(--bg-app);
  color: var(--text-primary);
}

.wizard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.wizard-header h3 {
  margin: 0;
  color: var(--accent-gold);
}

.wizard-steps {
  display: flex;
  gap: 8px;
  margin: 14px 0;
}

.step-chip {
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid var(--border-default);
  color: var(--text-muted);
  font-size: 12px;
}

.step-chip.active {
  color: var(--accent-gold);
  border-color: var(--accent-gold);
  background: var(--accent-gold-weak);
}

.wizard-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hint {
  color: var(--text-muted);
  margin: 0;
}

.meta-row {
  color: var(--text-secondary);
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Mode Selector */
.mode-selector {
  display: flex;
  gap: 10px;
}

.mode-option {
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  cursor: pointer;
  background: var(--bg-surface);
  transition: all 0.2s;
}

.mode-option.selected {
  border-color: var(--accent-gold);
  background: var(--accent-gold-weak);
}

.mode-option input[type="radio"] {
  margin-top: 2px;
}

.mode-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mode-title {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 13px;
}

.mode-desc {
  color: var(--text-muted);
  font-size: 12px;
}

/* Preview List */
.preview-list,
.review-list {
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 8px;
  flex: 1;
  min-height: 200px;
  max-height: calc(100vh - 320px);
  overflow: auto;
  background: var(--bg-surface);
}

.preview-item {
  padding: 8px;
  border-bottom: 1px solid var(--border-default);
}

.preview-item:last-child {
  border-bottom: none;
}

.preview-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.preview-indent {
  flex-shrink: 0;
}

.preview-title {
  color: var(--text-primary);
  flex: 1;
}

.preview-chars {
  color: var(--text-muted);
  font-size: 11px;
  flex-shrink: 0;
}

.preview-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  padding-left: 16px;
}

.preview-level {
  color: var(--text-muted);
  font-size: 11px;
}

.text-type-select {
  background: var(--bg-input);
  border: 1px solid var(--border-default);
  color: var(--text-primary);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 11px;
}

.preview-entities {
  color: var(--text-muted);
  font-size: 11px;
}

/* Report List */
.report-list {
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 8px;
  max-height: 160px;
  overflow: auto;
  background: var(--bg-elevated);
}

.report-item {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-default);
  display: flex;
  gap: 8px;
  align-items: center;
}

.report-item:last-child {
  border-bottom: none;
}

.report-item.error .report-level {
  color: var(--state-danger);
}

.report-item.warning .report-level {
  color: var(--state-warning);
}

.report-level {
  font-size: 11px;
  min-width: 56px;
}

.report-msg {
  color: var(--text-secondary);
  font-size: 12px;
}

/* Task Controls */
.task-controls {
  display: flex;
  gap: 8px;
}

.error-list {
  border: 1px solid var(--state-danger);
  border-radius: 6px;
  padding: 8px;
  max-height: 120px;
  overflow: auto;
  background: var(--bg-elevated);
}

.error-item {
  color: var(--state-danger);
  font-size: 12px;
  padding: 4px 0;
}

/* Review Cards */
.review-card {
  border-bottom: 1px solid var(--border-default);
}

.review-card:last-child {
  border-bottom: none;
}

.review-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.review-card-header:hover {
  background: var(--bg-elevated);
}

.review-type {
  color: var(--text-muted);
  font-size: 12px;
}

.review-name {
  color: var(--text-primary);
  flex: 1;
}

.inferred-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--inferred-highlight);
  color: #111;
  font-weight: 600;
}

.review-card-body {
  padding: 4px 8px 12px 32px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.review-field {
  display: flex;
  gap: 8px;
  font-size: 12px;
}

.review-field-label {
  color: var(--text-muted);
  min-width: 48px;
  flex-shrink: 0;
}

.review-field-value {
  color: var(--text-secondary);
  word-break: break-all;
}

.review-field-value.is-inferred {
  color: var(--inferred-highlight);
}

.inferred-tag {
  font-size: 10px;
  color: var(--inferred-highlight);
  margin-left: 4px;
}

/* Stats Bar */
.stats-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.stat-chip {
  padding: 4px 10px;
  border-radius: 4px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 12px;
  border: 1px solid var(--border-default);
}

.stat-chip.stat-total {
  color: var(--accent-gold);
  border-color: var(--accent-gold);
}

/* Fields */
.field-row {
  display: flex;
  gap: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field.flex-2 {
  flex: 2;
}

.field.flex-1 {
  flex: 1;
}

.field label {
  color: var(--text-secondary);
  font-size: 12px;
}

.field input,
.field textarea,
.field select {
  border: 1px solid var(--border-default);
  background: var(--bg-input);
  color: var(--text-primary);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
  width: 100%;
}

.field select {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237f8897' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  padding-right: 28px;
}

.field select option {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.field textarea {
  resize: vertical;
}

/* Actions */
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-primary,
.btn-secondary,
.btn-danger {
  border: none;
  border-radius: 6px;
  cursor: pointer;
  padding: 8px 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-primary {
  background: var(--accent-gold);
  color: #111;
  font-weight: 600;
  transition: opacity 0.2s;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  color: var(--text-primary);
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: var(--bg-panel);
  border-color: var(--text-muted);
}

.btn-danger {
  background: var(--state-danger);
  color: #fff;
  font-weight: 600;
  transition: opacity 0.2s;
}

.btn-danger:hover {
  opacity: 0.9;
}

.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px 0 2px;
}

.btn-page {
  background: var(--bg-elevated);
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  padding: 4px 14px;
  font-size: 13px;
  cursor: pointer;
}

.btn-page:disabled {
  opacity: 0.4;
  cursor: default;
}

.page-info {
  font-size: 13px;
  color: var(--text-muted);
}
</style>
