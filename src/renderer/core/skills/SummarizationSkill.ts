import type { AISkill, SkillContext, ChronicleEntry, ChapterCard, StoryMemoryAtom } from '@shared/Interface'
import { db } from '../../db/db'
import { AIService } from '../AIService'
import { useConfigStore } from '../../store/config'

/**
 * SummarizationSkill
 * phase: standalone
 * 用于将历史压缩为结构化摘要，存储到章节 summary
 */
export const SummarizationSkill: AISkill = {
  id: 'summarization',
  name: '历史摘要生成',
  phase: 'standalone',
  defaultPriority: 0,
  description: '将历史压缩为结构化摘要，存储到章节 summary',
  async execute(ctx: SkillContext): Promise<any> {
    const chapterId = await getActiveChapterId()
    if (!chapterId) {
      return { success: true, warnings: ['No active chapter found for summarization'] }
    }

    const summary = await summarizeEntries(ctx.history)
    await updateChapterSummary(chapterId, summary)
    return { success: true, data: { chapterId, summary } }
  },
  fallback: async (_error: Error, ctx: SkillContext) => {
    const fallbackSummary = buildLocalSummary(ctx.history)
    const chapterId = await getActiveChapterId()
    if (chapterId) {
      await updateChapterSummary(chapterId, fallbackSummary)
    }
    return {
      success: true,
      warnings: ['SummarizationSkill fallback used local summary'],
      data: { chapterId, summary: fallbackSummary }
    }
  }
}

export async function summarizeEntries(entries: ChronicleEntry[]): Promise<string> {
  if (entries.length === 0) return '暂无可摘要内容。'

  const configStore = useConfigStore()
  const historyText = entries
    .slice(-30)
    .map((entry) => `[${entry.role}] ${entry.content}`)
    .join('\n')

  const prompt = `请将以下历史压缩为200字以内的结构化摘要，必须包含：关键事件、角色状态变化、未解决线索。\n\n${historyText}`

  if (!configStore.apiKey || !configStore.baseUrl || !configStore.model) {
    return buildLocalSummary(entries)
  }

  const aiService = new AIService({
    apiKey: configStore.apiKey,
    baseUrl: configStore.baseUrl,
    model: configStore.model
  })

  let output = ''
  output = await aiService.sendMessage(prompt, (token) => {
    output += token
  }, () => {}, true, configStore.timeout)

  const cleaned = output.trim()
  if (!cleaned) return buildLocalSummary(entries)
  return cleaned.length > 220 ? `${cleaned.slice(0, 220)}…` : cleaned
}

export async function summarizeChapterIfNeeded(
  chapterId: string,
  entries: ChronicleEntry[],
  threshold: number
): Promise<string | null> {
  if (!chapterId) return null

  const chapter = await db.world_cards.get(chapterId)
  if (!chapter || chapter.type !== 'chapter') return null

  const chapterCard = chapter as ChapterCard
  if (chapterCard.summary && chapterCard.summary.trim().length > 0) {
    return chapterCard.summary
  }

  if (entries.length < threshold) {
    return null
  }

  const summary = await summarizeEntries(entries)
  await updateChapterSummary(chapterId, summary)
  return summary
}

async function getActiveChapterId(): Promise<string | null> {
  const cards = await db.world_cards.toArray()
  const active = cards.find(c => c.type === 'chapter' && c.status === 'active')
  return active ? active.id : null
}

async function updateChapterSummary(chapterId: string | null, summary: string) {
  if (!chapterId) return
  const card = await db.world_cards.get(chapterId)
  if (!card || card.type !== 'chapter') return

  await db.world_cards.put({
    ...card,
    summary
  } as ChapterCard)
}

function buildLocalSummary(entries: ChronicleEntry[]): string {
  const recent = entries.slice(-8)
  const snippets = recent.map((entry) => `${entry.role}: ${entry.content.slice(0, 40)}`)
  const text = `关键事件：${snippets.slice(0, 3).join('；')}。角色状态变化：待进一步确认。未解决线索：待整理。`
  return text.length > 220 ? `${text.slice(0, 220)}…` : text
}

/**
 * Generate StoryMemoryAtoms from a chunk of history entries.
 * Splits entries into groups, extracts entities and locations, assigns importance.
 */
