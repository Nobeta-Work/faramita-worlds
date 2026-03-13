import type { JudgmentOutcome, Difficulty, TagModifier, RollResult } from '@shared/Interface'

export class DiceLogic {
  private static readonly DIFFICULTY_MAP: Record<Difficulty, number> = {
    easy: 2,
    normal: 0,
    hard: -2,
    extreme: -4,
  }

  /**
   * 执行 2d6 + 标签权重 + 难度修正 判定
   */
  static roll2d6(tags: TagModifier[], difficulty: Difficulty): RollResult {
    const die1 = Math.floor(Math.random() * 6) + 1
    const die2 = Math.floor(Math.random() * 6) + 1
    const diceTotal = die1 + die2

    const tagModifier = tags.reduce((sum, t) => sum + (t.positive ? t.weight : -t.weight), 0)
    const difficultyModifier = this.DIFFICULTY_MAP[difficulty]
    const finalResult = diceTotal + tagModifier + difficultyModifier

    const isCriticalSuccess = diceTotal === 12

    let outcome: JudgmentOutcome
    if (isCriticalSuccess) outcome = 'full_success'
    else if (finalResult >= 9) outcome = 'full_success'
    else if (finalResult >= 6) outcome = 'partial_success'
    else outcome = 'failure'

    return {
      dice: [die1, die2],
      diceTotal,
      tagModifier,
      difficultyModifier,
      finalResult,
      outcome,
      isCriticalSuccess,
      tags,
      difficulty,
    }
  }

  /**
   * @deprecated 仅用于旧版 d20_logic 字段的兼容处理
   */
  static parseAndRoll(formula: string): { formula: string; diceResults: number[]; bonus: number; total: number } {
    const regex = /(\d+)d(\d+)(?:\s*([\+\-])\s*(\d+))?/i
    const match = formula.match(regex)

    if (!match) {
      throw new Error(`Invalid roll formula: ${formula}`)
    }

    const count = parseInt(match[1])
    const sides = parseInt(match[2])
    const operator = match[3] || '+'
    const bonus = parseInt(match[4] || '0')

    const diceResults: number[] = []
    for (let i = 0; i < count; i++) {
      diceResults.push(Math.floor(Math.random() * sides) + 1)
    }

    const sum = diceResults.reduce((a, b) => a + b, 0)
    const total = operator === '+' ? sum + bonus : sum - bonus

    return {
      formula,
      diceResults,
      bonus: operator === '+' ? bonus : -bonus,
      total
    }
  }
}
