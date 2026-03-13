import type { AISkill, SkillContext, SkillResult, WorldCard, EnhancedWorldbookImportResult } from '@shared/Interface'
import { AIService } from '../AIService'
import { PromptTemplate } from '../PromptTemplate'
import { useConfigStore } from '../../store/config'
import type { ParsedDocument, ParsedSection } from '../TextParser'
import { validateWorldCards, type ValidationReport } from '../WorldValidator'
import { TaskQueue, type TaskProgress } from '../TaskQueue'
import extractPromptRaw from '../prompts/worldbook-extract.prompt.md?raw'

const { body: extractTemplate } = PromptTemplate.parseFrontMatter(extractPromptRaw)
const MAX_SECTIONS_FOR_AI = 120
const MAX_SECTION_CONTENT = 2000

export type ParseMode = 'conservative' | 'generative'

export interface ExtractedWorldbookResult {
  cards: WorldCard[]
  report: {
    extracted: number
    deduplicated: number
    parseFailed: boolean
    autoFixed: number
    validation: ValidationReport
  }
  relations: EnhancedWorldbookImportResult['relations']
  activationSuggestions: EnhancedWorldbookImportResult['activationSuggestions']
  conflicts: EnhancedWorldbookImportResult['conflicts']
  repairHints: string[]
}

export const WorldbookExtractSkill: AISkill = {
  id: 'worldbook-extract',
  name: '世界书文本抽取',
  phase: 'standalone',
  defaultPriority: 0,
  description: '将文本分段抽取为结构化世界书卡片',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    const payload = ctx.skillOutputs['worldbook-import'] as { parsedDocument?: ParsedDocument; fileName?: string; parseMode?: ParseMode } | undefined
    if (!payload?.parsedDocument) {
      return { success: false, error: 'Missing parsedDocument in skillOutputs.worldbook-import' }
    }

    const { result } = await extractWorldbookCards(payload.parsedDocument, payload.fileName || 'imported.txt', payload.parseMode || 'conservative')
    return { success: true, data: result }
  },
  async fallback(_error: Error, ctx: SkillContext): Promise<SkillResult> {
    const payload = ctx.skillOutputs['worldbook-import'] as { parsedDocument?: ParsedDocument; fileName?: string } | undefined
    if (!payload?.parsedDocument) {
      return { success: true, warnings: ['Worldbook extract fallback skipped: no parsed document'] }
    }
    const result = extractByRules(payload.parsedDocument)
    return { success: true, warnings: ['Worldbook extract fallback: rule-based extraction used'], data: result }
  }
}

export async function extractWorldbookCards(
  parsedDocument: ParsedDocument,
  fileName: string,
  parseMode: ParseMode = 'conservative',
  onProgress?: (progress: TaskProgress) => void,
  onTaskQueueCreated?: (taskQueue: TaskQueue<ParsedSection>) => void
): Promise<{ result: ExtractedWorldbookResult; taskQueue: TaskQueue<ParsedSection> }> {
  const configStore = useConfigStore()
  const taskQueue = new TaskQueue<ParsedSection>({
    initialBatchSize: 8,
    minBatchSize: 4,
    maxBatchSize: 24
  })

  onTaskQueueCreated?.(taskQueue)

  if (!configStore.apiKey || !configStore.baseUrl || !configStore.model) {
    const fallback = extractByRules(parsedDocument)
    return { result: fallback, taskQueue }
  }

  const sections = parsedDocument.sections.slice(0, MAX_SECTIONS_FOR_AI).map((section, index) => ({
    ...section,
    index,
    content: section.content.slice(0, MAX_SECTION_CONTENT)
  }))

  if (!sections.length) {
    const fallback = extractByRules(parsedDocument)
    return { result: fallback, taskQueue }
  }

  const aiService = new AIService({
    apiKey: configStore.apiKey,
    baseUrl: configStore.baseUrl,
    model: configStore.model
  })

  let parseFailed = false

  const { results: rawCards, progress } = await taskQueue.execute(
    sections,
    async (batch, batchIndex, context) => {
      const batchSections = batch.map((s) => ({
        index: s.index,
        title: s.title,
        level: s.level,
        entities: s.entities,
        textType: s.textType,
        content: s.content
      }))

      const totalBatches = Math.ceil(sections.length / batch.length)
      const cards = await extractBatchCards(
        aiService,
        fileName,
        batchSections,
        batchIndex + 1,
        totalBatches,
        parseMode,
        context.existingEntities || []
      )

      if (!cards) {
        parseFailed = true
        return []
      }

      // 跨批次上下文：记录已抽取实体
      for (const card of cards) {
        const name = card?.name || card?.title
        const type = card?.type
        if (name && type) {
          context.existingEntities.push({ type, name })
        }
      }

      return cards
    },
    onProgress
  )

  if (!rawCards.length) {
    const fallback = extractByRules(parsedDocument)
    return {
      result: {
        cards: fallback.cards,
        report: {
          extracted: fallback.cards.length,
          deduplicated: fallback.report.deduplicated,
          parseFailed: true,
          autoFixed: fallback.report.autoFixed,
          validation: fallback.report.validation
        },
        relations: fallback.relations,
        activationSuggestions: fallback.activationSuggestions,
        conflicts: fallback.conflicts,
        repairHints: fallback.repairHints
      },
      taskQueue
    }
  }

  const { cards: normalized, deduplicated, autoFixed } = normalizeAndDeduplicate(rawCards)
  const enriched = enrichCards(normalized)
  const validation = validateWorldCards(enriched.cards)
  validation.stats.autoFixed = autoFixed + enriched.fixed

  return {
    result: {
      cards: enriched.cards,
      report: {
        extracted: enriched.cards.length,
        deduplicated,
        parseFailed,
        autoFixed: autoFixed + enriched.fixed,
        validation
      },
      ...buildEnhancedResult(enriched.cards, validation)
    },
    taskQueue
  }
}

