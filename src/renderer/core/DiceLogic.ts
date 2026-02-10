export interface RollResult {
  formula: string
  diceResults: number[]
  bonus: number
  total: number
}

export class DiceLogic {
  static parseAndRoll(formula: string): RollResult {
    // Formula format: "1d20 + 5" or "2d6 - 2"
    const regex = /(\d+)d(\d+)\s*([\+\-])\s*(\d+)/i
    const match = formula.match(regex)

    if (!match) {
      throw new Error(`Invalid roll formula: ${formula}`)
    }

    const count = parseInt(match[1])
    const sides = parseInt(match[2])
    const operator = match[3]
    const bonus = parseInt(match[4])

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
