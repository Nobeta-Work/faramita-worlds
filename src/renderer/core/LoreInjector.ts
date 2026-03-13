/**
 * LoreInjector — 动态知识注入引擎
 *
 * 关键词匹配 → 递归激活 → token 预算控制 → 分层注入
 */

import type { WorldCard, ChronicleEntry, RuntimeLoreMeta } from '@shared/Interface'

export interface LoreInjectionConfig {
  budgetPercent: number      // context 占比（默认 0.25）
  scanDepth: number          // 扫描最近 N 轮（默认 5）
  maxRecursionDepth: number  // 最大递归层数（默认 2）
  indexBudgetPercent: number // discovery 索引占比（默认 0.05）
}

export interface InjectedCard {
  card: WorldCard
  activationReason: 'always_active' | 'keyword' | 'regex' | 'recursive' | 'condition'
  injectionPosition: 'system' | 'before_chat' | 'mid_chat' | 'near_last'
  tokenCost: number
}

export interface RejectedCard {
  card: WorldCard
  reason: string
}

export interface LoreInjectionResult {
  injectedCards: InjectedCard[]
  rejectedCards: RejectedCard[]
  totalTokens: number
  budgetUsed: number       // 百分比
  skippedCount: number     // 超预算跳过的卡片数
}

interface TimedEffectState {
  cardId: string
  stickyRemaining?: number   // 剩余 sticky 轮数
  cooldownRemaining?: number // 剩余 cooldown 轮数
}

const DEFAULT_CONFIG: LoreInjectionConfig = {
  budgetPercent: 0.25,
  scanDepth: 5,
  maxRecursionDepth: 2,
  indexBudgetPercent: 0.05
}

export class LoreInjector {
  private config: LoreInjectionConfig
  private timedStates: Map<string, TimedEffectState> = new Map()

