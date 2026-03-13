import type { AISkill, SkillContext, SkillResult, TurnPlan } from '@shared/Interface'

/**
 * TurnPlanningSkill
 * phase: context-assembly (priority 5, after MemoryManager)
 * 分析用户输入，判断本轮意图、场景模式和风险等级
 */
export const TurnPlanningSkill: AISkill = {
  id: 'turn-planning',
  name: '轮次规划',
  phase: 'context-assembly',
  defaultPriority: 5,
  description: '分析用户输入，判断本轮意图、场景模式和风险等级',

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const userPrompt = ctx.userPrompt || ''
    const recentHistory = ctx.history.slice(-5)

    // Rule-based intent and scene mode detection
    const intent = detectIntent(userPrompt)
    const sceneMode = detectSceneMode(userPrompt, recentHistory)
    const focusEntities = extractFocusEntities(userPrompt)
    const riskLevel = assessRiskLevel(userPrompt, recentHistory)

    const plan: TurnPlan = {
      intent,
      sceneMode,
      riskLevel,
      focusEntities
    }

    // Write to turnTrace
    if (ctx.turnTrace) {
      ctx.turnTrace.planner = plan
    }

    return {
      success: true,
      data: { plan }
    }
  },

  async fallback(_error: Error, _ctx: SkillContext): Promise<SkillResult> {
    const fallbackPlan: TurnPlan = {
      intent: 'continue',
      sceneMode: 'normal',
      riskLevel: 'low',
      focusEntities: []
    }
    return {
      success: true,
      warnings: ['TurnPlanningSkill fallback: using default plan'],
      data: { plan: fallbackPlan }
    }
  }
}

function detectIntent(prompt: string): string {
  const lower = prompt.toLowerCase()
  if (/(攻击|战斗|出招|砍|刺|射|施法|释放|发动攻击)/i.test(prompt)) return 'combat_action'
  if (/(说|对话|交谈|询问|回答|告诉|请求|劝说)/i.test(prompt)) return 'dialogue'
  if (/(查看|调查|探索|搜索|检查|观察|寻找)/i.test(prompt)) return 'investigate'
  if (/(移动|前往|走向|离开|进入|出发|旅行)/i.test(prompt)) return 'movement'
  if (/(使用|装备|穿戴|拿出|打开|激活)/i.test(prompt)) return 'use_item'
  if (/(休息|等待|睡觉|恢复|扎营)/i.test(prompt)) return 'rest'
  if (lower.includes('help') || lower.includes('帮助')) return 'meta_help'
  return 'continue'
}

function detectSceneMode(
  prompt: string,
  recentHistory: Array<{ role: string; content: string }>
): TurnPlan['sceneMode'] {
  const combined = [prompt, ...recentHistory.map(h => h.content)].join(' ')

  // Combat indicators
  const combatScore = countMatches(combined, [
    '攻击', '战斗', '伤害', '血量', 'HP', '防御', '闪避', '命中',
    '敌人', '怪物', '死亡', '击杀', '施法', '技能', 'attack', 'combat'
  ])

  // Exploration indicators
  const explorationScore = countMatches(combined, [
    '探索', '调查', '搜索', '发现', '地图', '路径', '前方', '洞穴',
    '遗迹', '密室', '宝箱', '线索', '解谜', 'explore'
  ])

  // Social indicators
  const socialScore = countMatches(combined, [
    '对话', '交谈', '谈判', '说服', '请求', '商店', '交易', '酒馆',
    '集市', '商人', '同伴', '关系', '信任', 'talk', 'negotiate'
  ])

  const scores = { conflict: combatScore, exploration: explorationScore, social: socialScore }
  const max = Math.max(combatScore, explorationScore, socialScore)

  if (max === 0) return 'normal'
  if (combatScore === max) return 'conflict'
  if (explorationScore === max) return 'exploration'
  return 'social'
}

function countMatches(text: string, keywords: string[]): number {
  return keywords.filter(kw => text.includes(kw)).length
}

function extractFocusEntities(prompt: string): string[] {
  const entities: string[] = []
  // Match quoted names
  const quoted = prompt.match(/[「『""]([^「『""」』]+?)[」』""]/g) || []
  for (const match of quoted) {
    const name = match.slice(1, -1).trim()
    if (name.length >= 2 && name.length <= 20) entities.push(name)
  }
  return entities.slice(0, 5)
}

function assessRiskLevel(
  prompt: string,
  recentHistory: Array<{ role: string; content: string }>
): TurnPlan['riskLevel'] {
  const combined = [prompt, ...recentHistory.slice(-2).map(h => h.content)].join(' ')

  // High risk indicators: death, major plot change, character removal
  const highRiskPatterns = [
    /死亡|阵亡|毁灭|消灭|灭亡|killed|dead|destroyed/i,
    /章节.*(?:结束|完成)|结局|终章/i,
    /背叛|敌对转|关系.*断/i
  ]
  if (highRiskPatterns.some(p => p.test(combined))) return 'high'

  // Medium risk: combat, significant changes
  const mediumRiskPatterns = [
    /战斗|攻击|受伤|伤害|combat|attack/i,
    /等级.*(?:提升|变化)|level.*up/i,
    /获得.*(?:技能|能力|装备)/i
  ]
  if (mediumRiskPatterns.some(p => p.test(combined))) return 'medium'

  return 'low'
}