async function extractBatchCards(
  aiService: AIService,
  fileName: string,
  sections: Array<{ index: number; title: string; level: number; entities: string[]; textType?: string; content: string }>,
  batchIndex: number,
  batchCount: number,
  parseMode: ParseMode = 'conservative',
  existingEntities: Array<{ type: string; name: string }> = []
): Promise<any[] | null> {
  const basePrompt = PromptTemplate.render(extractTemplate, {
    fileName,
    batchIndex,
    batchCount,
    sectionsJson: JSON.stringify(sections, null, 2),
    isConservativeMode: parseMode === 'conservative',
    isGenerativeMode: parseMode === 'generative',
    existingEntities
  })

  const first = await requestExtraction(aiService, basePrompt)
  if (first) return first

  const repairPrompt = `${basePrompt}\n\n请修复你的输出：仅返回严格 JSON 对象，格式必须为 {"cards": [...]}，不要任何额外文本。`
  return requestExtraction(aiService, repairPrompt)
}

async function requestExtraction(aiService: AIService, prompt: string, timeout?: number): Promise<any[] | null> {
  const resolvedTimeout = timeout ?? useConfigStore().timeout
  let raw = ''
  raw = await aiService.sendMessage(prompt, (token) => {
    raw += token
  }, () => {}, true, resolvedTimeout)

  return parseCardsFromResponse(raw)
}

function parseCardsFromResponse(raw: string): any[] | null {
  const cleaned = raw.trim()
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const target = fenced ? fenced[1].trim() : cleaned

  try {
    const json = JSON.parse(target)
    if (Array.isArray(json)) return json
    if (Array.isArray(json.cards)) return json.cards
    return null
  } catch {
    const jsonLike = target.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
    if (!jsonLike) return null
    try {
      const parsed = JSON.parse(jsonLike[1])
      if (Array.isArray(parsed)) return parsed
      if (Array.isArray(parsed.cards)) return parsed.cards
      return null
    } catch {
      return null
    }
  }
}

function normalizeAndDeduplicate(rawCards: any[]): { cards: WorldCard[]; deduplicated: number; autoFixed: number } {
  const result: WorldCard[] = []
  const seen = new Set<string>()
  let deduplicated = 0
  let autoFixed = 0

  rawCards.forEach((rawCard, index) => {
    const { card, fixed } = normalizeCard(rawCard, index)
    autoFixed += fixed

    const key = `${card.type}:${((card as any).name || (card as any).title || '').toLowerCase().trim()}`
    if (!key.endsWith(':') && !seen.has(key)) {
      seen.add(key)
      result.push(card)
    } else {
      deduplicated += 1
    }
  })

  const idAssigned = assignNumericIds(result)
  autoFixed += idAssigned.fixed

  return { cards: idAssigned.cards, deduplicated, autoFixed }
}