  constructor(config?: Partial<LoreInjectionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  async inject(
    allCards: WorldCard[],
    recentHistory: ChronicleEntry[],
    maxContextTokens: number
  ): Promise<LoreInjectionResult> {
    const budget = maxContextTokens * this.config.budgetPercent
    const result: InjectedCard[] = []
    const rejectedCards: RejectedCard[] = []
    let usedTokens = 0
    let skippedCount = 0

    // Resolve activation mode for each card (runtime_lore takes precedence over legacy fields)
    const getMode = (c: WorldCard): string => c.runtime_lore?.activation?.mode || (c.always_active ? 'always' : 'keyword')

    // 1. 收集 always_active 卡片 (mode = 'always' or legacy always_active)
    const alwaysActive = allCards.filter(c => getMode(c) === 'always' && !this.isCoolingDown(c.id))
    for (const card of alwaysActive) {
      const cost = this.estimateCardTokens(card)
      if (usedTokens + cost <= budget) {
        result.push({
          card,
          activationReason: 'always_active',
          injectionPosition: this.getPosition(card),
          tokenCost: cost
        })
        usedTokens += cost
      } else {
        skippedCount++
        rejectedCards.push({ card, reason: 'budget_exceeded' })
      }
    }

    // 2. 从最近 N 轮提取文本，匹配关键词 + regex
    const scanDepth = this.config.scanDepth
    const recentSlice = recentHistory.slice(-scanDepth)
    const scanText = this.extractScanText(recentSlice)

    // Separate cards by activation type
    const keywordCandidates = allCards.filter(c => {
      const mode = getMode(c)
      return (mode === 'keyword' || mode === 'hybrid') && !this.isCoolingDown(c.id)
    })

    // Match keywords (using runtime_lore.activation.keys or legacy activation_keywords)
    const keywordMatched = this.matchKeywordsV2(keywordCandidates, scanText)
      .sort((a, b) => this.getOrder(b) - this.getOrder(a))

    // Match regex patterns from runtime_lore.activation.regex_keys
    const regexMatched = this.matchRegex(allCards, scanText)
      .filter(c => !this.isCoolingDown(c.id))
      .sort((a, b) => this.getOrder(b) - this.getOrder(a))

    // Track rejected cards that had keywords but didn't match
    const keywordCandidateIds = new Set(keywordCandidates.map(c => c.id))
    const matchedIds = new Set([...keywordMatched.map(c => c.id), ...regexMatched.map(c => c.id)])
    for (const card of keywordCandidates) {
      if (!matchedIds.has(card.id) && !result.some(r => r.card.id === card.id)) {
        rejectedCards.push({ card, reason: 'keyword_not_matched' })
      }
    }

    // Cards with no activation keywords at all
    const noKeywordCards = allCards.filter(c => {
      const mode = getMode(c)
      return mode === 'keyword' && !keywordCandidateIds.has(c.id) && !c.activation_keywords?.length &&
        !c.runtime_lore?.activation?.keys?.length
    })
    for (const card of noKeywordCards) {
      if (!result.some(r => r.card.id === card.id)) {
        rejectedCards.push({ card, reason: 'no_activation_keywords' })
      }
    }

    // 3. 一级注入 — keyword matches
    for (const card of keywordMatched) {
      if (usedTokens >= budget) { skippedCount++; rejectedCards.push({ card, reason: 'budget_exceeded' }); continue }
      if (result.some(r => r.card.id === card.id)) continue
      const cost = this.estimateCardTokens(card)
      if (usedTokens + cost <= budget) {
        result.push({
          card,
          activationReason: 'keyword',
          injectionPosition: this.getPosition(card),
          tokenCost: cost
        })
        usedTokens += cost
      } else {
        skippedCount++
        rejectedCards.push({ card, reason: 'budget_exceeded' })
      }
    }

    // 3b. 一级注入 — regex matches
    for (const card of regexMatched) {
      if (usedTokens >= budget) { skippedCount++; rejectedCards.push({ card, reason: 'budget_exceeded' }); continue }
      if (result.some(r => r.card.id === card.id)) continue
      const cost = this.estimateCardTokens(card)
      if (usedTokens + cost <= budget) {
        result.push({
          card,
          activationReason: 'regex',
          injectionPosition: this.getPosition(card),
          tokenCost: cost
        })
        usedTokens += cost
      } else {
        skippedCount++
        rejectedCards.push({ card, reason: 'budget_exceeded' })
      }
    }

    // 4. 二级递归扫描（深度限制）
    if (this.config.maxRecursionDepth > 0) {
      const level1Content = result.map(r => this.getCardText(r.card)).join(' ')
      const recursiveMatched = this.matchKeywordsV2(allCards.filter(c => getMode(c) !== 'always'), level1Content)
        .filter(c => !result.some(r => r.card.id === c.id) && !this.isCoolingDown(c.id))
        .sort((a, b) => this.getOrder(b) - this.getOrder(a))

      for (const card of recursiveMatched) {
        if (usedTokens >= budget) break
        const cost = this.estimateCardTokens(card)
        if (usedTokens + cost <= budget) {
          result.push({
            card,
            activationReason: 'recursive',
            injectionPosition: this.getPosition(card),
            tokenCost: cost
          })
          usedTokens += cost
        }
      }
    }

    // 5. Apply grouping — mutual exclusion within inclusion_groups
    this.applyGroupExclusion(result, rejectedCards)

    // 6. 更新 Timed Effects 状态
    this.updateTimedEffects(result)

    return {
      injectedCards: result,
      rejectedCards,
      totalTokens: usedTokens,
      budgetUsed: budget > 0 ? usedTokens / budget : 0,
      skippedCount
    }
  }

  private getPosition(card: WorldCard): InjectedCard['injectionPosition'] {
    // Use runtime_lore.insertion.position if available
    const pos = card.runtime_lore?.insertion?.position
    if (pos) {
      switch (pos) {
        case 'system-prelude': return 'system'
        case 'character-context': return 'before_chat'
        case 'chapter-context': return 'mid_chat'
        case 'world-context': return 'near_last'
        case 'author-note': return 'near_last'
        case 'depth': return 'mid_chat'
        default: return 'before_chat'
      }
    }
    // Fallback to type-based defaults
    switch (card.type) {
      case 'setting': return 'system'
      case 'character': return 'before_chat'
      case 'chapter': return 'mid_chat'
      case 'interaction': return 'near_last'
      default: return 'before_chat'
    }
  }

  /**
   * Get sorting order from runtime_lore or legacy activation_priority.
   */
  private getOrder(card: WorldCard): number {
    return card.runtime_lore?.insertion?.order ?? card.activation_priority ?? 0
  }

  /**
   * V2 keyword matching: uses runtime_lore.activation.keys first, falls back to legacy activation_keywords.
   * Supports case_sensitive and match_whole_word options from runtime_lore.
   */
  private matchKeywordsV2(cards: WorldCard[], text: string): WorldCard[] {
    if (!text) return []
    return cards.filter(card => {
      const activation = card.runtime_lore?.activation
      const keywords = activation?.keys ?? card.activation_keywords
      if (!keywords || keywords.length === 0) return false

      const caseSensitive = activation?.case_sensitive ?? false
      const wholeWord = activation?.match_whole_word ?? false
      const searchText = caseSensitive ? text : text.toLowerCase()

      return keywords.some(kw => {
        const keyword = caseSensitive ? kw : kw.toLowerCase()
        if (wholeWord) {
          const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, caseSensitive ? '' : 'i')
          return regex.test(text)
        }
        return searchText.includes(keyword)
      })
    })
  }

