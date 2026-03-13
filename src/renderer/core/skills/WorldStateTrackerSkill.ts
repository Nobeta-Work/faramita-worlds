import type { AISkill, SkillContext, SkillResult, WorldStateChange, WorldStateDelta } from '@shared/Interface'
import { db } from '../../db/db'

export const WorldStateTrackerSkill: AISkill = {
  id: 'world-state-tracker',
  name: '世界状态追踪',
  phase: 'post-narrative',
  defaultPriority: 0,
  description: '记录本轮 world_updates 的字段级增量变化并持久化。',

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const updates = ctx.aiResponse?.world_updates || []
    if (updates.length === 0) {
      return { success: true, data: { deltas: [] } }
    }

    const preSnapshots = (ctx.skillOutputs['core-narrative']?.preUpdateSnapshots || {}) as Record<string, any>
    const changes: WorldStateChange[] = []

    for (const update of updates) {
      if (update.action === 'CREATE') {
        const newCard = update.data || {}
        const cardId = newCard.id || update.target_id || `unknown-${Date.now()}`
        Object.keys(newCard).forEach((field) => {
          changes.push({
            cardId,
            field,
            oldValue: null,
            newValue: newCard[field]
          })
        })
        continue
      }

      if (update.action === 'UPDATE' && update.target_id) {
        const oldCard = preSnapshots[update.target_id] || {}
        const deltaFields = flattenObject(update.data || {})

        Object.entries(deltaFields).forEach(([field, newValue]) => {
          const oldValue = readPath(oldCard, field)
          if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            changes.push({
              cardId: update.target_id as string,
              field,
              oldValue,
              newValue
            })
          }
        })
      }
    }

    if (changes.length === 0) {
      return { success: true, data: { deltas: [] } }
    }

    const cardIds = Array.from(new Set(changes.map((item) => item.cardId)))
    const delta: WorldStateDelta = {
      turn: ctx.history.length + 1,
      timestamp: Date.now(),
      cardIds,
      changes
    }

    await db.world_state_log.add(delta)

    const snapshotSummary = `Δ${changes.length} changes, cards: ${cardIds.join(', ')}`
    ctx.promptFragments['world_state_delta'] = snapshotSummary

    return {
      success: true,
      data: {
        deltas: [delta],
        notifications: [`WorldState Δ recorded: ${changes.length} changes`]
      }
    }
  },

  async fallback(_error: Error, _ctx: SkillContext): Promise<SkillResult> {
    return {
      success: true,
      warnings: ['WorldStateTrackerSkill fallback: skipped delta recording']
    }
  }
}

function flattenObject(input: Record<string, any>, prefix = ''): Record<string, any> {
  const output: Record<string, any> = {}
  Object.entries(input || {}).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(output, flattenObject(value, path))
    } else {
      output[path] = value
    }
  })
  return output
}

function readPath(target: any, path: string): any {
  const parts = path.split('.')
  let current = target
  for (const part of parts) {
    if (current == null) return undefined
    current = current[part]
  }
  return current
}