export function generateStoryMemoryAtoms(
  entries: ChronicleEntry[],
  chapterId?: string,
  summaryText?: string
): StoryMemoryAtom[] {
  if (entries.length === 0) return []

  const atoms: StoryMemoryAtom[] = []
  // Group entries into chunks of ~10 turns for atom granularity
  const chunkSize = 10
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize)
    const text = chunk.map(e => e.content).join(' ')
    const entities = extractEntitiesFromText(text)
    const locations = extractLocationsFromText(text)
    const sourceTurns = chunk.map(e => e.turn)

    // Importance based on content richness: more entities/locations = higher importance
    const importance = Math.min(1, 0.3 + entities.length * 0.1 + locations.length * 0.05)

    // Detect emotional tone from keywords
    const emotionalTone = detectEmotionalTone(text)

    const atomSummary = summaryText && i === 0
      ? summaryText
      : buildLocalSummary(chunk)

    atoms.push({
      id: `atom-${chapterId || 'global'}-${sourceTurns[0] || Date.now()}`,
      chapterId,
      summary: atomSummary,
      entities,
      locationHints: locations,
      sourceTurns,
      importance,
      emotionalTone
    })
  }

  return atoms
}

/**
 * Persist StoryMemoryAtoms to the database.
 */
export async function persistMemoryAtoms(atoms: StoryMemoryAtom[]): Promise<number> {
  if (atoms.length === 0) return 0
  await db.story_memory.bulkPut(atoms)
  return atoms.length
}

/**
 * Generate and persist atoms on chapter switch or history threshold.
 */
export async function generateAndPersistAtomsIfNeeded(
  entries: ChronicleEntry[],
  threshold: number = 30,
  chapterId?: string
): Promise<StoryMemoryAtom[]> {
  if (entries.length < threshold) return []

  // Check if atoms already exist for these turns
  const turnRange = entries.map(e => e.turn)
  const minTurn = Math.min(...turnRange)
  const maxTurn = Math.max(...turnRange)
  const existing = await db.story_memory
    .filter(a => a.sourceTurns.some(t => t >= minTurn && t <= maxTurn))
    .toArray()

  if (existing.length > 0) return [] // Already have atoms for this range

  const atoms = generateStoryMemoryAtoms(entries, chapterId)
  await persistMemoryAtoms(atoms)
  return atoms
}

function extractEntitiesFromText(text: string): string[] {
  const entities = new Set<string>()
  // Match quoted names (Chinese and Western)
  const quotedMatches = text.match(/[「『""]([^「『""」』]+?)[」』""]/g) || []
  for (const match of quotedMatches) {
    const name = match.slice(1, -1).trim()
    if (name.length >= 2 && name.length <= 20) entities.add(name)
  }
  // Match speaker names from dialogue patterns
  const speakerMatches = text.match(/(?:^|\n)\s*([^\s:：]{2,10})\s*[：:]/gm) || []
  for (const match of speakerMatches) {
    const name = match.replace(/[：:\s\n]/g, '').trim()
    if (name.length >= 2 && name.length <= 10 && !/^(user|assistant|system|ai)$/i.test(name)) {
      entities.add(name)
    }
  }
  return Array.from(entities).slice(0, 10)
}

function extractLocationsFromText(text: string): string[] {
  const locations = new Set<string>()
  const locationPatterns = [
    /(?:在|到达|前往|进入|离开|来到)\s*([^\s,，。！]{2,15})/g,
    /(?:位于|坐落于|地点[:：]\s*)([^\s,，。！]{2,15})/g
  ]
  for (const pattern of locationPatterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      const loc = match[1].trim()
      if (loc.length >= 2) locations.add(loc)
    }
  }
  return Array.from(locations).slice(0, 5)
}

function detectEmotionalTone(text: string): string {
  const toneMap: Record<string, string[]> = {
    'tense': ['战斗', '攻击', '危险', '威胁', '紧张', '恐惧', '死亡'],
    'joyful': ['欢笑', '庆祝', '胜利', '欢迎', '喜悦', '欣喜'],
    'melancholic': ['悲伤', '失去', '离别', '遗憾', '忧愁', '哀悼'],
    'mysterious': ['秘密', '神秘', '隐藏', '暗示', '谜团', '线索']
  }
  const lowerText = text.toLowerCase()
  let bestTone = 'neutral'
  let bestCount = 0
  for (const [tone, keywords] of Object.entries(toneMap)) {
    const count = keywords.filter(kw => lowerText.includes(kw)).length
    if (count > bestCount) {
      bestCount = count
      bestTone = tone
    }
  }
  return bestTone
}
