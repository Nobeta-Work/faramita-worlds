import type { WorldCard, WorldMeta, VoiceProfile, TraitTag, RuntimeLoreMeta } from '@shared/Interface'

interface WorldFileData {
  world_meta: Record<string, any>
  entries: Record<string, any[]>
}

interface MigrationReport {
  fromVersion: number
  toVersion: number
  changed: boolean
  issues: string[]
}

export function migrateWorldData(
  data: WorldFileData,
  fromVersion?: number,
  toVersion = 4
): { data: WorldFileData; report: MigrationReport } {
  const input = clone(data)
  const detectedVersion = fromVersion ?? Number(input?.world_meta?.schema_version || 1)

  let current = input
  const issues: string[] = []
  let changed = false

  if (detectedVersion < 2 && toVersion >= 2) {
    const migrated = migrateV1ToV2(current, issues)
    current = migrated
    changed = true
  }

  // ===== v2→v3 迁移: TraitTag + InteractionCard =====
  const currentSchemaVersion = Number((current.world_meta as any)?.schema_version || detectedVersion)
  if (currentSchemaVersion < 3 && toVersion >= 3) {
    current = migrateV2ToV3(current, issues)
    changed = true
  }

  // ===== v3→v4 迁移: RuntimeLoreMeta + 卡片扩展字段 =====
  const v3SchemaVersion = Number((current.world_meta as any)?.schema_version || detectedVersion)
  if (v3SchemaVersion < 4 && toVersion >= 4) {
    current = migrateV3ToV4(current, issues)
    changed = true
  }

  return {
    data: current,
    report: {
      fromVersion: detectedVersion,
      toVersion,
      changed,
      issues
    }
  }
}

function migrateV1ToV2(data: WorldFileData, issues: string[]): WorldFileData {
  const entries = data.entries || {}
  const allCards: WorldCard[] = [
    ...(entries.setting_cards || []),
    ...(entries.chapter_cards || []),
    ...(entries.character_cards || []),
    ...(entries.interaction_cards || []),
    ...(entries.custom_cards || [])
  ] as WorldCard[]

  const migratedCards = allCards.map((card, index) => normalizeCard(card as any, index, issues))

  const worldMeta: WorldMeta & { schema_version: number; default_language: string; tags: string[] } = {
    uuid: data.world_meta?.uuid || `world-${Date.now()}`,
    name: data.world_meta?.name || '未命名世界',
    version: data.world_meta?.version || '1.0.0',
    author: data.world_meta?.author || 'Unknown',
    description: data.world_meta?.description || '',
    schema_version: 2,
    default_language: data.world_meta?.default_language || 'zh-CN',
    tags: Array.isArray(data.world_meta?.tags) ? data.world_meta.tags : []
  }

  return {
    world_meta: worldMeta,
    entries: {
      setting_cards: migratedCards.filter((card) => card.type === 'setting'),
      chapter_cards: migratedCards.filter((card) => card.type === 'chapter'),
      character_cards: migratedCards.filter((card) => card.type === 'character'),
      interaction_cards: migratedCards.filter((card) => card.type === 'interaction'),
      custom_cards: migratedCards.filter((card) => card.type === 'custom')
    }
  }
}

