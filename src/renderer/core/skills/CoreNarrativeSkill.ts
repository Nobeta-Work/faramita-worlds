/**
 * CoreNarrativeSkill — Narrative phase skill.
 *
 * Replaces the old AIProtocol.constructNarrativePrompt + streaming logic.
 * Assembles the final prompt from SkillContext fragments, calls AI via streaming,
 * parses the structured AIResponse, and writes it into ctx.aiResponse.
 */

import type { AISkill, SkillContext, SkillResult, CharacterCard, SettingCard, VoiceProfile, AIResponseSequence, AIResponse, AIResponseInteraction, NarrativeTrace } from '@shared/Interface'
import { db } from '../../db/db'
import { AIProtocol } from '../AIProtocol'
import { NarrativeEngine } from '../NarrativeEngine'
import { AIService } from '../AIService'
import { useConfigStore } from '../../store/config'
import { PromptTemplate } from '../PromptTemplate'

// Load prompt template
import narrativePromptRaw from '../prompts/narrative.prompt.md?raw'

const { body: narrativeTemplate } = PromptTemplate.parseFrontMatter(narrativePromptRaw)
const VALID_DIFFICULTIES = new Set(['easy', 'normal', 'hard', 'extreme'])
const MAX_GENERATION_ATTEMPTS = 2

