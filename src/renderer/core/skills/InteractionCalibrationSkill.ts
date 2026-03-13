/**
 * InteractionCalibrationSkill — Post-narrative phase skill.
 *
 * Replaces the old `Math.random() < 0.5` hack for ignoring excessive dice rolls.
 * Uses rule-based heuristics to decide whether an AI-requested roll should
 * actually trigger the dice UI:
 *
 *  - Consecutive roll suppression: if 2+ rolls in the last N turns, reduce probability
 *  - Low-DC auto-pass: non-tense scenes with DC ≤ 12 auto-succeed
 *  - Tension detection: combat/escape keywords keep rolls enabled
 */

import type { AISkill, SkillContext, SkillResult, ChronicleEntry } from '@shared/Interface'

/** Keywords that indicate a tense scene where rolls should be preserved */
const TENSION_KEYWORDS = [
  '战斗', '攻击', '逃跑', 'combat', 'attack', 'escape', 'flee',
  '陷阱', 'trap', '危险', 'danger', '死亡', 'death', '抢夺',
  '强行', 'force', '决斗', 'duel'
]

export const InteractionCalibrationSkill: AISkill = {
  id: 'interaction-calibration',
  name: '投掷频率校准',
  phase: 'post-narrative',
  defaultPriority: 20,
  description: '根据场景紧张度和最近投掷频率，智能调节是否触发骰子投掷请求。',

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const response = ctx.aiResponse
    if (!response?.interaction?.needs_roll) {
      return { success: true }
    }

    const interaction = response.interaction

    // 1. Count recent rolls in history (last 10 turns)
    const recentHistory = ctx.history.slice(-10)
    const recentRollCount = recentHistory.filter(
      e => e.role === 'system' && e.content.includes('[DICE]')
    ).length

    // 2. Detect scene tension from user input + recent history
    const contextText = [
      ctx.userPrompt,
      ...recentHistory.slice(-3).map(e => e.content)
    ].join(' ').toLowerCase()

    const isTenseScene = TENSION_KEYWORDS.some(kw => contextText.includes(kw))

    // 3. Apply rules
    const difficulty = interaction.difficulty || 'normal'

    // Rule A: easy difficulty + high tag modifier → auto-pass
    if (!isTenseScene && difficulty === 'easy') {
      const tagSum = (interaction.relevant_tags || [])
        .reduce((sum, t) => sum + (t.positive ? t.weight : -t.weight), 0)
      if (tagSum >= 2) {
        interaction.needs_roll = false
        return {
          success: true,
          warnings: [`Auto-passed easy difficulty roll with high tag modifier (+${tagSum}) in non-tense scene`],
          data: { suppressed: true, reason: 'easy-high-tags' }
        }
      }
    }

    // Rule B: Too many consecutive rolls → suppress with decreasing probability
    if (recentRollCount >= 2) {
      const suppressProbability = Math.min(0.8, 0.3 * recentRollCount)
      if (Math.random() < suppressProbability) {
        interaction.needs_roll = false
        return {
          success: true,
          warnings: [`Suppressed roll due to high frequency (${recentRollCount} recent rolls)`],
          data: { suppressed: true, reason: 'frequency-cap' }
        }
      }
    }

    // Otherwise, keep the roll
    return {
      success: true,
      data: { suppressed: false, reason: 'allowed' }
    }
  }
}
