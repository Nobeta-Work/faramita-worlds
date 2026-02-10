import { db } from '../db/db'
import { AIResponse, AIResponseWorldUpdate, AIResponseActiveRole } from '@shared/Interface'
import { useWorldStore } from '../store/world'

export class NarrativeEngine {
  /**
   * Parses the AI response text to extract valid JSON.
   * Handles cases where AI adds preamble or postscript.
   */
  static parseResponse(text: string): AIResponse | null {
    try {
      // 1. Try direct parse
      return JSON.parse(text)
    } catch (e) {
      // 2. Try Regex extraction for JSON block
      // Improved regex to handle potential markdown variations
      const jsonRegex = /```json\s*([\s\S]*?)\s*```|```\s*([\s\S]*?)\s*```|(\{[\s\S]*\})/
      const match = text.match(jsonRegex)
      
      if (match) {
        try {
          // match[1] is ```json ... ``` content
          // match[2] is ``` ... ``` content
          // match[3] is raw {...} content
          const jsonStr = match[1] || match[2] || match[3]
          if (jsonStr) {
            return JSON.parse(jsonStr.trim())
          }
        } catch (innerError) {
          console.error('Failed to parse extracted JSON:', innerError)
        }
      }
      
      console.error('NarrativeEngine: Could not parse AI response as JSON. Raw text:', text)
      return null
    }
  }

  /**
   * Processes world updates from the AI response.
   * Ensures atomicity by using transactions where possible (or sequential awaits).
   * Returns a list of human-readable update notifications.
   */
  static async processUpdates(updates: AIResponseWorldUpdate[]): Promise<string[]> {
    if (!updates || updates.length === 0) return []

    const worldStore = useWorldStore()
    const notifications: string[] = []

    for (const update of updates) {
      try {
        if (update.action === 'CREATE') {
          // Handle Create
          // Check if ID exists to avoid conflict (User req 9: ID injection robustness)
          let newCard = { ...update.data, type: update.type }
          
          if (!newCard.id) {
            newCard.id = crypto.randomUUID()
          }

          // If ID exists, append suffix
          let existing = await db.world_cards.get(newCard.id)
          let counter = 1
          while (existing) {
             newCard.id = `${update.data.id}_${counter}`
             existing = await db.world_cards.get(newCard.id)
             counter++
          }
          
          await worldStore.addCard(newCard)
          notifications.push(`Created new ${update.type}: ${newCard.name || newCard.title || 'Unknown'}`)

          // If character, add to active list automatically?
          // User req 8: "create operation ... simultaneously add to active info"
          if (update.type === 'character') {
             await worldStore.updateActiveCharacters([newCard.id], [])
          }

        } else if (update.action === 'UPDATE') {
          // Handle Update (Deep Merge)
          if (!update.target_id) continue
          
          const existing = await db.world_cards.get(update.target_id)
          if (existing) {
             // Deep merge data
             // Ensure data fields that should be arrays ARE arrays in the update
             // This fixes the "Magic" -> ["M", "a", "g", "i", "c"] issue if AI returns string for status
             if (update.data && (update.data as any).status && typeof (update.data as any).status === 'string') {
                (update.data as any).status = [(update.data as any).status]
             }
             if (update.data && (update.data as any).background && typeof (update.data as any).background === 'string') {
                (update.data as any).background = [(update.data as any).background]
             }

             const merged = this.deepMerge(existing, update.data)
             await worldStore.updateCard(merged)
             notifications.push(`Updated ${update.type}: ${merged.name || merged.title || 'Unknown'}`)
          }
        }
      } catch (err) {
        console.error(`Failed to process update for ${update.type}`, err)
      }
    }
    return notifications
  }

  /**
   * Helper to merge arrays/objects.
   * Special handling for simple arrays of strings:
   * If existing is ["A", "B"] and incoming is "C" (string), result is ["A", "B", "C"]?
   * Or if incoming is ["C"], result is ["A", "B", "C"]?
   * 
   * Actually, for 'status', we probably want to replace or union.
   * But the issue is if incoming is "Magic", deepMerge might be iterating "Magic" chars?
   * Let's check typical deep merge implementation.
   */
  static deepMerge(target: any, source: any): any {
    if (typeof source !== 'object' || source === null) {
      return source
    }
    if (Array.isArray(source)) {
      // If source is array, we usually replace or concat?
      // For status/tags, let's union if target is array
      if (Array.isArray(target)) {
        return Array.from(new Set([...target, ...source]))
      }
      return source
    }
    
    const output = { ...target }
    Object.keys(source).forEach(key => {
      const sourceValue = source[key]
      const targetValue = target[key]
      
      if (Array.isArray(sourceValue) && Array.isArray(targetValue)) {
         output[key] = Array.from(new Set([...targetValue, ...sourceValue]))
      } else if (typeof sourceValue === 'object' && sourceValue !== null && targetValue) {
        output[key] = this.deepMerge(targetValue, sourceValue)
      } else {
        output[key] = sourceValue
      }
    })
    return output
  }
  static async processActiveRoles(activeRole: AIResponseActiveRole) {
    if (!activeRole) return
    
    const worldStore = useWorldStore()
    const toAdd = activeRole.add || []
    const toDelete = activeRole.delete || []
    
    await worldStore.updateActiveCharacters(toAdd, toDelete)
  }


}
