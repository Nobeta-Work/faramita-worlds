import { db } from '../db/db'
import { CharacterCard, ChapterCard, SettingCard, ChronicleEntry } from '@shared/Interface'

export interface WorldSnapshot {
  activeChapter: ChapterCard | null
  activeCharacters: CharacterCard[]
  inactiveCharacters: { id: string; name: string }[]
  settings: SettingCard[]
}

/** Per-skill AI call configuration override */
export interface SkillAIConfig {
  model?: string
  temperature?: number
  max_tokens?: number
  response_format?: 'json' | 'text'
}

/** Default lightweight configs for planning/review skills */
const SKILL_AI_DEFAULTS: Record<string, SkillAIConfig> = {
  'turn-planning': { max_tokens: 512, temperature: 0.3, response_format: 'json' },
  'response-review': { max_tokens: 512, temperature: 0.2, response_format: 'json' },
  'retrieval-review': { max_tokens: 256, temperature: 0.2, response_format: 'text' },
  'directive-compiler': { max_tokens: 256, temperature: 0.1, response_format: 'text' },
}

export class AIProtocol {
  static estimateTokens(text: string): number {
    return Math.ceil((text || '').length / 2)
  }

  static formatCharacterTraits(char: CharacterCard): string {
    if (!char.traits?.length) return '无特质标签'
    const typeSymbol: Record<string, string> = { strength: '✦', flaw: '✧', bond: '♦', mark: '★' }
    return char.traits
      .filter(t => t.active)
      .map(t => `${typeSymbol[t.type] || '●'} ${t.text} (weight:${t.weight}, ${t.source})`)
      .join('\n  ')
  }

  /**
   * Retrieves the current world snapshot based on filtering rules.
   */
  static async getSnapshot(activeCharIds: string[]): Promise<WorldSnapshot> {
    const allCards = await db.world_cards.toArray()
    
    // 1. Active Chapter
    const activeChapter = allCards.find(c => c.type === 'chapter' && (c as ChapterCard).status === 'active') as ChapterCard | null
    
    // 2. Characters
    const characters = allCards.filter(c => c.type === 'character') as CharacterCard[]
    const activeCharacters = characters.filter(c => activeCharIds.includes(c.id))
    const inactiveCharacters = characters
      .filter(c => !activeCharIds.includes(c.id))
      .map(c => ({ id: c.id, name: c.name }))

    // 3. Settings (Global Context)
    // Send all visible settings or filter? Usually settings are static context.
    // For now, send all public/player visible settings to ensure context.
    const settings = allCards.filter(c => 
      c.type === 'setting' && (c.visible?.public_visible || c.visible?.player_visible)
    ) as SettingCard[]

    return {
      activeChapter: activeChapter || null,
      activeCharacters,
      inactiveCharacters,
      settings
    }
  }

  /**
   * Formats the history into a token-efficient string.
   */
  /**
   * 格式化历史，支持分层记忆输出与 token 估算
   * @param history 原始历史
   * @param options 可选：{ layer: 'short-term' | 'long-term' | 'world-snapshot', tokenBudget?: number, windowSize?: number, summaries?: string[] }
   */
  static formatHistory(
    history: ChronicleEntry[],
    options?: {
      layer?: 'short-term' | 'long-term' | 'world-snapshot',
      tokenBudget?: number,
      windowSize?: number,
      summaries?: string[]
    }
  ): string {
    const layer = options?.layer || 'short-term'
    const tokenBudget = options?.tokenBudget || 6000
    if (layer === 'short-term') {
      // 保留完整 sequence 结构，窗口大小可配置
      const window = options?.windowSize || 8
      const entries = history.slice(-window)
      let text = entries.map(entry => {
        let content = entry.content
        if (entry.role === 'assistant') {
          try {
            const json = JSON.parse(content)
            if (json.sequence && Array.isArray(json.sequence)) {
              content = json.sequence
                .map((s: any) => {
                  if (s.type === 'dialogue') return `${s.speaker_name}: ${s.content}`
                  return `(Environment: ${s.content})`
                })
                .join('\n')
            }
          } catch (e) {}
        }
        return `[${entry.role.toUpperCase()}]: ${content}`
      }).join('\n')
      // 超过 tokenBudget 时缩减窗口
      while (this.estimateTokens(text) > tokenBudget && entries.length > 2) {
        entries.shift()
        text = entries.map(entry => `[${entry.role.toUpperCase()}]: ${entry.content}`).join('\n')
      }
      return text
    }
    if (layer === 'long-term') {
      // 只输出摘要文本
      const summaries = options?.summaries || []
      let text = summaries.join('\n')
      // 超过 tokenBudget 时压缩摘要
      while (this.estimateTokens(text) > tokenBudget && summaries.length > 1) {
        summaries.shift()
        text = summaries.join('\n')
      }
      return text
    }
    if (layer === 'world-snapshot') {
      // 输出关键字段摘要
      return options?.summaries?.join('\n') || ''
    }
    // 默认：原始历史
    return history.map(entry => `[${entry.role.toUpperCase()}]: ${entry.content}`).join('\n')
  }

  /**
   * Get per-skill AI config: merges built-in defaults with user overrides.
   */
  static getSkillAIConfig(skillId: string, userOverrides?: Partial<SkillAIConfig>): SkillAIConfig {
    const defaults = SKILL_AI_DEFAULTS[skillId] || {}
    return { ...defaults, ...userOverrides }
  }

}
