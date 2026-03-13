import type { WorldCard, Difficulty, RuntimeLoreMeta } from '@shared/Interface'

export interface ValidationIssue {
  level: 'error' | 'warning'
  cardId: string
  field: string
  message: string
}

export interface ValidationReport {
  valid: boolean
  issues: ValidationIssue[]
  stats: {
    total: number
    errors: number
    warnings: number
    autoFixed: number
  }
}

export function validateWorldData(data: any): ValidationReport {
  const cards: WorldCard[] = [
    ...(data?.entries?.setting_cards || []),
    ...(data?.entries?.chapter_cards || []),
    ...(data?.entries?.character_cards || []),
    ...(data?.entries?.interaction_cards || []),
    ...(data?.entries?.custom_cards || [])
  ]
  const normalized = validateAndNormalizeWorldCards(cards)
  return normalized.report
}

export function validateAndNormalizeWorldCards(rawCards: any[]): { cards: WorldCard[]; report: ValidationReport } {
  const normalized: WorldCard[] = []
  let autoFixed = 0

  rawCards.forEach((rawCard, index) => {
    const { card, fixed } = normalizeWorldCard(rawCard, index)
    autoFixed += fixed
    normalized.push(card)
  })

  const report = validateWorldCards(normalized)
  report.stats.autoFixed = autoFixed
  return { cards: normalized, report }
}