function normalizeCard(rawCard: any, index: number): { card: WorldCard; fixed: number } {
  let fixed = 0
  const type = normalizeType(rawCard?.type)
  const visibility = {
    public_visible: true,
    player_visible: true,
    unlock_condition: null
  }
  const stableBase = `${type}:${rawCard?.name || rawCard?.title || rawCard?.content || index}`
  const stableId = `${type}-${shortHash(stableBase)}`

  if (type === 'setting') {
    const card: WorldCard = {
      id: rawCard?.id || stableId,
      type: 'setting',
      visible: visibility,
      category: normalizeSettingCategory(rawCard?.category) as any,
      title: rawCard?.title || rawCard?.name || `设定-${index + 1}`,
      content: rawCard?.content || rawCard?.summary || '',
      tags: Array.isArray(rawCard?.tags) ? rawCard.tags.slice(0, 5) : []
    }
    if (!rawCard?.id) fixed += 1
    if (!rawCard?.category) fixed += 1
    return { card, fixed }
  }

  if (type === 'chapter') {
    const card: WorldCard = {
      id: rawCard?.id || stableId,
      type: 'chapter',
      visible: visibility,
      title: rawCard?.title || rawCard?.name || `章节-${index + 1}`,
      summary: rawCard?.summary || '',
      objective: rawCard?.objective || rawCard?.content || '待补充',
      status: 'pending',
      is_current: false,
      plot_points: [],
      tags: Array.isArray(rawCard?.tags) ? rawCard.tags.slice(0, 5) : []
    }
    if (!rawCard?.id) fixed += 1
    if (!rawCard?.objective) fixed += 1
    return { card, fixed }
  }

  if (type === 'character') {
    const sourceText = collectCharacterSourceText(rawCard)
    const inferred = inferCharacterFieldsFromText(sourceText)
    const race = pickFirstNonEmptyText([
      rawCard?.race,
      rawCard?.species,
      rawCard?.kind,
      rawCard?.['种族'],
      rawCard?.['血统'],
      inferred.race
    ])
    const charClass = pickFirstNonEmptyText([
      rawCard?.class,
      rawCard?.profession,
      rawCard?.job,
      rawCard?.role,
      rawCard?.['职业'],
      rawCard?.['职阶'],
      rawCard?.['门派'],
      rawCard?.['专精'],
      inferred.class
    ])
    const level = pickFirstPositiveInteger([
      rawCard?.level,
      rawCard?.lv,
      rawCard?.['等级'],
      rawCard?.['位阶'],
      rawCard?.['阶位'],
      inferred.level
    ])
    const age = pickFirstPositiveInteger([rawCard?.age, rawCard?.['年龄'], inferred.age])
    const gender = pickFirstNonEmptyText([rawCard?.gender, rawCard?.sex, rawCard?.['性别'], inferred.gender])
    const affiliation = normalizeStringArray(rawCard?.affiliation || rawCard?.faction || rawCard?.['阵营'] || inferred.affiliation)
    const status = normalizeStringArray(rawCard?.status || rawCard?.state || rawCard?.['状态'] || inferred.status)
    const background = normalizeBackground(rawCard, sourceText)

    const card: WorldCard = {
      id: rawCard?.id || stableId.replace('character-', 'char-'),
      type: 'character',
      visible: visibility,
      name: rawCard?.name || rawCard?.title || `角色-${index + 1}`,
      prefix_name: '',
      race: race || '未知',
      age: age || 20,
      gender: gender || '未知',
      class: charClass || '未知',
      level: level || 1,
      affiliation,
      status,
      attributes: {
        str: 10,
        dex: 10,
        con: 10,
        int: 10,
        wis: 10,
        cha: 10
      },
      personality: Array.isArray(rawCard?.personality) ? rawCard.personality : [],
      inventory: Array.isArray(rawCard?.inventory) ? rawCard.inventory : [],
      background,
      tags: Array.isArray(rawCard?.tags) ? rawCard.tags.slice(0, 5) : []
    }
    if (!rawCard?.id) fixed += 1
    if (!rawCard?.attributes) fixed += 1
    if (!level) fixed += 1
    if (!race) fixed += 1
    if (!charClass) fixed += 1
    return { card, fixed }
  }

  if (type === 'interaction') {
    const card: WorldCard = {
      id: rawCard?.id || stableId,
      type: 'interaction',
      visible: visibility,
      name: rawCard?.name || rawCard?.title || `交互-${index + 1}`,
      description: rawCard?.description || rawCard?.content || '',
      difficulty: rawCard?.difficulty || 'normal',
      min_level: 1,
      element: rawCard?.element || 'none',
      cost: rawCard?.cost || 'none',
      d20_logic: rawCard?.d20_logic || null,
      effect: rawCard?.effect || rawCard?.content || ''
    }
    if (!rawCard?.id) fixed += 1
    if (!rawCard?.effect) fixed += 1
    return { card, fixed }
  }

  const card: WorldCard = {
    id: rawCard?.id || stableId,
    type: 'custom',
    visible: visibility,
    category: rawCard?.category || '导入',
    title: rawCard?.title || rawCard?.name || `条目-${index + 1}`,
    content: rawCard?.content || rawCard?.summary || '',
    tags: Array.isArray(rawCard?.tags) ? rawCard.tags.slice(0, 5) : []
  }
  if (!rawCard?.id) fixed += 1
  if (!rawCard?.category) fixed += 1
  return { card, fixed }
}

