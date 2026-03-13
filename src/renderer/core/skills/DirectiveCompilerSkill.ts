/**
 * DirectiveCompilerSkill — Pre-narrative phase skill.
 *
 * Compiles PromptDirectivePack from various context sources:
 * - World/chapter/character constraints
 * - Scene mode rules (from TurnPlanningSkill)
 * - Conflict warnings (from prior turns)
 * - Banned narrative moves
 *
 * Pure template assembly — no AI calls needed.
 */

import type {
  AISkill,
  SkillContext,
  SkillResult,
  PromptDirectivePack,
  CharacterCard,
  ChapterCard
} from '@shared/Interface'
import { db } from '../../db/db'

export const DirectiveCompilerSkill: AISkill = {
  id: 'directive-compiler',
  name: '指令编译',
  phase: 'pre-narrative',
  defaultPriority: 5,
  description: '从世界观、章节、角色和场景模式中编译叙事指令包。',

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const voiceConstraints: string[] = []
    const conflictWarnings: string[] = []
    const sceneRules: string[] = []
    const bannedMoves: string[] = []

    // 1. Gather character voice constraints
    const allCards = await db.world_cards.toArray()
    const activeCharacters = allCards.filter(
      (c): c is CharacterCard =>
        c.type === 'character' && ctx.activeCharacterIds.includes(c.id)
    )

    for (const char of activeCharacters) {
      if (char.personality) {
        voiceConstraints.push(
          `${char.name}: personality="${Array.isArray(char.personality) ? char.personality.join(', ') : char.personality}"`
        )
      }
      if (char.voice_profile) {
        voiceConstraints.push(
          `${char.name}: tone="${char.voice_profile.tone}", vocabulary="${char.voice_profile.vocabulary_level}"`
        )
      }
    }

    // 2. Gather chapter scene rules
    const chapters = allCards.filter(
      (c): c is ChapterCard => c.type === 'chapter'
    )
    const activeChapter = chapters.find(ch => ctx.activeCharacterIds.includes(ch.id))
      || chapters.find(ch => ch.status === 'active')
      || chapters[0]

    if (activeChapter) {
      if (activeChapter.objective) {
        sceneRules.push(`Chapter objective: ${activeChapter.objective}`)
      }
      if (activeChapter.risk_level) {
        sceneRules.push(`Chapter risk level: ${activeChapter.risk_level}`)
      }
    }

    // 3. Scene mode rules from TurnPlanningSkill
    const sceneMode = ctx.turnTrace?.planner?.sceneMode || 'normal'
    switch (sceneMode) {
      case 'conflict':
        sceneRules.push('Combat scene: describe actions with tactical detail')
        sceneRules.push('Include hit/miss/damage outcomes when applicable')
        bannedMoves.push('Do not auto-resolve combat in a single turn')
        break
      case 'exploration':
        sceneRules.push('Exploration scene: emphasize environmental description')
        sceneRules.push('Include sensory details and potential points of interest')
        break
      case 'social':
        sceneRules.push('Social scene: focus on dialogue and character interaction')
        sceneRules.push('Reflect NPC personality and relationship dynamics')
        break
      default:
        break
    }

    // 4. Risk-level constraints
    const riskLevel = ctx.turnTrace?.planner?.riskLevel || 'low'
    if (riskLevel === 'high') {
      bannedMoves.push('Do not kill or permanently remove characters without explicit player intent')
      conflictWarnings.push('High risk turn — extra scrutiny on world state changes')
    }

    // 5. Carry forward conflict warnings from prior review
    if (ctx.turnTrace?.review) {
      conflictWarnings.push(...ctx.turnTrace.review.conflicts)
      conflictWarnings.push(...ctx.turnTrace.review.warnings)
    }

    const directives: PromptDirectivePack = {
      voiceConstraints,
      conflictWarnings,
      sceneRules,
      bannedMoves
    }

    // Write to turnTrace
    if (ctx.turnTrace) {
      ctx.turnTrace.directives = directives
    }

    // Also store as prompt fragment for CoreNarrativeSkill to pick up
    if (sceneRules.length > 0 || bannedMoves.length > 0 || voiceConstraints.length > 0) {
      const directiveBlock = buildDirectiveBlock(directives)
      ctx.promptFragments['directives'] = directiveBlock
    }

    return {
      success: true,
      data: { directives }
    }
  },

  async fallback(_error: Error, _ctx: SkillContext): Promise<SkillResult> {
    const empty: PromptDirectivePack = {
      voiceConstraints: [],
      conflictWarnings: [],
      sceneRules: [],
      bannedMoves: []
    }
    return {
      success: true,
      warnings: ['DirectiveCompilerSkill fallback: using empty directives'],
      data: { directives: empty }
    }
  }
}

/**
 * Format directives as a readable text block for prompt injection.
 */
function buildDirectiveBlock(pack: PromptDirectivePack): string {
  const sections: string[] = []

  if (pack.voiceConstraints.length > 0) {
    sections.push('### Voice Constraints\n' + pack.voiceConstraints.map(v => `- ${v}`).join('\n'))
  }
  if (pack.sceneRules.length > 0) {
    sections.push('### Scene Rules\n' + pack.sceneRules.map(r => `- ${r}`).join('\n'))
  }
  if (pack.bannedMoves.length > 0) {
    sections.push('### Banned Moves\n' + pack.bannedMoves.map(b => `- ❌ ${b}`).join('\n'))
  }
  if (pack.conflictWarnings.length > 0) {
    sections.push('### Conflict Warnings\n' + pack.conflictWarnings.map(w => `- ⚠ ${w}`).join('\n'))
  }

  return sections.join('\n\n')
}