  /**
   * Match regex patterns from runtime_lore.activation.regex_keys.
   */
  private matchRegex(cards: WorldCard[], text: string): WorldCard[] {
    if (!text) return []
    return cards.filter(card => {
      const regexKeys = card.runtime_lore?.activation?.regex_keys
      if (!regexKeys || regexKeys.length === 0) return false
      const caseSensitive = card.runtime_lore?.activation?.case_sensitive ?? false
      return regexKeys.some(pattern => {
        try {
          const regex = new RegExp(pattern, caseSensitive ? '' : 'i')
          return regex.test(text)
        } catch {
          return false
        }
      })
    })
  }

  /**
   * Apply group mutual exclusion: within each inclusion_group, only keep the highest-priority card.
   */
  private applyGroupExclusion(injected: InjectedCard[], rejected: RejectedCard[]): void {
    const groupMap = new Map<string, InjectedCard[]>()
    for (const ic of injected) {
      const groups = ic.card.runtime_lore?.grouping?.inclusion_groups
      if (!groups?.length) continue
      for (const group of groups) {
        if (!groupMap.has(group)) groupMap.set(group, [])
        groupMap.get(group)!.push(ic)
      }
    }

    const idsToRemove = new Set<string>()
    for (const [, members] of groupMap) {
      if (members.length <= 1) continue
      // Sort by group_weight desc, keep the first
      members.sort((a, b) => {
        const wa = a.card.runtime_lore?.grouping?.group_weight ?? 0
        const wb = b.card.runtime_lore?.grouping?.group_weight ?? 0
        return wb - wa
      })
      for (let i = 1; i < members.length; i++) {
        idsToRemove.add(members[i].card.id)
        rejected.push({ card: members[i].card, reason: 'group_exclusion' })
      }
    }

    // Remove excluded cards from injected array
    for (let i = injected.length - 1; i >= 0; i--) {
      if (idsToRemove.has(injected[i].card.id)) {
        injected.splice(i, 1)
      }
    }
  }

