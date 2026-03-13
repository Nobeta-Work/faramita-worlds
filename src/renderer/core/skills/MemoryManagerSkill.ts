import type {
  AISkill,
  SkillContext,
  MemoryManagerConfig,
  ShortTermMemory,
  LongTermMemory,
  WorldStateSnapshot,
  ChapterCard,
  ContextPackage
} from '@shared/Interface'
import { db } from '../../db/db'
import { AIProtocol } from '../AIProtocol'
import { useConfigStore } from '../../store/config'
import { summarizeChapterIfNeeded } from './SummarizationSkill'

/**
 * MemoryManagerSkill
 * phase: context-assembly
 * priority: 0
 * 负责组装分层记忆（短期、长期、世界快照）并融合为 assembledContext
 */
export const MemoryManagerSkill: AISkill = {
  id: 'memory-manager',
  name: '记忆管理器',
  phase: 'context-assembly',
  defaultPriority: 0,
  description: '组装短期、长期、世界快照记忆，融合上下文',
  async execute(ctx: SkillContext): Promise<any> {
    const configStore = useConfigStore()
    const memoryConfig: MemoryManagerConfig = {
      shortTermWindowSize: configStore.shortTermWindowSize,
      summarizationThreshold: configStore.summarizationThreshold,
      tokenBudget: configStore.tokenBudget
    }

    const windowSize = memoryConfig.shortTermWindowSize || 8
    const shortTerm: ShortTermMemory = {
      type: 'short-term',
      entries: ctx.history.slice(-windowSize),
      windowSize
    }

    const activeChapterId = await getActiveChapterId()
    const longTerm = await getChapterSummaries(
      activeChapterId,
      ctx.history,
      memoryConfig.summarizationThreshold
    )

    const snapshot = await AIProtocol.getSnapshot(ctx.activeCharacterIds)
    const worldSnapshot: WorldStateSnapshot = {
      type: 'world-snapshot',
      activeChapterId: snapshot.activeChapter?.id || null,
      activeCharacterIds: ctx.activeCharacterIds,
      activeSettingIds: snapshot.settings.map(s => s.id),
      summary: buildWorldSummary(snapshot),
      delta: await getWorldDelta(),
      timestamp: Date.now()
    }

    ctx.memoryLayers = {
      shortTerm,
      longTerm,
      worldSnapshot
    }

    ctx.assembledContext = renderMemoryContext(
      shortTerm,
      longTerm,
      worldSnapshot,
      memoryConfig.tokenBudget
    )

    // v0.2.1: Build contextPackage for downstream skills
    const contextPackage: ContextPackage = {
      memoryLayers: [shortTerm, ...longTerm, worldSnapshot],
      activatedCards: [], // Populated later by CardRelevanceSkill
      retrievalTrace: null,
      directives: null,
      totalTokens: AIProtocol.estimateTokens(ctx.assembledContext)
    }
    ctx.contextPackage = contextPackage

    return {
      success: true,
      data: {
        shortTermCount: shortTerm.entries.length,
        longTermCount: longTerm.length,
        tokenEstimate: AIProtocol.estimateTokens(ctx.assembledContext)
      }
    }
  },
  fallback: async (_error: Error, ctx: SkillContext) => {
    ctx.assembledContext = `【短期记忆】\n${ctx.history.slice(-8).map((entry) => `[${entry.role}] ${entry.content}`).join('\n')}`
    return {
      success: true,
      warnings: ['MemoryManagerSkill fallback: using short-term memory only']
    }
  }
}

// 辅助函数：获取当前活跃章节ID
async function getActiveChapterId(): Promise<string | null> {
  const cards = await db.world_cards.toArray()
  const active = cards.find(c => c.type === 'chapter' && c.status === 'active')
  return active ? active.id : null
}

// 辅助函数：获取章节摘要链
async function getChapterSummaries(
  activeChapterId: string | null,
  history: SkillContext['history'],
  threshold: number
): Promise<LongTermMemory[]> {
  const cards = await db.world_cards.toArray()
  const chapters = cards
    .filter((card): card is ChapterCard => card.type === 'chapter')
    .filter((chapter) => chapter.status === 'active' || chapter.status === 'completed')

  const output: LongTermMemory[] = []
  for (const chapter of chapters) {
    let summary = chapter.summary?.trim() || ''
    if (!summary && chapter.id === activeChapterId) {
      const generated = await summarizeChapterIfNeeded(chapter.id, history, threshold)
      summary = generated?.trim() || ''
    }
    if (!summary) continue

    output.push({
      type: 'long-term',
      chapterId: chapter.id,
      summary,
      timestamp: Date.now()
    })
  }

  return output
}

// 辅助函数：构建世界快照摘要
function buildWorldSummary(snapshot: Awaited<ReturnType<typeof AIProtocol.getSnapshot>>): string {
  let text = ''
  if (snapshot.activeChapter) {
    text += `章节：${snapshot.activeChapter.title}\n`
  }
  if (snapshot.activeCharacters.length) {
    text += `角色：${snapshot.activeCharacters.map((character) => character.name).join(', ')}\n`
  }
  if (snapshot.settings.length) {
    text += `设定：${snapshot.settings.map((setting) => setting.title || '未命名设定').join(', ')}\n`
  }
  return text
}

// 辅助函数：获取最近 world_updates 增量
async function getWorldDelta(): Promise<any> {
  // TODO: 由 WorldStateTrackerSkill 维护，暂返回空
  return {}
}

// 组装融合上下文文本
function renderMemoryContext(
  shortTerm: ShortTermMemory,
  longTerm: LongTermMemory[],
  worldSnapshot: WorldStateSnapshot,
  tokenBudget: number
): string {
  const worldText = AIProtocol.formatHistory([], {
    layer: 'world-snapshot',
    summaries: [worldSnapshot.summary]
  })

  let longSummaries = longTerm.map((memory) => memory.summary)
  let longText = AIProtocol.formatHistory([], {
    layer: 'long-term',
    summaries: longSummaries,
    tokenBudget
  })

  let shortWindow = shortTerm.windowSize
  let shortText = AIProtocol.formatHistory(shortTerm.entries, {
    layer: 'short-term',
    windowSize: shortWindow,
    tokenBudget
  })

  let merged = `【世界快照】\n${worldText}\n\n【长期记忆】\n${longText}\n\n【短期记忆】\n${shortText}`
  while (AIProtocol.estimateTokens(merged) > tokenBudget) {
    if (longSummaries.length > 1) {
      longSummaries = longSummaries.slice(1)
      longText = AIProtocol.formatHistory([], {
        layer: 'long-term',
        summaries: longSummaries,
        tokenBudget
      })
    } else if (shortWindow > 2) {
      shortWindow -= 1
      shortText = AIProtocol.formatHistory(shortTerm.entries, {
        layer: 'short-term',
        windowSize: shortWindow,
        tokenBudget
      })
    } else {
      break
    }
    merged = `【世界快照】\n${worldText}\n\n【长期记忆】\n${longText}\n\n【短期记忆】\n${shortText}`
  }

  return merged
}