function normalizeType(type: string | undefined): 'setting' | 'chapter' | 'character' | 'interaction' | 'custom' {
  if (!type) return 'custom'
  const t = String(type).toLowerCase()
  if (['setting', 'chapter', 'character', 'interaction', 'custom'].includes(t)) {
    return t as any
  }
  if (t.includes('角色')) return 'character'
  if (t.includes('章节')) return 'chapter'
  if (t.includes('设定')) return 'setting'
  if (t.includes('交互')) return 'interaction'
  return 'custom'
}

function normalizeSettingCategory(category: string | undefined): string {
  const c = (category || '').toLowerCase()
  const validCategories = ['background', 'race', 'level', 'class', 'rule', 'location', 'faction', 'item', 'lore', 'skill']
  if (validCategories.includes(c)) {
    return c
  }
  if (c.includes('种族') || c.includes('血统')) return 'race'
  if (c.includes('职业') || c.includes('门派') || c.includes('专精')) return 'class'
  if (c.includes('规则') || c.includes('法则') || c.includes('机制')) return 'rule'
  if (c.includes('等级') || c.includes('位阶')) return 'level'
  if (c.includes('地点') || c.includes('地理') || c.includes('位置') || c.includes('地区') || c.includes('location')) return 'location'
  if (c.includes('势力') || c.includes('阵营') || c.includes('组织') || c.includes('faction')) return 'faction'
  if (c.includes('物品') || c.includes('武器') || c.includes('装备') || c.includes('道具') || c.includes('item') || c.includes('weapon') || c.includes('equipment')) return 'item'
  if (c.includes('技能') || c.includes('魔法') || c.includes('术') || c.includes('能力') || c.includes('skill') || c.includes('ability')) return 'skill'
  if (c.includes('传说') || c.includes('传承') || c.includes('典故') || c.includes('lore')) return 'lore'
  return 'background'
}

function extractByRules(parsedDocument: ParsedDocument): ExtractedWorldbookResult {
  const cards: WorldCard[] = []
  const seen = new Set<string>()

  const sections = parsedDocument.sections.slice(0, MAX_SECTIONS_FOR_AI)

  sections.forEach((section, index) => {
    const title = section.title || `段落 ${index + 1}`
    const tags = section.entities.slice(0, 5)

    const inferredType = inferRuleType(section.title, section.content)
    const key = `${inferredType}:${title.toLowerCase().trim()}`
    if (seen.has(key)) return
    seen.add(key)

    const visibility = {
      public_visible: true,
      player_visible: true,
      unlock_condition: null
    }

    if (inferredType === 'setting') {
      cards.push({
        id: `setting-${Date.now()}-${index}`,
        type: 'setting',
        visible: visibility,
        category: inferSettingCategoryFromText(title, section.content) as any,
        title,
        content: section.content,
        tags
      })
      return
    }

    if (inferredType === 'chapter') {
      cards.push({
        id: `chapter-${Date.now()}-${index}`,
        type: 'chapter',
        visible: visibility,
        title,
        summary: summarizeText(section.content, 120),
        objective: summarizeText(section.content, 80) || '待补充',
        status: 'pending',
        is_current: false,
        plot_points: [],
        tags
      })
      return
    }

    if (inferredType === 'character') {
      cards.push({
        id: `char-${Date.now()}-${index}`,
        type: 'character',
        visible: visibility,
        name: title,
        prefix_name: '',
        race: '未知',
        age: 20,
        gender: '未知',
        class: '未知',
        level: 1,
        affiliation: [],
        status: [],
        attributes: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        personality: [],
        inventory: [],
        background: [summarizeText(section.content, 140)],
        tags
      })
      return
    }

    cards.push({
      id: `custom-${Date.now()}-${index}`,
      type: 'custom',
      visible: visibility,
      category: '导入',
      title,
      content: section.content,
      tags
    })
  })

  const deduped = normalizeAndDeduplicate(cards)
  const enriched = enrichCards(deduped.cards)
  const validation = validateWorldCards(enriched.cards)
  validation.stats.autoFixed = deduped.autoFixed + enriched.fixed

  return {
    cards: enriched.cards,
    report: {
      extracted: enriched.cards.length,
      deduplicated: deduped.deduplicated,
      parseFailed: false,
      autoFixed: deduped.autoFixed + enriched.fixed,
      validation
    },
    ...buildEnhancedResult(enriched.cards, validation)
  }
}

