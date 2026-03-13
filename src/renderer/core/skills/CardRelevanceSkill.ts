/**
 * CardRelevanceSkill — Discovery phase skill.
 *
 * Uses LoreInjector for keyword-based card selection and token budget control,
 * then calls AI with a budget-limited index for active_role_suggestions.
 */

import type { AISkill, SkillContext, SkillResult, WorldCard, RetrievalTrace } from '@shared/Interface'
import { db } from '../../db/db'
import { AIProtocol } from '../AIProtocol'
import { NarrativeEngine } from '../NarrativeEngine'
import { AIService } from '../AIService'
import { useConfigStore } from '../../store/config'
import { useWorldStore } from '../../store/world'
import { PromptTemplate } from '../PromptTemplate'
import { LoreInjector } from '../LoreInjector'

// Load prompt template
import discoveryPromptRaw from '../prompts/discovery.prompt.md?raw'

const { body: discoveryTemplate } = PromptTemplate.parseFrontMatter(discoveryPromptRaw)

/** Default context token budget when not specified */
const DEFAULT_TOKEN_BUDGET = 8000

function formatCardLabel(c: WorldCard): string {
  return `- [${c.type}] ${(c as any).title || (c as any).name || 'Unknown'} (ID: ${c.id})`
}

export const CardRelevanceSkill: AISkill = {
  id: 'card-relevance',
  name: '卡片相关性检索',
  phase: 'discovery',
  defaultPriority: 10,
  description: '通过 LoreInjector 关键词匹配注入卡片，并调用 AI 识别活跃角色建议。',

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const configStore = useConfigStore()
    const worldStore = useWorldStore()

    ctx.onStatusUpdate?.('Consulting Archives...')

    const allCards = await db.world_cards.toArray()

    // --- LoreInjector: keyword matching + token budget ---
    const loreInjector = new LoreInjector({
      budgetPercent: 0.25,
      indexBudgetPercent: 0.05,
    })

    const tokenBudget = (ctx as any).tokenBudget || DEFAULT_TOKEN_BUDGET
    const injectionResult = await loreInjector.inject(allCards, ctx.history, tokenBudget)

    // Store injection result for downstream skills
    ctx.skillOutputs['lore-injector'] = injectionResult

    // Set neededCardIds from injected cards (CoreNarrativeSkill reads these)
    ctx.neededCardIds = injectionResult.injectedCards.map(ic => ic.card.id)

    // Build promptFragments keyed by injection position
    for (const item of injectionResult.injectedCards) {
      const key = `lore_${item.injectionPosition}_${item.card.id}`
      ctx.promptFragments[key] = formatCardLabel(item.card)
    }

    // --- AI discovery: budget-limited index for active_role_suggestions ---
    const injectedIds = new Set(ctx.neededCardIds)

    // Layered index: always_active → keyword matched → remaining summary
    const alwaysActiveLines = injectionResult.injectedCards
      .filter(ic => ic.activationReason === 'always_active')
      .map(ic => formatCardLabel(ic.card))
    const keywordLines = injectionResult.injectedCards
      .filter(ic => ic.activationReason === 'keyword' || ic.activationReason === 'recursive')
      .map(ic => formatCardLabel(ic.card))
    const remainingCards = allCards.filter(c => !injectedIds.has(c.id))
    const remainingSummary = remainingCards.length > 0
      ? `\n(... and ${remainingCards.length} more cards not shown)`
      : ''

    const worldIndex = [
      alwaysActiveLines.length ? '### Always Active\n' + alwaysActiveLines.join('\n') : '',
      keywordLines.length ? '### Keyword Matched\n' + keywordLines.join('\n') : '',
      remainingSummary
    ].filter(Boolean).join('\n\n')

    // Build snapshot info
    const snapshot = await AIProtocol.getSnapshot(ctx.activeCharacterIds)
    const activeChapterText = snapshot.activeChapter
      ? `${snapshot.activeChapter.title} (ID: ${snapshot.activeChapter.id})`
      : 'None'
    const activeCharactersText = snapshot.activeCharacters
      .map(c => `${c.name} (ID: ${c.id})`)
      .join(', ')
    const historyText = ctx.assembledContext || AIProtocol.formatHistory(ctx.history.slice(-5))

    // Render prompt
    const prompt = PromptTemplate.render(discoveryTemplate, {
      activeChapterText,
      activeCharactersText,
      historyText,
      userPrompt: ctx.userPrompt,
      worldIndex
    })

    // Call AI (non-streaming) for active_role_suggestions
    const aiService = new AIService({
      apiKey: configStore.apiKey,
      baseUrl: configStore.baseUrl,
      model: configStore.model
    })

    const response = await aiService.sendMessage(prompt, () => {}, () => {}, true, configStore.timeout)
    const parsed = NarrativeEngine.parseResponse(response)

    if (parsed) {
      // Merge AI-suggested card IDs with LoreInjector results (avoid duplicates)
      if (parsed.needed_card_ids) {
        for (const id of parsed.needed_card_ids) {
          if (!injectedIds.has(id)) {
            ctx.neededCardIds.push(id)
          }
        }
      }
      if (parsed.active_role_suggestions && parsed.active_role_suggestions.length > 0) {
        ctx.activeRoleSuggestions = parsed.active_role_suggestions
        await worldStore.updateActiveCharacters(parsed.active_role_suggestions, [])
      }
    }

    // --- v0.2.1: Build RetrievalTrace ---
    const allCardIds = new Set(allCards.map(c => c.id))
    const activatedCardIds = ctx.neededCardIds
    const rejectedCardIds = allCards
      .filter(c => !activatedCardIds.includes(c.id))
      .map(c => c.id)

    const reasons: Record<string, string> = {}
    for (const ic of injectionResult.injectedCards) {
      reasons[ic.card.id] = `activated:${ic.activationReason}`
    }
    // Add rejection reasons for skipped cards
    for (const id of rejectedCardIds.slice(0, 20)) {
      const card = allCards.find(c => c.id === id)
      if (card) {
        const hasKeywords = card.activation_keywords && card.activation_keywords.length > 0
        if (!hasKeywords && !card.always_active) {
          reasons[id] = 'no_activation_keywords'
        } else {
          reasons[id] = 'keyword_not_matched'
        }
      }
    }

    const retrievalTrace: RetrievalTrace = {
      activatedCardIds,
      rejectedCardIds,
      reasons,
      totalTokenCost: injectionResult.totalTokens,
      budgetLimit: tokenBudget * 0.25
    }

    // Write trace to ctx
    if (ctx.turnTrace) {
      ctx.turnTrace.retrieval = retrievalTrace
    }
    if (ctx.contextPackage) {
      ctx.contextPackage.retrievalTrace = retrievalTrace
      ctx.contextPackage.activatedCards = injectionResult.injectedCards.map(ic => ic.card)
      ctx.contextPackage.totalTokens += injectionResult.totalTokens
    }

    return {
      success: true,
      data: {
        neededCardIds: ctx.neededCardIds,
        activeRoleSuggestions: ctx.activeRoleSuggestions,
        loreInjection: {
          injectedCount: injectionResult.injectedCards.length,
          totalTokens: injectionResult.totalTokens,
          budgetUsed: injectionResult.budgetUsed,
          skippedCount: injectionResult.skippedCount
        },
        retrievalTrace
      }
    }
  },

  async fallback(_error: Error, ctx: SkillContext): Promise<SkillResult> {
    console.warn('CardRelevanceSkill fallback: proceeding without supplementary cards')
    ctx.neededCardIds = []
    ctx.activeRoleSuggestions = []
    return {
      success: true,
      warnings: ['Discovery phase failed, proceeding without supplementary cards']
    }
  }
}