function normalizeCard(card: any, index: number, issues: string[]): WorldCard {
  const id = card.id || `${card.type || 'card'}-${index + 1}`
  const visible = card.visible || {
    public_visible: true,
    player_visible: true,
    unlock_condition: null
  }

  if (!card.visible) {
    issues.push(`Card ${id}: missing visible, defaulted`)
  }

  if (card.type === 'setting') {
    const validCategory = ['background', 'race', 'level', 'class', 'rule']
    const category = validCategory.includes(card.category) ? card.category : 'background'
    if (category !== card.category) {
      issues.push(`Setting ${id}: invalid category '${card.category}', normalized to '${category}'`)
    }

    return {
      id,
      type: 'setting',
      visible,
      category,
      title: card.title || card.name || `设定-${index + 1}`,
      content: card.content || '',
      tags: Array.isArray(card.tags) ? card.tags : [],
      step: typeof card.step === 'number' ? card.step : undefined,
      suffix_names: Array.isArray(card.suffix_names) ? card.suffix_names : undefined,
      scaling_modes: card.scaling_modes && typeof card.scaling_modes === 'object' ? card.scaling_modes : undefined,
      default_mode: typeof card.default_mode === 'string' ? card.default_mode : undefined
    }
  }

  if (card.type === 'chapter') {
    return {
      id,
      type: 'chapter',
      visible,
      title: card.title || `章节-${index + 1}`,
      summary: card.summary || '',
      objective: card.objective || '待补充',
      status: ['pending', 'active', 'completed'].includes(card.status) ? card.status : 'pending',
      is_current: Boolean(card.is_current),
      plot_points: Array.isArray(card.plot_points) ? card.plot_points : [],
      rewards: Array.isArray(card.rewards) ? card.rewards : [],
      tags: Array.isArray(card.tags) ? card.tags : []
    }
  }

  if (card.type === 'character') {
    const profile = normalizeVoiceProfile(card.voice_profile)
    return {
      id,
      type: 'character',
      visible,
      name: card.name || `角色-${index + 1}`,
      prefix_name: card.prefix_name || '',
      race: Array.isArray(card.race) ? card.race : (card.race || '未知'),
      age: Number.isFinite(card.age) ? card.age : 20,
      gender: card.gender || '未知',
      class: card.class || '未知',
      level: Number.isFinite(card.level) ? card.level : 1,
      affiliation: Array.isArray(card.affiliation) ? card.affiliation : [],
      status: Array.isArray(card.status) ? card.status : [],
      traits: Array.isArray(card.traits) ? card.traits : [],
      attributes: card.attributes ? {
        str: Number.isFinite(card.attributes?.str) ? card.attributes.str : 10,
        dex: Number.isFinite(card.attributes?.dex) ? card.attributes.dex : 10,
        con: Number.isFinite(card.attributes?.con) ? card.attributes.con : 10,
        int: Number.isFinite(card.attributes?.int) ? card.attributes.int : 10,
        wis: Number.isFinite(card.attributes?.wis) ? card.attributes.wis : 10,
        cha: Number.isFinite(card.attributes?.cha) ? card.attributes.cha : 10
      } : undefined,
      personality: Array.isArray(card.personality) ? card.personality : [],
      inventory: Array.isArray(card.inventory) ? card.inventory : [],
      background: Array.isArray(card.background) ? card.background : [],
      tags: Array.isArray(card.tags) ? card.tags : [],
      voice_profile: profile
    }
  }

  if (card.type === 'interaction') {
    return {
      id,
      type: 'interaction',
      visible,
      name: card.name || `交互-${index + 1}`,
      description: card.description || card.effect || card.name || '未描述',
      difficulty: card.difficulty || 'normal',
      related_tags: Array.isArray(card.related_tags) ? card.related_tags : undefined,
      prerequisite_tags: Array.isArray(card.prerequisite_tags) ? card.prerequisite_tags : undefined,
      cost: card.cost || undefined,
      d20_logic: typeof card.d20_logic === 'string' ? card.d20_logic : undefined,
      min_level: Number.isFinite(card.min_level) ? card.min_level : undefined,
      element: card.element || undefined,
      effect: card.effect || undefined
    }
  }

  return {
    id,
    type: 'custom',
    visible,
    category: card.category || '未分类',
    title: card.title || card.name || `条目-${index + 1}`,
    content: card.content || '',
    tags: Array.isArray(card.tags) ? card.tags : []
  }
}

