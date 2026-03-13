/**
 * SkillRegistry — Central registry for AI Skill modules.
 *
 * Skills are registered at app startup and looked up by the SkillPipeline
 * during each turn's execution. Supports runtime enable/disable and
 * priority override via SkillConfig from the config store.
 */

import type { AISkill, SkillPhase, SkillConfig } from '@shared/Interface'
import { SKILL_PHASE_ORDER } from '@shared/Interface'

class SkillRegistryImpl {
  private skills: Map<string, AISkill> = new Map()
  private configOverrides: Map<string, SkillConfig> = new Map()

  /**
   * Register a skill. Replaces any existing skill with the same id.
   */
  registerSkill(skill: AISkill): void {
    this.skills.set(skill.id, skill)
  }

  /**
   * Unregister a skill by id.
   */
  unregisterSkill(id: string): void {
    this.skills.delete(id)
  }

  /**
   * Get a skill by id.
   */
  getSkill(id: string): AISkill | undefined {
    return this.skills.get(id)
  }

  /**
   * Get all registered skills.
   */
  getAllSkills(): AISkill[] {
    return Array.from(this.skills.values())
  }

  /**
   * Get skills for a specific phase, sorted by effective priority (ascending).
   * Respects config overrides for enabled/priority.
   */
  getSkillsByPhase(phase: SkillPhase): AISkill[] {
    const phaseSkills = Array.from(this.skills.values()).filter(s => {
      if (s.phase !== phase) return false
      const config = this.configOverrides.get(s.id)
      // If config exists and explicitly disabled, skip
      if (config && !config.enabled) return false
      return true
    })

    // Sort by effective priority
    phaseSkills.sort((a, b) => {
      const pa = this.getEffectivePriority(a)
      const pb = this.getEffectivePriority(b)
      return pa - pb
    })

    return phaseSkills
  }

  /**
   * Get the ordered list of phases that have at least one enabled skill.
   */
  getActivePhases(): SkillPhase[] {
    return SKILL_PHASE_ORDER.filter(phase => this.getSkillsByPhase(phase).length > 0)
  }

  /**
   * Apply config overrides (loaded from persistent storage).
   */
  applyConfigs(configs: Record<string, SkillConfig>): void {
    this.configOverrides.clear()
    for (const [id, config] of Object.entries(configs)) {
      this.configOverrides.set(id, config)
    }
  }

  /**
   * Get the effective priority for a skill (config override > default).
   */
  getEffectivePriority(skill: AISkill): number {
    const config = this.configOverrides.get(skill.id)
    return config?.priority ?? skill.defaultPriority
  }

  /**
   * Check if a skill is enabled (config override > default true).
   */
  isEnabled(skillId: string): boolean {
    const config = this.configOverrides.get(skillId)
    if (config) return config.enabled
    return true // enabled by default
  }

  /**
   * Get config override for a skill (or undefined).
   */
  getConfig(skillId: string): SkillConfig | undefined {
    return this.configOverrides.get(skillId)
  }

  /**
   * Clear all registrations. Useful for testing.
   */
  clear(): void {
    this.skills.clear()
    this.configOverrides.clear()
  }
}

/** Singleton instance */
export const SkillRegistry = new SkillRegistryImpl()