function enrichCards(cards: WorldCard[]): { cards: WorldCard[]; fixed: number } {
  let fixed = 0

  const enriched = cards.map((card) => {
    if (card.type === 'character') {
      const char = card as any
      const raceCandidate = looksLikeRaceDefinition(char)
      if (raceCandidate) {
        fixed += 1
        return {
          id: card.id,
          type: 'setting',
          visible: card.visible,
          category: 'race',
          title: char.name || '种族设定',
          content: mergeText([Array.isArray(char.background) ? char.background.join(' ') : '', summarizeText(char.name || '', 40)]),
          tags: normalizeTags([...(char.tags || []), '种族'])
        } as WorldCard
      }

      if (!Array.isArray(char.background) || char.background.length === 0) {
        char.background = ['待补充']
        fixed += 1
      }

      const text = collectCharacterSourceText(char)
      const inferred = inferCharacterFieldsFromText(text)

      const normalizedRace = pickFirstNonEmptyText([char.race])
      const normalizedClass = pickFirstNonEmptyText([char.class])
      const normalizedGender = pickFirstNonEmptyText([char.gender])
      const normalizedLevel = pickFirstPositiveInteger([char.level])

      if (!normalizedRace && inferred.race) {
        char.race = inferred.race
        fixed += 1
      } else {
        char.race = normalizedRace || '未知'
      }

      if (!normalizedClass && inferred.class) {
        char.class = inferred.class
        fixed += 1
      } else {
        char.class = normalizedClass || '未知'
      }

      if (!normalizedGender && inferred.gender) {
        char.gender = inferred.gender
        fixed += 1
      } else {
        char.gender = normalizedGender || '未知'
      }

      if (!normalizedLevel && inferred.level) {
        char.level = inferred.level
        fixed += 1
      } else {
        char.level = normalizedLevel || 1
      }

      const normalizedAge = pickFirstPositiveInteger([char.age, inferred.age])
      if (normalizedAge && normalizedAge !== char.age) {
        char.age = normalizedAge
        fixed += 1
      } else if (!normalizedAge) {
        char.age = 20
      }

      const affiliation = normalizeStringArray(char.affiliation || inferred.affiliation)
      if (affiliation.length !== (Array.isArray(char.affiliation) ? char.affiliation.length : 0)) {
        fixed += 1
      }
      char.affiliation = affiliation

      const status = normalizeStringArray(char.status || inferred.status)
      if (status.length !== (Array.isArray(char.status) ? char.status.length : 0)) {
        fixed += 1
      }
      char.status = status

      return char as WorldCard
    }

    if (card.type === 'chapter') {
      const chapter = card as any
      if (!chapter.summary || !chapter.summary.trim()) {
        chapter.summary = summarizeText(chapter.objective || '', 100) || '待补充'
        fixed += 1
      }
      if (!chapter.objective || !chapter.objective.trim()) {
        chapter.objective = summarizeText(chapter.summary || '', 80) || '待补充'
        fixed += 1
      }
      return chapter as WorldCard
    }

    if (card.type === 'setting') {
      const setting = card as any
      if (!setting.category || setting.category === 'background') {
        const inferred = inferSettingCategoryFromText(setting.title || '', setting.content || '')
        if (setting.category !== inferred) {
          setting.category = inferred
          fixed += 1
        }
      }
      if (!setting.content || !setting.content.trim()) {
        setting.content = setting.title || '待补充'
        fixed += 1
      }
      setting.tags = normalizeTags(setting.tags || [])
      return setting as WorldCard
    }

    return card
  })

  const reindexed = assignNumericIds(enriched)

  // Activate the first chapter card by default
  let firstChapterActivated = false
  for (const card of reindexed.cards) {
    if (card.type === 'chapter' && !firstChapterActivated) {
      ;(card as any).status = 'active'
      ;(card as any).is_current = true
      firstChapterActivated = true
    }
  }

  return { cards: reindexed.cards, fixed: fixed + reindexed.fixed }
}

