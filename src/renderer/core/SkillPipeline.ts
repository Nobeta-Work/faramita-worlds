/**
 * SkillPipeline — Orchestrates AI Skill execution across phases.
 *
 * For each turn:
 *  1. Creates a fresh SkillContext
 *  2. Iterates through phases in order (context-assembly → discovery → pre-narrative → narrative → post-narrative)
 *  3. Within each phase, runs skills sorted by priority
 *  4. On skill failure, attempts fallback; if fallback fails, skips with warning
 *  5. Returns a PipelineResult with the aggregated output
 */

import type {
  SkillContext,
  SkillResult,
  PipelineResult,
  SkillLogEntry,
  ChronicleEntry,
  AIResponse,
  TurnTrace
} from '@shared/Interface'
import { SKILL_PHASE_ORDER } from '@shared/Interface'
import { SkillRegistry } from './SkillRegistry'
import { Logger } from './Logger'

export class SkillPipeline {
  /**
   * Execute the full pipeline for one turn.
   */
  static async executePipeline(
    userPrompt: string,
    history: ChronicleEntry[],
    activeCharacterIds: string[],
    options?: {
      onStreamToken?: (token: string) => void
      onStatusUpdate?: (status: string) => void
      initialPromptFragments?: Record<string, string>
    }
  ): Promise<PipelineResult> {
    // Initialize turn trace
    const turnTrace: TurnTrace = {
      turn: history.length + 1
    }

    // Initialize context
    const ctx: SkillContext = {
      userPrompt,
      history,
      activeCharacterIds,
      assembledContext: '',
      neededCardIds: [],
      activeRoleSuggestions: [],
      promptFragments: { ...(options?.initialPromptFragments || {}) },
      aiResponse: null,
      rawResponseText: '',
      logs: [],
      warnings: [],
      skillOutputs: {},
      onStreamToken: options?.onStreamToken,
      onStatusUpdate: options?.onStatusUpdate,
      turnTrace,
      reviewDecision: 'commit'
    }

    const errors: string[] = []

    // Execute each phase in order
    for (const phase of SKILL_PHASE_ORDER) {
      const skills = SkillRegistry.getSkillsByPhase(phase)
      if (skills.length === 0) continue

      ctx.onStatusUpdate?.(`Phase: ${phase}`)
      this.log(ctx, 'info', 'pipeline', phase, `Starting phase [${phase}] with ${skills.length} skill(s)`)

      for (const skill of skills) {
        this.log(ctx, 'debug', skill.id, phase, `Executing skill [${skill.id}]`)

        try {
          const result = await skill.execute(ctx)
          this.processResult(ctx, skill.id, result)

          if (!result.success) {
            this.log(ctx, 'warn', skill.id, phase, `Skill [${skill.id}] returned failure: ${result.error}`)
            // Attempt fallback
            await this.runFallback(ctx, skill, new Error(result.error || 'Skill returned failure'))
          }
        } catch (err: any) {
          this.log(ctx, 'error', skill.id, phase, `Skill [${skill.id}] threw: ${err.message}`)
          // Attempt fallback
          const fallbackOk = await this.runFallback(ctx, skill, err)
          if (!fallbackOk) {
            errors.push(`[${skill.id}] ${err.message}`)
          }
        }
      }

      this.log(ctx, 'info', 'pipeline', phase, `Completed phase [${phase}]`)
    }

    // Determine review decision based on risk level and world updates
    if (ctx.turnTrace?.planner?.riskLevel === 'high' ||
        (ctx.aiResponse?.world_updates && ctx.aiResponse.world_updates.length > 5)) {
      ctx.reviewDecision = 'defer-commit'
    }

    return {
      success: errors.length === 0,
      aiResponse: ctx.aiResponse,
      rawResponseText: ctx.rawResponseText,
      logs: ctx.logs,
      warnings: ctx.warnings,
      errors,
      skillOutputs: ctx.skillOutputs,
      turnTrace: ctx.turnTrace
    }
  }

  /**
   * Attempt to run a skill's fallback handler.
   * Returns true if fallback succeeded, false otherwise.
   */
  private static async runFallback(
    ctx: SkillContext,
    skill: { id: string; phase: string; fallback?: (err: Error, ctx: SkillContext) => Promise<SkillResult> },
    error: Error
  ): Promise<boolean> {
    if (!skill.fallback) {
      ctx.warnings.push(`Skill [${skill.id}] failed with no fallback: ${error.message}`)
      return false
    }

    try {
      this.log(ctx, 'info', skill.id, skill.phase as any, `Running fallback for [${skill.id}]`)
      const fallbackResult = await skill.fallback(error, ctx)
      this.processResult(ctx, skill.id, fallbackResult)
      if (fallbackResult.success) {
        this.log(ctx, 'info', skill.id, skill.phase as any, `Fallback for [${skill.id}] succeeded`)
        return true
      } else {
        ctx.warnings.push(`Skill [${skill.id}] fallback returned failure: ${fallbackResult.error}`)
        return false
      }
    } catch (fallbackErr: any) {
      ctx.warnings.push(`Skill [${skill.id}] fallback threw: ${fallbackErr.message}`)
      this.log(ctx, 'error', skill.id, skill.phase as any, `Fallback for [${skill.id}] threw: ${fallbackErr.message}`)
      return false
    }
  }

  /**
   * Process a SkillResult into the shared context.
   */
  private static processResult(ctx: SkillContext, skillId: string, result: SkillResult): void {
    if (result.data) {
      ctx.skillOutputs[skillId] = result.data
    }
    if (result.warnings) {
      ctx.warnings.push(...result.warnings)
    }
  }

  /**
   * Append a log entry to the context.
   */
  private static log(
    ctx: SkillContext,
    level: SkillLogEntry['level'],
    skillId: string,
    phase: SkillLogEntry['phase'],
    message: string,
    data?: any
  ): void {
    const entry: SkillLogEntry = {
      timestamp: Date.now(),
      level,
      skillId,
      phase,
      message,
      data
    }

    ctx.logs.push(entry)
    void Logger.log('SKILL', level, 'PIPELINE', message, {
      skillId,
      phase,
      data
    })
  }
}
