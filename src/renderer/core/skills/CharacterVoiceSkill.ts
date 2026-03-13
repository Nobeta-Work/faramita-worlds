import type { AISkill, SkillContext, SkillResult, CharacterCard, VoiceProfile, AIResponseSequence } from '@shared/Interface'
import { AIProtocol } from '../AIProtocol'

export const CharacterVoiceSkill: AISkill = {
  id: 'character-voice',
  name: '角色声线约束',
  phase: 'pre-narrative',
  defaultPriority: 20,
  description: '为活跃角色注入语气/词汇/句式约束，提升对话一致性。',

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const snapshot = await AIProtocol.getSnapshot(ctx.activeCharacterIds)
    const voiceTargets: Array<{ id: string; name: string; profile: VoiceProfile }> = []

    for (const character of snapshot.activeCharacters) {
      const profile = resolveVoiceProfile(character, ctx)
      if (!profile) continue
      voiceTargets.push({ id: character.id, name: character.name, profile })
    }

    if (voiceTargets.length === 0) {
      return {
        success: true,
        warnings: ['CharacterVoiceSkill: no active voice profiles available']
      }
    }

    const constraints = voiceTargets
      .map(({ name, profile }) => {
        const patterns = profile.speech_patterns.length > 0 ? profile.speech_patterns.join('、') : '无固定口头禅'
        const examples = profile.example_dialogues.length > 0 ? profile.example_dialogues.map((line) => `- ${line}`).join('\n') : '- 无'
        return `角色「${name}」发言约束：\n- 语气：${profile.tone}\n- 词汇风格：${profile.vocabulary_level}\n- 常用句式：${patterns}\n- 情绪范围：${profile.emotional_range}\n- 示例对话：\n${examples}`
      })
      .join('\n\n')

    ctx.promptFragments['voice_constraints'] = constraints
    ctx.skillOutputs['character-voice-targets'] = voiceTargets

    return {
      success: true,
      data: {
        targetCount: voiceTargets.length,
        constraintsLength: constraints.length
      }
    }
  },

  async fallback(_error: Error, _ctx: SkillContext): Promise<SkillResult> {
    return {
      success: true,
      warnings: ['CharacterVoiceSkill fallback: skipped voice constraints']
    }
  }
}

function resolveVoiceProfile(character: CharacterCard, ctx: SkillContext): VoiceProfile | null {
  if (character.voice_profile) {
    return character.voice_profile
  }

  const inferred = inferProfileFromHistory(character.name, ctx.history)
  return inferred
}

function inferProfileFromHistory(characterName: string, history: SkillContext['history']): VoiceProfile | null {
  const lines: string[] = []

  for (const entry of history) {
    if (entry.role !== 'assistant') continue
    const content = entry.content
    try {
      const json = JSON.parse(content)
      const sequence = json.sequence as AIResponseSequence[] | undefined
      if (!Array.isArray(sequence)) continue
      sequence.forEach((item) => {
        if (item.type === 'dialogue' && item.speaker_name === characterName && item.content) {
          lines.push(item.content)
        }
      })
    } catch {
      continue
    }
  }

  if (lines.length < 5) return null

  const avgLength = Math.round(lines.reduce((sum, line) => sum + line.length, 0) / lines.length)
  const punctuationHeavy = lines.filter((line) => /[！!？?]/.test(line)).length >= Math.ceil(lines.length / 2)

  return {
    tone: punctuationHeavy ? '情绪外放、语气鲜明' : '克制沉稳、叙述清晰',
    vocabulary_level: avgLength > 24 ? '典雅' : '口语化',
    speech_patterns: inferSpeechPatterns(lines),
    emotional_range: punctuationHeavy ? '中高波动' : '低到中等波动',
    example_dialogues: lines.slice(-3)
  }
}

function inferSpeechPatterns(lines: string[]): string[] {
  const candidates = ['我认为', '听着', '你知道', '必须', '现在', '也许', '当然', '不行']
  const hits = candidates.filter((token) => lines.some((line) => line.includes(token)))
  if (hits.length > 0) return hits.slice(0, 3)

  const tailWords = lines
    .map((line) => line.trim().replace(/[。！？!?]+$/g, ''))
    .map((line) => line.split(/[，,\s]+/).slice(-1)[0])
    .filter((word) => word && word.length >= 2 && word.length <= 6)

  return Array.from(new Set(tailWords)).slice(0, 3)
}
