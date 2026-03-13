/**
 * ResponseReviewSkill — Post-narrative phase skill (after ConflictDetection).
 *
 * Evaluates commit safety for high-risk turns.
 * Only activates when riskLevel === 'high'.
 * Enriches ctx.turnTrace.review with additional safety assessment.
 */

import type {
  AISkill,
  SkillContext,
  SkillResult,
  ReviewTrace,
  AIResponseWorldUpdate
} from '@shared/Interface'

export const ResponseReviewSkill: AISkill = {
  id: 'response-review',
  name: '响应审查',
  phase: 'post-narrative',
  defaultPriority: 15,
  description: '高风险轮次的额外安全评估，确定是否需要延迟提交。',

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const planner = ctx.turnTrace?.planner
    const riskLevel = planner?.riskLevel || 'low'

    // Only run for high-risk turns
    if (riskLevel !== 'high') {
      return {
        success: true,
        data: { skipped: true, reason: 'not_high_risk' }
      }
    }

    const existingReview = ctx.turnTrace?.review
    const worldUpdates = (ctx.aiResponse?.world_updates || []) as AIResponseWorldUpdate[]

    const additionalConflicts: string[] = []
    const additionalWarnings: string[] = []

    // Check world updates for dangerous patterns
    for (const update of worldUpdates) {
      const data = update.data || {}

      // Character death/removal through status changes
      if (update.type === 'character' && data.status) {
        const statusText = Array.isArray(data.status) ? data.status.join(' ') : String(data.status)
        if (/(死亡|阵亡|dead|deceased|killed|removed)/i.test(statusText)) {
          additionalConflicts.push(
            `High-risk: character ${update.target_id || 'unknown'} status change to "${statusText}"`
          )
        }
      }

      // Level drastic changes
      if (update.type === 'character' && typeof data.level === 'number') {
        if (data.level > 20 || data.level < 1) {
          additionalWarnings.push(
            `Unusual level value (${data.level}) for card ${update.target_id || 'unknown'}`
          )
        }
      }

      // Attribute changes beyond threshold
      if (update.type === 'character' && data.attributes) {
        for (const [attr, val] of Object.entries(data.attributes)) {
          if (typeof val === 'number' && (val <= 0 || val > 30)) {
            additionalWarnings.push(
              `Attribute ${attr} out of range: ${val} for card ${update.target_id || 'unknown'}`
            )
          }
        }
      }
    }

    // Large number of world updates is suspicious
    if (worldUpdates.length > 5) {
      additionalWarnings.push(
        `Unusually high number of world updates: ${worldUpdates.length}`
      )
    }

    // Merge with existing review
    const mergedConflicts = [
      ...(existingReview?.conflicts || []),
      ...additionalConflicts
    ]
    const mergedWarnings = [
      ...(existingReview?.warnings || []),
      ...additionalWarnings
    ]
    const commitSafe = mergedConflicts.length === 0

    const reviewTrace: ReviewTrace = {
      conflicts: mergedConflicts,
      warnings: mergedWarnings,
      commitSafe
    }

    // Update turnTrace
    if (ctx.turnTrace) {
      ctx.turnTrace.review = reviewTrace
    }

    // Set reviewDecision on context
    if (!commitSafe) {
      ctx.reviewDecision = 'defer-commit'
    }

    return {
      success: true,
      data: {
        reviewTrace,
        deferCommit: !commitSafe,
        additionalConflicts,
        additionalWarnings
      }
    }
  },

  async fallback(_error: Error, _ctx: SkillContext): Promise<SkillResult> {
    return {
      success: true,
      warnings: ['ResponseReviewSkill fallback: skipping high-risk review']
    }
  }
}