function normalizeVoiceProfile(profile: any): VoiceProfile | null {
  if (!profile || typeof profile !== 'object') return null

  const levels: VoiceProfile['vocabulary_level'][] = ['典雅', '口语化', '粗犷', '学术']
  const level = levels.includes(profile.vocabulary_level) ? profile.vocabulary_level : '口语化'

  return {
    tone: profile.tone || '',
    vocabulary_level: level,
    speech_patterns: Array.isArray(profile.speech_patterns) ? profile.speech_patterns : [],
    emotional_range: profile.emotional_range || '',
    example_dialogues: Array.isArray(profile.example_dialogues) ? profile.example_dialogues : []
  }
}

function clone<T>(data: T): T {
  return JSON.parse(JSON.stringify(data))
}

// ===== v2→v3 迁移逻辑 =====

function migrateV2ToV3(data: WorldFileData, issues: string[]): WorldFileData {
  const entries = data.entries || {}

  // 迁移 character_cards
  if (entries.character_cards) {
    entries.character_cards = entries.character_cards.map((card: any) => migrateCharacterAttributes(card, issues))
  }

  // 迁移 interaction_cards
  if (entries.interaction_cards) {
    entries.interaction_cards = entries.interaction_cards.map((card: any) => migrateInteractionCard(card, issues))
  }

  ;(data.world_meta as any).schema_version = 3
  issues.push('v2→v3: 属性系统迁移完成')

  return data
}

function migrateCharacterAttributes(card: any, issues: string[]): any {
  if (!card.attributes || (card.traits && card.traits.length > 0)) return card

  const traits: TraitTag[] = []
  const attrMap: Record<string, { high2: string; high1: string; low: string }> = {
    str: { high2: '神力', high1: '体魄强健', low: '体弱' },
    dex: { high2: '身手矫捷', high1: '手脚灵活', low: '笨拙' },
    con: { high2: '钢铁体魄', high1: '耐力充沛', low: '体质虚弱' },
    int: { high2: '智识渊博', high1: '思维敏捷', low: '愚钝' },
    wis: { high2: '洞察敏锐', high1: '直觉灵敏', low: '迟钝' },
    cha: { high2: '天生魅力', high1: '善于交际', low: '木讷寡言' },
  }

  for (const [attr, labels] of Object.entries(attrMap)) {
    const val = card.attributes[attr] ?? 10
    if (val >= 16) {
      traits.push({ text: labels.high2, type: 'strength', source: 'origin', weight: 2, active: true })
    } else if (val >= 14) {
      traits.push({ text: labels.high1, type: 'strength', source: 'origin', weight: 1, active: true })
    } else if (val <= 8) {
      traits.push({ text: labels.low, type: 'flaw', source: 'origin', weight: 1, active: true })
    }
  }

  applyClassCompensation(card, traits, issues)

  card.traits = traits
  issues.push(`角色 "${card.name}": attributes→traits, 生成 ${traits.length} 个标签`)
  return card
}

function applyClassCompensation(card: any, traits: TraitTag[], issues: string[]): void {
  const cls = (card.class || '').toLowerCase()
  const hasTag = (keyword: string) => traits.some(t => t.text.includes(keyword))

  const compensationMap: Record<string, { check: string; tag: string }> = {
    '法师': { check: '智识|思维', tag: '受过魔法训练' },
    'mage': { check: '智识|思维', tag: '受过魔法训练' },
    'wizard': { check: '智识|思维', tag: '受过魔法训练' },
    '战士': { check: '体魄|神力', tag: '战斗训练' },
    'warrior': { check: '体魄|神力', tag: '战斗训练' },
    'fighter': { check: '体魄|神力', tag: '战斗训练' },
    '盗贼': { check: '身手|灵活', tag: '盗贼技艺' },
    'rogue': { check: '身手|灵活', tag: '盗贼技艺' },
    'thief': { check: '身手|灵活', tag: '盗贼技艺' },
    '牧师': { check: '洞察|直觉', tag: '信仰之力' },
    'cleric': { check: '洞察|直觉', tag: '信仰之力' },
    'priest': { check: '洞察|直觉', tag: '信仰之力' },
  }

  for (const [className, rule] of Object.entries(compensationMap)) {
    if (cls.includes(className)) {
      const keywords = rule.check.split('|')
      if (!keywords.some(k => hasTag(k))) {
        traits.push({
          text: rule.tag,
          type: 'strength',
          source: 'origin',
          weight: 1,
          active: true,
        })
        issues.push(`  职业补偿: "${card.name}" (${card.class}) → +${rule.tag}`)
      }
      break
    }
  }
}