export function normalizeWorldCard(rawCard: any, index = 0): { card: WorldCard; fixed: number } {
  let fixed = 0
  const type = normalizeType(rawCard?.type)
  if (type !== rawCard?.type) fixed += 1

  const visible = rawCard?.visible || {
    public_visible: true,
    player_visible: true,
    unlock_condition: null
  }
  if (!rawCard?.visible) fixed += 1

  const id = rawCard?.id || `${type}-${Date.now()}-${index}`
  if (!rawCard?.id) fixed += 1

  if (type === 'setting') {
    const category = rawCard?.category && typeof rawCard.category === 'string' ? rawCard.category : 'background'
    if (category !== rawCard?.category) fixed += 1
    return {
      card: {
        id,
        type: 'setting',
        visible,
        category,
        title: rawCard?.title || rawCard?.name || `设定-${index + 1}`,
        content: rawCard?.content || '',
        tags: Array.isArray(rawCard?.tags) ? rawCard.tags : [],
        runtime_lore: normalizeRuntimeLore(rawCard?.runtime_lore)
      },
      fixed
    }
  }

  if (type === 'chapter') {
    return {
      card: {
        id,
        type: 'chapter',
        visible,
        title: rawCard?.title || `章节-${index + 1}`,
        summary: rawCard?.summary || '',
        objective: rawCard?.objective || '待补充',
        status: ['pending', 'active', 'completed'].includes(rawCard?.status) ? rawCard.status : 'pending',
        is_current: Boolean(rawCard?.is_current),
        plot_points: Array.isArray(rawCard?.plot_points) ? rawCard.plot_points : [],
        rewards: Array.isArray(rawCard?.rewards) ? rawCard.rewards : [],
        tags: Array.isArray(rawCard?.tags) ? rawCard.tags : [],
        default_active_entities: Array.isArray(rawCard?.default_active_entities) ? rawCard.default_active_entities : undefined,
        chapter_memory_summary: rawCard?.chapter_memory_summary || undefined,
        entrance_conditions: rawCard?.entrance_conditions || undefined,
        exit_conditions: rawCard?.exit_conditions || undefined,
        risk_level: ['low', 'medium', 'high'].includes(rawCard?.risk_level) ? rawCard.risk_level : undefined,
        runtime_lore: normalizeRuntimeLore(rawCard?.runtime_lore)
      },
      fixed
    }
  }

  if (type === 'character') {
    return {
      card: {
        id,
        type: 'character',
        visible,
        name: rawCard?.name || `角色-${index + 1}`,
        prefix_name: rawCard?.prefix_name || '',
        race: Array.isArray(rawCard?.race) ? rawCard.race : (rawCard?.race || '未知'),
        age: Number.isFinite(rawCard?.age) ? rawCard.age : 20,
        gender: rawCard?.gender || '未知',
        class: rawCard?.class || '未知',
        level: Number.isFinite(rawCard?.level) ? rawCard.level : 1,
        affiliation: Array.isArray(rawCard?.affiliation) ? rawCard.affiliation : [],
        status: Array.isArray(rawCard?.status) ? rawCard.status : [],
        traits: Array.isArray(rawCard?.traits) ? rawCard.traits : [],
        attributes: rawCard?.attributes ? {
          str: Number.isFinite(rawCard.attributes.str) ? rawCard.attributes.str : 10,
          dex: Number.isFinite(rawCard.attributes.dex) ? rawCard.attributes.dex : 10,
          con: Number.isFinite(rawCard.attributes.con) ? rawCard.attributes.con : 10,
          int: Number.isFinite(rawCard.attributes.int) ? rawCard.attributes.int : 10,
          wis: Number.isFinite(rawCard.attributes.wis) ? rawCard.attributes.wis : 10,
          cha: Number.isFinite(rawCard.attributes.cha) ? rawCard.attributes.cha : 10
        } : undefined,
        personality: Array.isArray(rawCard?.personality) ? rawCard.personality : [],
        inventory: Array.isArray(rawCard?.inventory) ? rawCard.inventory : [],
        background: Array.isArray(rawCard?.background) ? rawCard.background : [],
        tags: Array.isArray(rawCard?.tags) ? rawCard.tags : [],
        voice_profile: rawCard?.voice_profile || null,
        aliases: Array.isArray(rawCard?.aliases) ? rawCard.aliases : undefined,
        narrative_role: ['protagonist', 'major_npc', 'background'].includes(rawCard?.narrative_role) ? rawCard.narrative_role : undefined,
        relationship_refs: Array.isArray(rawCard?.relationship_refs) ? rawCard.relationship_refs : undefined,
        scene_presence_rules: Array.isArray(rawCard?.scene_presence_rules) ? rawCard.scene_presence_rules : undefined,
        runtime_lore: normalizeRuntimeLore(rawCard?.runtime_lore)
      },
      fixed
    }
  }

  if (type === 'interaction') {
    const validDifficulties: Difficulty[] = ['easy', 'normal', 'hard', 'extreme']
    const difficulty = validDifficulties.includes(rawCard?.difficulty) ? rawCard.difficulty : 'normal'
    return {
      card: {
        id,
        type: 'interaction',
        visible,
        name: rawCard?.name || `交互-${index + 1}`,
        description: rawCard?.description || rawCard?.effect || rawCard?.name || '未描述',
        difficulty,
        related_tags: Array.isArray(rawCard?.related_tags) ? rawCard.related_tags : undefined,
        prerequisite_tags: Array.isArray(rawCard?.prerequisite_tags) ? rawCard.prerequisite_tags : undefined,
        cost: rawCard?.cost || undefined,
        d20_logic: typeof rawCard?.d20_logic === 'string' ? rawCard.d20_logic : undefined,
        min_level: Number.isFinite(rawCard?.min_level) ? rawCard.min_level : undefined,
        element: rawCard?.element || undefined,
        effect: rawCard?.effect || undefined,
        trigger_contexts: Array.isArray(rawCard?.trigger_contexts) ? rawCard.trigger_contexts : undefined,
        suggested_costs: Array.isArray(rawCard?.suggested_costs) ? rawCard.suggested_costs : undefined,
        failure_escalations: Array.isArray(rawCard?.failure_escalations) ? rawCard.failure_escalations : undefined,
        related_entities: Array.isArray(rawCard?.related_entities) ? rawCard.related_entities : undefined,
        runtime_lore: normalizeRuntimeLore(rawCard?.runtime_lore)
      },
      fixed
    }
  }

  return {
    card: {
      id,
      type: 'custom',
      visible,
      category: rawCard?.category || '未分类',
      title: rawCard?.title || rawCard?.name || `条目-${index + 1}`,
      content: rawCard?.content || '',
      tags: Array.isArray(rawCard?.tags) ? rawCard.tags : [],
      runtime_lore: normalizeRuntimeLore(rawCard?.runtime_lore)
    },
    fixed
  }
}