function looksLikeRaceDefinition(char: any): boolean {
  const name = String(char?.name || '').trim()
  const backgroundText = Array.isArray(char?.background) ? char.background.join(' ') : ''
  const merged = `${name} ${backgroundText}`

  const raceNamePattern = /(族|种|人种|血统|精灵|矮人|兽人|龙裔|亚人|亡灵|魔裔|妖精)$/
  const raceContentPattern = /(种族|血统|寿命|成年|体型|语言|天赋|族群|部族|繁衍|生理|文化)/

  const isGenericIndividual = (char?.race === '未知' || !char?.race) && (char?.class === '未知' || !char?.class) && (char?.level === 1 || !char?.level)

  return (raceNamePattern.test(name) || raceContentPattern.test(merged)) && isGenericIndividual
}

function inferRuleType(title: string, content: string): 'setting' | 'chapter' | 'character' | 'custom' {
  const text = `${title} ${content}`
  if (/(第[一二三四五六七八九十百千\d]+章|chapter\s+\d+)/i.test(title)) return 'chapter'
  if (/(种族|血统|世界观|历史|地理|规则|体系|势力|阵营|宗教|文明|王国|帝国)/.test(text)) return 'setting'
  if (/(地点|地区|城市|城镇|村庄|大陆|区域|领地|森林|山脉|遗迹)/.test(text)) return 'setting'
  if (/(组织|公会|教会|军团|联盟|骑士团|门派|宗派)/.test(text)) return 'setting'
  if (/(武器|防具|装备|道具|药水|宝物|物品|器具|法器|神器)/.test(text)) return 'setting'
  if (/(技能|魔法|法术|能力|术式|功法|天赋|奥术)/.test(text)) return 'setting'
  if (/(传说|传承|典故|神话|史诗|秘闻|编年)/.test(text)) return 'setting'
  if (/(角色|人物|姓名|年龄|职业|背景|经历)/.test(text)) return 'character'
  return 'custom'
}

function inferSettingCategoryFromText(title: string, content: string): string {
  const text = `${title} ${content}`.toLowerCase()
  if (/(种族|血统|精灵|矮人|兽人|龙裔|亚人|race)/.test(text)) return 'race'
  if (/(职业|门派|class|流派|专精)/.test(text)) return 'class'
  if (/(等级|位阶|tier|level)/.test(text)) return 'level'
  if (/(规则|判定|骰|检定|机制|法则|rule)/.test(text)) return 'rule'
  if (/(地点|地区|城市|城镇|村庄|大陆|区域|地理|领地|location|region|city|town)/.test(text)) return 'location'
  if (/(势力|阵营|组织|公会|教会|军团|联盟|faction|guild|order)/.test(text)) return 'faction'
  if (/(武器|防具|装备|道具|药水|宝物|物品|器具|item|weapon|equipment|artifact)/.test(text)) return 'item'
  if (/(技能|魔法|法术|能力|术式|功法|skill|spell|ability)/.test(text)) return 'skill'
  if (/(传说|传承|典故|神话|史诗|秘闻|lore|legend|myth)/.test(text)) return 'lore'
  return 'background'
}

function summarizeText(text: string, maxLength: number): string {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim()
  if (!cleaned) return ''
  if (cleaned.length <= maxLength) return cleaned
  return `${cleaned.slice(0, maxLength)}…`
}

function mergeText(parts: string[]): string {
  return parts
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim()
}

function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set((tags || []).map((tag) => String(tag || '').trim()).filter(Boolean))).slice(0, 5)
}

function normalizeBackground(rawCard: any, sourceText: string): string[] {
  const fromArray = Array.isArray(rawCard?.background) ? rawCard.background : []
  const fromScalar = [rawCard?.background, rawCard?.content, rawCard?.summary]
  const merged = normalizeStringArray([...fromArray, ...fromScalar])
  if (merged.length > 0) return merged.slice(0, 3)
  const fallback = summarizeText(sourceText, 180)
  return fallback ? [fallback] : []
}

function collectCharacterSourceText(rawCard: any): string {
  const backgroundText = Array.isArray(rawCard?.background) ? rawCard.background.join(' ') : String(rawCard?.background || '')
  return [
    rawCard?.name,
    rawCard?.title,
    rawCard?.content,
    rawCard?.summary,
    rawCard?.description,
    backgroundText,
    rawCard?.['人物简介'],
    rawCard?.['角色背景']
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(' ')
}

function pickFirstPositiveInteger(values: any[]): number | undefined {
  for (const value of values) {
    const parsed = toPositiveInteger(value)
    if (parsed) return parsed
  }
  return undefined
}

function toPositiveInteger(value: any): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const matched = trimmed.match(/\d+/)
    if (!matched) return undefined
    const parsed = Number.parseInt(matched[0], 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
  }
  return undefined
}

