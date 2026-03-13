/**
 * RetrievalReviewSkill — Discovery phase skill (after CardRelevanceSkill).
 *
 * Enriches ctx.turnTrace.retrieval with human-readable explanations,
 * produces a short diagnostic summary for debugging/observability.
 */

import type { AISkill, SkillContext, SkillResult, RetrievalTrace } from '@shared/Interface'
import { db } from '../../db/db'

export const RetrievalReviewSkill: AISkill = {
  id: 'retrieval-review',
  name: '检索审查',
  phase: 'discovery',
  defaultPriority: 15,
  description: '审查卡片检索结果，补充可读说明和诊断信息。',

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const retrieval = ctx.turnTrace?.retrieval
    if (!retrieval) {
      return {
        success: true,
        warnings: ['No retrieval trace found — skipping review'],
        data: { skipped: true }
      }
    }

    // Load cards to generate readable names
    const allCards = await db.world_cards.toArray()
    const cardMap = new Map(allCards.map(c => [c.id, c]))

    // Enrich reasons with readable card names
    const enrichedReasons: Record<string, string> = {}
    for (const [id, reason] of Object.entries(retrieval.reasons)) {
      const card = cardMap.get(id)
      const label = card
        ? `${(card as any).title || (card as any).name || 'Unknown'} [${card.type}]`
        : id
      enrichedReasons[id] = `${label}: ${reason}`
    }

    // Build diagnostic summary
    const budgetUsagePercent = retrieval.budgetLimit > 0
      ? Math.round((retrieval.totalTokenCost / retrieval.budgetLimit) * 100)
      : 0

    const diagnostics = {
      activatedCount: retrieval.activatedCardIds.length,
      rejectedCount: retrieval.rejectedCardIds.length,
      budgetUsagePercent,
      overBudget: retrieval.totalTokenCost > retrieval.budgetLimit,
      topReasons: summarizeReasons(retrieval)
    }

    return {
      success: true,
      data: {
        enrichedReasons,
        diagnostics
      }
    }
  },

  async fallback(_error: Error, _ctx: SkillContext): Promise<SkillResult> {
    return {
      success: true,
      warnings: ['RetrievalReviewSkill fallback: skipping review']
    }
  }
}

/**
 * Count occurrences of each rejection reason pattern.
 */
function summarizeReasons(trace: RetrievalTrace): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const reason of Object.values(trace.reasons)) {
    // Extract reason category (e.g. 'keyword_not_matched', 'activated:keyword')
    const category = reason.includes(':') ? reason.split(':').pop()! : reason
    counts[category] = (counts[category] || 0) + 1
  }
  return counts
}
