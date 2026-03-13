import type { AISkill, SkillContext, SkillResult, ConflictIssue, ConflictReport, CharacterCard, AIResponseSequence, WorldStateDelta, ReviewTrace } from '@shared/Interface'
import { db } from '../../db/db'

export const ConflictDetectionSkill: AISkill = {
  id: 'conflict-detection',
  name: '冲突检测',
  phase: 'post-narrative',
  defaultPriority: 10,
  description: '检测角色状态与世界状态增量中的逻辑冲突，输出冲突报告。',

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const issues: ConflictIssue[] = []

    const characters = (await db.world_cards.toArray()).filter((card): card is CharacterCard => card.type === 'character')
    const byName = new Map<string, CharacterCard>()
    characters.forEach((character) => byName.set(character.name, character))

    const sequence = (ctx.aiResponse?.sequence || []) as AIResponseSequence[]

    for (const segment of sequence) {
      if (segment.type !== 'dialogue' || !segment.speaker_name) continue
      const speaker = byName.get(segment.speaker_name)
      if (!speaker) continue

      const statusText = (speaker.status || []).join(' ')
      if (/(死亡|阵亡|dead|deceased|killed)/i.test(statusText)) {
        issues.push({
          severity: 'critical',
          code: 'DEAD_SPEAKING',
          message: `角色 ${speaker.name} 状态为死亡/阵亡，但在本轮仍有台词。`,
          cardId: speaker.id,
          turn: ctx.history.length + 1
        })
      }

      if (!ctx.activeCharacterIds.includes(speaker.id)) {
        issues.push({
          severity: 'minor',
          code: 'INACTIVE_SPEAKER',
          message: `角色 ${speaker.name} 不在活跃信息中，但出现在本轮对话。`,
          cardId: speaker.id,
          turn: ctx.history.length + 1
        })
      }
    }

    const deltas = (ctx.skillOutputs['world-state-tracker']?.deltas || []) as WorldStateDelta[]
    deltas.forEach((delta) => {
      delta.changes.forEach((change) => {
        if (change.field === 'level' && typeof change.oldValue === 'number' && typeof change.newValue === 'number' && change.newValue < change.oldValue) {
          issues.push({
            severity: 'major',
            code: 'LEVEL_ROLLBACK',
            message: `角色等级回退: ${change.oldValue} -> ${change.newValue}`,
            cardId: change.cardId,
            turn: delta.turn
          })
        }

        if (/^attributes\./.test(change.field) && typeof change.newValue === 'number' && (change.newValue < 1 || change.newValue > 30)) {
          issues.push({
            severity: 'major',
            code: 'ATTRIBUTE_OUT_OF_RANGE',
            message: `属性 ${change.field} 超出合理范围: ${change.newValue}`,
            cardId: change.cardId,
            turn: delta.turn
          })
        }
      })
    })

    const report = buildReport(issues)
    const notifications = report.summary.critical > 0
      ? [`Conflict critical: ${report.summary.critical} issue(s) require review`] : []

    // Write reviewTrace to turnTrace
    const reviewTrace: ReviewTrace = {
      conflicts: issues.filter(i => i.severity === 'critical' || i.severity === 'major').map(i => i.message),
      warnings: issues.filter(i => i.severity === 'minor').map(i => i.message),
      commitSafe: report.summary.critical === 0
    }
    if (ctx.turnTrace) {
      ctx.turnTrace.review = reviewTrace
    }

    return {
      success: true,
      warnings: issues.map((issue) => `${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`),
      data: {
        report,
        notifications
      }
    }
  },

  async fallback(_error: Error, _ctx: SkillContext): Promise<SkillResult> {
    return {
      success: true,
      warnings: ['ConflictDetectionSkill fallback: skipped conflict analysis']
    }
  }
}

function buildReport(issues: ConflictIssue[]): ConflictReport {
  const summary = {
    critical: issues.filter((issue) => issue.severity === 'critical').length,
    major: issues.filter((issue) => issue.severity === 'major').length,
    minor: issues.filter((issue) => issue.severity === 'minor').length
  }

  return {
    issues,
    summary
  }
}