function pickFirstNonEmptyText(values: any[]): string | undefined {
  for (const value of values) {
    const normalized = normalizeTextValue(value)
    if (normalized) return normalized
  }
  return undefined
}

function normalizeTextValue(value: any): string | undefined {
  if (value === undefined || value === null) return undefined
  let text = String(value).replace(/\s+/g, ' ').trim()
  if (!text) return undefined
  if (/^(未知|待补充|无|暂无|null|none|n\/a)$/i.test(text)) return undefined
  // Strip [inferred] / [推断] / [推測] markers
  text = text.replace(/\s*\[(?:inferred|推断|推測|猜测|uncertain)\]\s*/gi, '').trim()
  // If text is slash-separated uncertain options like "学生/研究者/教师", take the first option
  if (/^[^/]{1,20}(\/[^/]{1,20}){1,5}$/.test(text) && !/https?:\/\//.test(text)) {
    text = text.split('/')[0].trim()
  }
  if (!text) return undefined
  return text
}

function normalizeStringArray(value: any): string[] {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => normalizeTextValue(item)).filter(Boolean) as string[])).slice(0, 6)
  }
  const text = normalizeTextValue(value)
  if (!text) return []
  return Array.from(new Set(text.split(/[、,，;；/|]/).map((item) => normalizeTextValue(item)).filter(Boolean) as string[])).slice(0, 6)
}

function inferCharacterFieldsFromText(text: string): {
  race?: string
  class?: string
  level?: number
  age?: number
  gender?: string
  affiliation?: string[]
  status?: string[]
} {
  const source = String(text || '')
  if (!source.trim()) return {}

  const race = extractLabeledText(source, ['种族', '血统', '族群', '人种', 'race'])
  const charClass = extractLabeledText(source, ['职业', '职阶', '门派', '专精', '职位', 'class'])
  const gender = extractLabeledText(source, ['性别', 'gender'])
  const affiliation = normalizeStringArray(extractLabeledText(source, ['阵营', '组织', '势力', '归属', 'affiliation', 'faction']))
  const status = normalizeStringArray(extractLabeledText(source, ['状态', 'status']))

  const level = extractLabeledNumber(source, ['等级', '位阶', '阶位', 'level', 'lv']) || extractPatternNumber(source, /(?:\bLv\.?\s*|\blevel\s*)(\d{1,3})/i) || extractPatternNumber(source, /(\d{1,3})\s*级/)
  const age = extractLabeledNumber(source, ['年龄', 'age']) || extractPatternNumber(source, /(\d{1,3})\s*岁/)

  return {
    race: normalizeTextValue(race),
    class: normalizeTextValue(charClass),
    level,
    age,
    gender: normalizeTextValue(gender),
    affiliation,
    status
  }
}

function extractLabeledText(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const escaped = escapeRegex(label)
    const regex = new RegExp(`(?:^|[\\n。；;])\\s*${escaped}\\s*[：:=-]\\s*([^\\n。；;，,]{1,30})`, 'i')
    const matched = text.match(regex)
    const value = matched?.[1]
    const normalized = normalizeTextValue(value)
    if (normalized) return normalized
  }
  return undefined
}

function extractLabeledNumber(text: string, labels: string[]): number | undefined {
  for (const label of labels) {
    const escaped = escapeRegex(label)
    const regex = new RegExp(`(?:^|[\\n。；;])\\s*${escaped}\\s*[：:=-]?\\s*(\\d{1,3})`, 'i')
    const matched = text.match(regex)
    if (matched?.[1]) {
      const parsed = Number.parseInt(matched[1], 10)
      if (Number.isFinite(parsed) && parsed > 0) return parsed
    }
  }
  return undefined
}