export const CoreNarrativeSkill: AISkill = {
  id: 'core-narrative',
  name: '核心叙事生成',
  phase: 'narrative',
  defaultPriority: 0,
  description: '组装世界上下文与角色信息，调用 AI 生成结构化叙事响应。',

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const configStore = useConfigStore()

    ctx.onStatusUpdate?.('Thinking...')

    const snapshot = await AIProtocol.getSnapshot(ctx.activeCharacterIds)
    const historyText = ctx.assembledContext || AIProtocol.formatHistory(ctx.history)

    // --- Build world context ---
    let worldContext = '## Settings (Global Rules)\n'
    snapshot.settings.forEach(s => {
      worldContext += `- ${s.title} (${s.category}): ${s.content}\n`
    })

    if (snapshot.activeChapter) {
      worldContext += `\n## Current Chapter: ${snapshot.activeChapter.title}\n`
      worldContext += `Objective: ${snapshot.activeChapter.objective}\n`
      worldContext += `Summary: ${snapshot.activeChapter.summary}\n`
      worldContext += `Plot Points:\n`
      snapshot.activeChapter.plot_points.forEach(p => {
        worldContext += `- ${p.title}: ${p.content} (Secret: ${p.secret_notes})\n`
      })
    }

    // --- Build character context ---
    let charContext = '## Active Characters\n'
    snapshot.activeCharacters.forEach(c => {
      charContext += `### ${c.name} (ID: ${c.id})\n`
      charContext += `Race: ${c.race}, Class: ${c.class}, Level: ${c.level}\n`
      charContext += `Traits: ${AIProtocol.formatCharacterTraits(c)}\n`
      const statusText = Array.isArray(c.status) ? c.status.join(', ') : (c.status || 'None')
      charContext += `Status: ${statusText}\n`
      const personalityText = Array.isArray(c.personality) ? c.personality.join(', ') : (c.personality || 'Unknown')
      charContext += `Personality: ${personalityText}\n`
    })

    // --- Build supplementary context ---
    const supplementaryCards = await db.world_cards.bulkGet(ctx.neededCardIds)
    const validSupplements = supplementaryCards.filter(c => c !== undefined)

    let supplementaryContext = '## Referenced Knowledge (Dynamically Retrieved)\n'
    validSupplements.forEach(c => {
      if (!c) return
      supplementaryContext += `### [${c.type}] ${(c as any).title || (c as any).name || 'Unknown'} (ID: ${c.id})\n`
      supplementaryContext += JSON.stringify(c, null, 2) + '\n'
    })

    // --- Collect prompt fragments from upstream skills ---
    const voiceConstraints = ctx.promptFragments['voice_constraints'] || ''
    const conflictWarnings = ctx.promptFragments['conflict_warnings'] || ''

    // --- Render prompt ---
    const basePrompt = PromptTemplate.render(narrativeTemplate, {
      worldContext,
      charContext,
      supplementaryContext,
      voiceConstraints,
      conflictWarnings,
      historyText,
      userPrompt: ctx.userPrompt
    })

    // --- Call AI (streaming, but accumulate full response) ---
    const aiService = new AIService({
      apiKey: configStore.apiKey,
      baseUrl: configStore.baseUrl,
      model: configStore.model
    })

    let fullResponseText = ''
    let response: AIResponse | null = null
    let interactionValidationErrors: string[] = []

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      let promptForAttempt = basePrompt
      if (attempt > 1) {
        const contractErrorsText = interactionValidationErrors.map((item) => `- ${item}`).join('\n')
        promptForAttempt = `${basePrompt}\n\n# Output Repair Notice\nYour previous JSON violated the interaction contract:\n${contractErrorsText}\n\nPlease return ONE corrected JSON object only. Keep the same narrative intent, but ensure interaction fields are valid.`
      }

      fullResponseText = ''
      await aiService.sendMessage(
        promptForAttempt,
        (token) => {
          fullResponseText += token
          ctx.onStreamToken?.(token)
        },
        () => {},
        true,
        configStore.timeout
      )

      const parsed = NarrativeEngine.parseResponse(fullResponseText)
      if (!parsed) {
        interactionValidationErrors = ['Response is not valid JSON.']
        continue
      }

      const normalized = normalizeInteraction(parsed)
      const validation = validateInteractionContract(normalized.interaction)
      if (!validation.valid) {
        interactionValidationErrors = validation.errors
        if (attempt < MAX_GENERATION_ATTEMPTS) continue
        response = disableInvalidInteraction(normalized)
      } else {
        response = normalized
      }
      break
    }

    ctx.rawResponseText = fullResponseText

    if (response) {
      ctx.aiResponse = response

      // v0.2.1: Write narrativeTrace
      const narrativeTrace: NarrativeTrace = {
        rawLength: fullResponseText.length,
        repairCount: interactionValidationErrors.length > 0 ? 1 : 0,
        responseValid: !!response
      }
      if (ctx.turnTrace) {
        ctx.turnTrace.narrative = narrativeTrace
      }

      const voiceWarnings = validateVoiceConsistency(
        response.sequence,
        (ctx.skillOutputs['character-voice-targets'] || []) as Array<{ id: string; name: string; profile: VoiceProfile }>
      )

      // Process world updates
      if (response.world_updates) {
        const preUpdateSnapshots: Record<string, any> = {}
        const targetIds = Array.from(new Set(
          response.world_updates
            .filter(update => update.action === 'UPDATE' && !!update.target_id)
            .map(update => update.target_id as string)
        ))

        for (const targetId of targetIds) {
          const existing = await db.world_cards.get(targetId)
          if (existing) {
            preUpdateSnapshots[targetId] = JSON.parse(JSON.stringify(existing))
          }
        }

        const notifications = await NarrativeEngine.processUpdates(response.world_updates)

        // Process active_role add/delete
        if (response.active_role) {
          await NarrativeEngine.processActiveRoles(response.active_role)
        }

        return {
          success: true,
          warnings: voiceWarnings,
          data: { notifications, response, preUpdateSnapshots }
        }
      }

      // Process active_role even without world_updates
      if (response.active_role) {
        await NarrativeEngine.processActiveRoles(response.active_role)
      }

      const contractWarnings = interactionValidationErrors.length > 0
        ? [`Interaction contract invalid after retry; roll request suppressed: ${interactionValidationErrors.join(' | ')}`]
        : []

      return { success: true, warnings: [...voiceWarnings, ...contractWarnings], data: { response } }
    }

    // Parse failed — create fallback response from raw text
    const fallbackResponse = {
      sequence: [{ type: 'environment' as const, content: fullResponseText }]
    }
    ctx.aiResponse = fallbackResponse

    return {
      success: true,
      warnings: ['AI response JSON parse failed, using raw text as fallback'],
      data: { response: fallbackResponse, parseFailed: true }
    }
  },

  async fallback(error: Error, ctx: SkillContext): Promise<SkillResult> {
    console.error('CoreNarrativeSkill fallback:', error.message)
    // Provide a minimal error response
    ctx.aiResponse = {
      sequence: [{ type: 'environment', content: `[叙事引擎错误] ${error.message}` }]
    }
    return {
      success: false,
      error: error.message,
      warnings: ['Narrative generation failed completely']
    }
  }
}