  /**
   * 从历史记录中提取纯文本用于关键词扫描。
   */
  private extractScanText(history: ChronicleEntry[]): string {
    return history
      .map(entry => {
        if (typeof entry.content === 'string') {
          // 尝试解析 JSON 格式的 content（AI 响应可能包含 sequence）
          try {
            const parsed = JSON.parse(entry.content)
            if (parsed?.sequence) {
              return parsed.sequence.map((s: any) => s.content || '').join(' ')
            }
            return entry.content
          } catch {
            return entry.content
          }
        }
        return ''
      })
      .join(' ')
  }

  /**
   * 粗略估算卡片 token 数（~4 字符 ≈ 1 token）。
   */
  private estimateCardTokens(card: WorldCard): number {
    const text = this.getCardText(card)
    return Math.ceil(text.length / 4)
  }

  /**
   * 提取卡片的主要文本内容。
   */
  private getCardText(card: WorldCard): string {
    const parts: string[] = []

    switch (card.type) {
      case 'setting':
        if (card.title) parts.push(card.title)
        if (card.content) parts.push(card.content)
        if (card.tags?.length) parts.push(card.tags.join(', '))
        break
      case 'character':
        parts.push(card.name)
        if (card.background?.length) parts.push(card.background.join(' '))
        if (card.personality?.length) parts.push(card.personality.join(' '))
        if (card.tags?.length) parts.push(card.tags.join(', '))
        break
      case 'chapter':
        parts.push(card.title)
        if (card.summary) parts.push(card.summary)
        parts.push(card.objective)
        if (card.plot_points?.length) {
          parts.push(card.plot_points.map(p => `${p.title} ${p.content}`).join(' '))
        }
        break
      case 'interaction':
        parts.push(card.name)
        parts.push(card.description)
        break
      case 'custom':
        parts.push(card.title)
        parts.push(card.content)
        break
    }

    return parts.join(' ')
  }

  /**
   * 更新 Timed Effects 状态：
   * - 被注入的 sticky 卡片重置倒计时
   * - 未被注入的 sticky 卡片减少剩余轮数
   * - cooldown 卡片减少剩余轮数
   */
  private updateTimedEffects(injectedCards: InjectedCard[]): void {
    const injectedIds = new Set(injectedCards.map(ic => ic.card.id))

    // 更新已有的 timed states
    for (const [cardId, state] of this.timedStates) {
      if (injectedIds.has(cardId)) {
        const card = injectedCards.find(ic => ic.card.id === cardId)?.card
        const timedEffect = card?.runtime_lore?.timed_effect ?? card?.timed_effect
        if (timedEffect?.sticky) {
          state.stickyRemaining = timedEffect.sticky
        }
      } else {
        if (state.stickyRemaining !== undefined && state.stickyRemaining > 0) {
          state.stickyRemaining--
        }
        if (state.cooldownRemaining !== undefined && state.cooldownRemaining > 0) {
          state.cooldownRemaining--
        }
      }

      if (
        (state.stickyRemaining === undefined || state.stickyRemaining <= 0) &&
        (state.cooldownRemaining === undefined || state.cooldownRemaining <= 0)
      ) {
        this.timedStates.delete(cardId)
      }
    }

    // 为新激活的带 timed_effect 的卡片创建状态
    for (const ic of injectedCards) {
      const card = ic.card
      const timedEffect = card.runtime_lore?.timed_effect ?? card.timed_effect
      if (!timedEffect) continue
      if (!this.timedStates.has(card.id)) {
        this.timedStates.set(card.id, {
          cardId: card.id,
          stickyRemaining: timedEffect.sticky,
          cooldownRemaining: undefined
        })
      }
    }
  }

  /**
   * 检查卡片是否处于冷却期。
   * sticky 卡片在剩余轮数 > 0 时仍被视为"活跃"而非冷却，
   * 只有 cooldown 才会阻止激活。
   */
  private isCoolingDown(cardId: string): boolean {
    const state = this.timedStates.get(cardId)
    if (!state) return false
    return (state.cooldownRemaining ?? 0) > 0
  }
}