export function validateWorldCards(cards: WorldCard[]): ValidationReport {
  const issues: ValidationIssue[] = []

  const idMap = new Map<string, number>()
  cards.forEach((card) => {
    idMap.set(card.id, (idMap.get(card.id) || 0) + 1)
  })

  cards.forEach((card) => {
    if (!card.id || card.id.trim().length === 0) {
      issues.push({ level: 'error', cardId: card.id || 'unknown', field: 'id', message: '缺少卡片 ID' })
    }

    if (!card.visible) {
      issues.push({ level: 'error', cardId: card.id, field: 'visible', message: '缺少 visible 字段' })
    }

    const duplicated = idMap.get(card.id) || 0
    if (duplicated > 1) {
      issues.push({ level: 'error', cardId: card.id, field: 'id', message: 'ID 冲突（重复）' })
    }

    if (card.type === 'character') {
      const c = card as any
      if (!c.name) {
        issues.push({ level: 'error', cardId: card.id, field: 'name', message: '角色缺少 name' })
      }
    }

    if (card.type === 'chapter') {
      const c = card as any
      if (!c.title) {
        issues.push({ level: 'error', cardId: card.id, field: 'title', message: '章节缺少 title' })
      }
      if (!c.objective) {
        issues.push({ level: 'warning', cardId: card.id, field: 'objective', message: '章节缺少 objective' })
      }
    }

    if (card.type === 'setting') {
      const c = card as any
      if (!c.title) {
        issues.push({ level: 'warning', cardId: card.id, field: 'title', message: '设定缺少 title' })
      }
      if (!c.category) {
        issues.push({ level: 'warning', cardId: card.id, field: 'category', message: '设定缺少 category' })
      }
    }

    if (card.type === 'interaction') {
      const c = card as any
      if (!c.name) {
        issues.push({ level: 'warning', cardId: card.id, field: 'name', message: '交互缺少 name' })
      }
      if (!c.description) {
        issues.push({ level: 'warning', cardId: card.id, field: 'description', message: '交互缺少 description' })
      }
    }

    // v0.2.1: runtime_lore 校验
    if (card.runtime_lore) {
      const rl = card.runtime_lore
      if (rl.activation?.mode && !['always', 'keyword', 'semantic', 'hybrid'].includes(rl.activation.mode)) {
        issues.push({ level: 'warning', cardId: card.id, field: 'runtime_lore.activation.mode', message: `无效的激活模式: ${rl.activation.mode}` })
      }
      if (rl.insertion?.position && !['system-prelude', 'world-context', 'chapter-context', 'character-context', 'author-note', 'depth'].includes(rl.insertion.position)) {
        issues.push({ level: 'warning', cardId: card.id, field: 'runtime_lore.insertion.position', message: `无效的注入位置: ${rl.insertion.position}` })
      }
      if (rl.quality_score !== undefined && (rl.quality_score < 0 || rl.quality_score > 100)) {
        issues.push({ level: 'warning', cardId: card.id, field: 'runtime_lore.quality_score', message: `质量评分超出范围: ${rl.quality_score}` })
      }
    }
  })

  const errors = issues.filter((issue) => issue.level === 'error').length
  const warnings = issues.length - errors

  return {
    valid: errors === 0,
    issues,
    stats: {
      total: cards.length,
      errors,
      warnings,
      autoFixed: 0
    }
  }
}

function normalizeType(type: string | undefined): 'setting' | 'chapter' | 'character' | 'interaction' | 'custom' {
  if (!type) return 'custom'
  const lower = String(type).toLowerCase()
  if (['setting', 'chapter', 'character', 'interaction', 'custom'].includes(lower)) {
    return lower as any
  }
  if (lower.includes('设定')) return 'setting'
  if (lower.includes('章节')) return 'chapter'
  if (lower.includes('角色')) return 'character'
  if (lower.includes('交互')) return 'interaction'
  return 'custom'
}

function normalizeRuntimeLore(rl: any): RuntimeLoreMeta | undefined {
  if (!rl || typeof rl !== 'object') return undefined
  return rl as RuntimeLoreMeta
}

function normalizeSettingCategory(category: string | undefined): string {
  if (!category || typeof category !== 'string') return 'background'
  return category
}