function normalizeInteraction(response: AIResponse): AIResponse {
  const rawInteraction = response.interaction as any
  if (!rawInteraction) return response

  const normalized: AIResponseInteraction = { ...rawInteraction }
  if (typeof rawInteraction.description === 'string') {
    normalized.description = rawInteraction.description.trim()
  }

  if (typeof rawInteraction.difficulty === 'string') {
    normalized.difficulty = rawInteraction.difficulty.toLowerCase() as any
  }

  if (!normalized.difficulty) {
    normalized.difficulty = 'normal'
  }

  if (Array.isArray(rawInteraction.relevant_tags)) {
    normalized.relevant_tags = rawInteraction.relevant_tags
  }

  return {
    ...response,
    interaction: normalized
  }
}

function validateInteractionContract(interaction: AIResponseInteraction | undefined): { valid: boolean; errors: string[] } {
  if (!interaction || !interaction.needs_roll) {
    return { valid: true, errors: [] }
  }

  const errors: string[] = []
  if (!interaction.description || !interaction.description.trim()) {
    errors.push('interaction.description is required when needs_roll=true')
  }

  if (!interaction.difficulty || !VALID_DIFFICULTIES.has(interaction.difficulty)) {
    errors.push('interaction.difficulty must be one of easy|normal|hard|extreme when needs_roll=true')
  }

  if (!interaction.relevant_tags || interaction.relevant_tags.length === 0) {
    // Non-fatal: judgment will proceed with no tag modifier
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

function disableInvalidInteraction(response: AIResponse): AIResponse {
  if (!response.interaction?.needs_roll) return response
  return {
    ...response,
    interaction: {
      needs_roll: false
    }
  }
}

function validateVoiceConsistency(
  sequence: AIResponseSequence[] | undefined,
  targets: Array<{ id: string; name: string; profile: VoiceProfile }>
): string[] {
  if (!Array.isArray(sequence) || targets.length === 0) return []

  const warnings: string[] = []
  const dialogueBySpeaker = new Map<string, string[]>()

  sequence.forEach((item) => {
    if (item.type !== 'dialogue' || !item.speaker_name) return
    const bucket = dialogueBySpeaker.get(item.speaker_name) || []
    bucket.push(item.content || '')
    dialogueBySpeaker.set(item.speaker_name, bucket)
  })

  for (const target of targets) {
    const lines = dialogueBySpeaker.get(target.name) || []
    if (lines.length === 0) continue

    const allText = lines.join(' ')
    const patternHits = target.profile.speech_patterns.filter((pattern) => pattern && allText.includes(pattern)).length
    const emotionalExpected = target.profile.emotional_range.includes('高')
    const emotionalFound = /[！!？?]/.test(allText)

    if (target.profile.speech_patterns.length > 0 && patternHits === 0) {
      warnings.push(`Voice drift: ${target.name} 未命中常用句式，可能偏离设定声线。`)
    }

    if (emotionalExpected && !emotionalFound) {
      warnings.push(`Voice drift: ${target.name} 情绪表达偏弱，与设定情绪范围不一致。`)
    }
  }

  return warnings
}