function extractPatternNumber(text: string, regex: RegExp): number | undefined {
  const matched = text.match(regex)
  if (!matched?.[1]) return undefined
  const parsed = Number.parseInt(matched[1], 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function escapeRegex(text: string): string {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function shortHash(input: string): string {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

function assignNumericIds(cards: WorldCard[]): { cards: WorldCard[]; fixed: number } {
  const counters: Record<string, number> = {
    character: 1,
    chapter: 1,
    setting: 1,
    interaction: 1,
    custom: 1
  }

  const prefixByType: Record<string, string> = {
    character: 'char-',
    chapter: 'chapter-',
    setting: 'setting-',
    interaction: 'interaction-',
    custom: 'custom-'
  }

  let fixed = 0
  const normalized = cards.map((card) => {
    const type = card.type
    const prefix = prefixByType[type] || 'custom-'
    const next = counters[type] || 1
    const expectedId = `${prefix}${next}`
    counters[type] = next + 1

    if (card.id !== expectedId) fixed += 1
    return {
      ...card,
      id: expectedId
    }
  })

  return { cards: normalized, fixed }
}

/**
 * Build enhanced import result fields: relations, activationSuggestions, conflicts, repairHints
 */
function buildEnhancedResult(cards: WorldCard[], validation: ValidationReport): {
  relations: EnhancedWorldbookImportResult['relations']
  activationSuggestions: EnhancedWorldbookImportResult['activationSuggestions']
  conflicts: EnhancedWorldbookImportResult['conflicts']
  repairHints: string[]
} {
  const relations: EnhancedWorldbookImportResult['relations'] = []
  const activationSuggestions: EnhancedWorldbookImportResult['activationSuggestions'] = []
  const conflicts: EnhancedWorldbookImportResult['conflicts'] = []
  const repairHints: string[] = []

  // Build name→id lookup
  const nameToId = new Map<string, string>()
  for (const card of cards) {
    const name = (card as any).name || (card as any).title
    if (name) nameToId.set(name.toLowerCase(), card.id)
  }

  // Infer relations from card content referencing other card names
  for (const card of cards) {
    const cardText = getCardSearchText(card)
    if (!cardText) continue
    for (const [name, targetId] of nameToId) {
      if (targetId === card.id) continue
      if (cardText.toLowerCase().includes(name)) {
        const relType = card.type === 'character' && cards.find(c => c.id === targetId)?.type === 'character'
          ? 'related_to'
          : card.type === 'character' ? 'belongs_to' : 'related_to'
        // Avoid duplicate relations
        if (!relations.some(r => r.from === card.id && r.to === targetId)) {
          relations.push({ from: card.id, to: targetId, type: relType, confidence: 0.6 })
        }
      }
    }
  }

  // Generate activation suggestions based on card content
  for (const card of cards) {
    if (card.activation_keywords?.length) continue // Already has keywords
    const keys = generateActivationKeys(card)
    if (keys.length > 0) {
      activationSuggestions.push({
        cardId: card.id,
        keys,
        mode: 'keyword',
        rationale: `基于卡片名称和内容关键词自动生成`
      })
    }
  }

  // Convert validation errors to conflicts
  for (const error of validation.errors) {
    conflicts.push({
      cardId: error.cardId,
      level: 'error',
      message: error.message
    })
  }
  for (const warning of validation.warnings) {
    conflicts.push({
      cardId: warning.cardId,
      level: 'warning',
      message: warning.message
    })
  }

  // Generate repair hints
  if (validation.errors.length > 0) {
    repairHints.push(`发现 ${validation.errors.length} 个校验错误，建议检查卡片数据完整性`)
  }
  const charCards = cards.filter(c => c.type === 'character')
  const defaultAttrCount = charCards.filter(c => {
    const attrs = (c as any).attributes
    return attrs && attrs.str === 10 && attrs.dex === 10 && attrs.con === 10
  }).length
  if (defaultAttrCount > 0) {
    repairHints.push(`${defaultAttrCount} 个角色使用默认属性值，建议手动调整`)
  }
  const unknownRaceCount = charCards.filter(c => (c as any).race === '未知').length
  if (unknownRaceCount > 0) {
    repairHints.push(`${unknownRaceCount} 个角色种族为"未知"，建议补充`)
  }

  return { relations, activationSuggestions, conflicts, repairHints }
}

function getCardSearchText(card: WorldCard): string {
  const parts: string[] = []
  if ((card as any).name) parts.push((card as any).name)
  if ((card as any).title) parts.push((card as any).title)
  if ((card as any).content) parts.push((card as any).content)
  if ((card as any).summary) parts.push((card as any).summary)
  if (Array.isArray((card as any).background)) parts.push((card as any).background.join(' '))
  if ((card as any).description) parts.push((card as any).description)
  return parts.join(' ')
}

function generateActivationKeys(card: WorldCard): string[] {
  const keys: string[] = []
  const name = ((card as any).name || (card as any).title || '').trim()
  if (name && name.length >= 2) {
    keys.push(name)
  }
  // Add tags as potential activation keys
  const tags = (card as any).tags as string[] | undefined
  if (tags?.length) {
    for (const tag of tags.slice(0, 3)) {
      if (tag.length >= 2 && !keys.includes(tag)) {
        keys.push(tag)
      }
    }
  }
  return keys.slice(0, 5)
}