function migrateInteractionCard(card: any, issues: string[]): any {
  // d20_logic → difficulty
  if (card.d20_logic && !card.difficulty) {
    const match = card.d20_logic.match(/d20\s*(\d+)/i)
    const dc = match ? parseInt(match[1]) : 15
    if (dc <= 10) card.difficulty = 'easy'
    else if (dc <= 15) card.difficulty = 'normal'
    else if (dc <= 20) card.difficulty = 'hard'
    else card.difficulty = 'extreme'
    issues.push(`InteractionCard "${card.name}": d20_logic="${card.d20_logic}" → difficulty="${card.difficulty}"`)
  }

  // effect → description
  if (card.effect && !card.description) {
    card.description = card.effect
  }

  // 确保 difficulty 有默认值
  if (!card.difficulty) {
    card.difficulty = 'normal'
  }

  // 确保 description 有值
  if (!card.description) {
    card.description = card.name || '未描述'
  }

  return card
}

// ===== v3→v4 迁移逻辑 =====

function migrateV3ToV4(data: WorldFileData, issues: string[]): WorldFileData {
  const entries = data.entries || {}
  const allCategoryKeys = ['setting_cards', 'chapter_cards', 'character_cards', 'interaction_cards', 'custom_cards']

  // 为所有卡片生成 runtime_lore
  for (const key of allCategoryKeys) {
    if (entries[key]) {
      entries[key] = entries[key].map((card: any) => migrateCardToV4RuntimeLore(card, issues))
    }
  }

  // CharacterCard 扩展字段
  if (entries.character_cards) {
    entries.character_cards = entries.character_cards.map((card: any) => {
      if (!card.aliases) card.aliases = []
      if (!card.narrative_role) card.narrative_role = 'background'
      return card
    })
  }

  ;(data.world_meta as any).schema_version = 4
  issues.push('v3→v4: runtime_lore 迁移完成')

  return data
}

function migrateCardToV4RuntimeLore(card: any, issues: string[]): any {
  // 如果已有 runtime_lore，跳过
  if (card.runtime_lore) return card

  const hasKeywords = Array.isArray(card.activation_keywords) && card.activation_keywords.length > 0
  const hasAlwaysActive = card.always_active === true
  const hasPriority = typeof card.activation_priority === 'number' && card.activation_priority !== 0
  const hasTimedEffect = card.timed_effect && (card.timed_effect.sticky || card.timed_effect.cooldown)

  // 无旧字段可迁移，不生成空 runtime_lore
  if (!hasKeywords && !hasAlwaysActive && !hasPriority && !hasTimedEffect) return card

  const runtimeLore: RuntimeLoreMeta = {}

  // activation 迁移
  if (hasAlwaysActive || hasKeywords) {
    runtimeLore.activation = {}
    if (hasAlwaysActive) {
      runtimeLore.activation.mode = 'always'
    } else if (hasKeywords) {
      runtimeLore.activation.mode = 'keyword'
      runtimeLore.activation.keys = [...card.activation_keywords]
    }
  }

  // insertion 迁移
  if (hasPriority) {
    runtimeLore.insertion = {
      order: card.activation_priority
    }
  }

  // timed_effect 迁移
  if (hasTimedEffect) {
    runtimeLore.timed_effect = {}
    if (card.timed_effect.sticky) runtimeLore.timed_effect.sticky = card.timed_effect.sticky
    if (card.timed_effect.cooldown) runtimeLore.timed_effect.cooldown = card.timed_effect.cooldown
  }

  card.runtime_lore = runtimeLore
  const cardName = card.name || card.title || card.id
  issues.push(`卡片 "${cardName}": 旧字段 → runtime_lore`)

  return card
}
