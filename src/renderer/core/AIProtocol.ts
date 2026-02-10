import { db } from '../db/db'
import { WorldCard, CharacterCard, ChapterCard, SettingCard, ChronicleEntry } from '@shared/Interface'

export interface WorldSnapshot {
  activeChapter: ChapterCard | null
  activeCharacters: CharacterCard[]
  inactiveCharacters: { id: string; name: string }[]
  settings: SettingCard[]
}

export class AIProtocol {
  /**
   * Intercepts dice roll commands from AI response.
   * Pattern: [[XdY+Z]] or similar.
   */
  static interceptRolls(text: string): { roll: string } | null {
    // Regex to match [[1d20+5]] or [[2d6]] etc.
    const match = text.match(/\[\[(\d+d\d+[\+\-\d]*)\]\]/)
    if (match) {
      return { roll: match[1] }
    }
    return null
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
  static formatHistory(history: ChronicleEntry[]): string {
    return history.map(entry => {
      // If content is JSON (from AI), parse it and extract narrative sequence
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
        } catch (e) {
          // If not JSON, use as is
        }
      }
      return `[${entry.role.toUpperCase()}]: ${content}`
    }).join('\n')
  }

  /**
   * Step 1: Constructs the Discovery Prompt.
   * Asks AI to identify which cards it needs to read based on context and user input.
   */
  static async constructDiscoveryPrompt(
    userPrompt: string, 
    activeCharIds: string[],
    history: ChronicleEntry[]
  ): Promise<string> {
    const allCards = await db.world_cards.toArray()
    const index = allCards.map(c => `- [${c.type}] ${c.title || c.name} (ID: ${c.id})`).join('\n')
    
    const snapshot = await this.getSnapshot(activeCharIds)
    const historyText = this.formatHistory(history.slice(-5)) // Only recent history for discovery

    return `
# Role
You are the "Librarian" of the Oort world database. Your job is to identify which World Cards are relevant to the user's latest input and the current context.

# Task
1. Analyze the User Input and Recent History.
2. Review the "World Index" below.
3. Return a JSON object listing the IDs of the cards you need to read in detail to generate a narrative response.
4. IMPORTANT: If the user is starting a new game or scene, and only the "Player" is active, you MUST identify which other characters or settings should be active in this scene (e.g., NPCs present in the chapter).
5. Return "active_role_suggestions" if you believe new characters should be permanently added to the Active Information panel.

# Context
## Active Chapter
${snapshot.activeChapter ? `${snapshot.activeChapter.title} (ID: ${snapshot.activeChapter.id})` : 'None'}

## Active Characters
${snapshot.activeCharacters.map(c => `${c.name} (ID: ${c.id})`).join(', ')}

## Recent History
${historyText}

## User Input
${userPrompt}

# World Index
${index}

# Response Format (JSON Only)
{
  "needed_card_ids": ["id_1", "id_2"],
  "active_role_suggestions": ["id_3", "id_4"]
}
`
  }

  /**
   * Step 2: Constructs the Narrative Prompt.
   * Includes the full content of requested cards.
   */
  static async constructNarrativePrompt(
    userPrompt: string, 
    activeCharIds: string[],
    history: ChronicleEntry[],
    supplementaryCardIds: string[]
  ): Promise<string> {
    const snapshot = await this.getSnapshot(activeCharIds)
    const historyText = this.formatHistory(history)

    // Fetch supplementary cards
    const supplementaryCards = await db.world_cards.bulkGet(supplementaryCardIds)
    const validSupplements = supplementaryCards.filter(c => c !== undefined)

    // Build World Context String
    let worldContext = ''
    
    // Settings
    worldContext += '## Settings (Global Rules)\n'
    snapshot.settings.forEach(s => {
      worldContext += `- ${s.title} (${s.category}): ${s.content}\n`
    })

    // Active Chapter
    if (snapshot.activeChapter) {
      worldContext += `\n## Current Chapter: ${snapshot.activeChapter.title}\n`
      worldContext += `Objective: ${snapshot.activeChapter.objective}\n`
      worldContext += `Summary: ${snapshot.activeChapter.summary}\n`
      worldContext += `Plot Points:\n`
      snapshot.activeChapter.plot_points.forEach(p => {
        worldContext += `- ${p.title}: ${p.content} (Secret: ${p.secret_notes})\n`
      })
    }

    // Active Characters
    let charContext = '## Active Characters\n'
    snapshot.activeCharacters.forEach(c => {
      charContext += `### ${c.name} (ID: ${c.id})\n`
      charContext += `Race: ${c.race}, Class: ${c.class}, Level: ${c.level}\n`
      charContext += `Attributes: ${JSON.stringify(c.attributes)}\n`
      // Defensive check for status array
      const statusText = Array.isArray(c.status) ? c.status.join(', ') : (c.status || 'None')
      charContext += `Status: ${statusText}\n`
      // Include personality/background if relevant? 
      // Maybe keep it brief unless requested in supplementary?
      // For now, keep it somewhat detailed as they are "Active"
      const personalityText = Array.isArray(c.personality) ? c.personality.join(', ') : (c.personality || 'Unknown')
      charContext += `Personality: ${personalityText}\n`
    })

    // Supplementary Cards (The AI requested these)
    let suppContext = '## Referenced Knowledge (Dynamically Retrieved)\n'
    validSupplements.forEach(c => {
      if (!c) return
      suppContext += `### [${c.type}] ${c.title || c.name} (ID: ${c.id})\n`
      suppContext += JSON.stringify(c, null, 2) + '\n'
    })

    const systemMessage = `
# Role
You are the Game Master (GM) for the dark fantasy world of "Oort" (奥尔特大陆).
Your goal is to weave a compelling narrative involving gods, magic, and destiny.

# World Context
${worldContext}

${charContext}

${suppContext}

# History
${historyText}

# Instruction
1. Respond to the User Input as the GM.
2. Use the provided "Referenced Knowledge" to ensure accuracy.
3. Advance the plot based on the Current Chapter's objectives.

   ┌─────────────────────────────────────────────────────────────────────┐
   │ DEFAULT: interaction.needs_roll = FALSE                             │
   │                                                                  │
   │ Only set to TRUE if the outcome is COMPLETELY UNDECIDABLE and    │
   │ would fundamentally change the story in a way you CANNOT decide. │
   └─────────────────────────────────────────────────────────────────────┘
   

5. If the user meets a new character or enters a new location, use 'world_updates' or 'active_role' to update the state.
6. PROACTIVE STORYTELLING: If the user input is vague, passive, or if the plot has stalled, introduce a new event, threat, or discovery to drive the narrative forward.

# Language
You MUST output the narrative in **Chinese (Simplified)**.

# Response Format
You MUST respond with a valid JSON object.
{
  "sequence": [
    { "type": "environment", "content": "Description of scene..." },
    { "type": "dialogue", "speaker_name": "Name", "content": "Speech..." }
  ],
  "interaction": { 
    "needs_roll": false
  },
  "world_updates": [],
  "active_role": { "add": [], "delete": [] }
}
`

    return `${systemMessage}\n\n[USER INPUT]: ${userPrompt}`
  }

  /**
   * Deprecated: Use constructNarrativePrompt instead.
   * Keeping for backward compatibility if needed, or remove.
   */
  static async constructPrompt(
    userPrompt: string, 
    activeCharIds: string[],
    history: ChronicleEntry[],
    interactionResult?: string
  ): Promise<string> {
    const snapshot = await this.getSnapshot(activeCharIds)
    const historyText = this.formatHistory(history)

    // Build World Context String
    let worldContext = ''
    
    // Settings
    worldContext += '## Settings\n'
    snapshot.settings.forEach(s => {
      worldContext += `- ${s.title} (${s.category}): ${s.content}\n`
    })

    // Active Chapter
    if (snapshot.activeChapter) {
      worldContext += `\n## Current Chapter: ${snapshot.activeChapter.title}\n`
      worldContext += `Objective: ${snapshot.activeChapter.objective}\n`
      worldContext += `Plot Points: ${snapshot.activeChapter.plot_points.map(p => p.title).join(', ')}\n`
    }

    // Active Characters
    let charContext = '## Active Characters\n'
    snapshot.activeCharacters.forEach(c => {
      charContext += `### ${c.name} (ID: ${c.id})\n`
      charContext += `Race: ${c.race}, Class: ${c.class}, Level: ${c.level}\n`
      charContext += `Attributes: STR:${c.attributes.str} DEX:${c.attributes.dex} CON:${c.attributes.con} INT:${c.attributes.int} WIS:${c.attributes.wis} CHA:${c.attributes.cha}\n`
      charContext += `Status: ${c.status.join(', ')}\n`
      charContext += `Personality: ${c.personality?.join(', ')}\n`
      charContext += `Background: ${c.background?.join(' ')}\n`
    })

    // Inactive Characters Summary
    charContext += '\n## Other Characters (Summary)\n'
    snapshot.inactiveCharacters.forEach(c => {
      charContext += `- ${c.name} (${c.id})\n`
    })

    const systemMessage = `
# Role
You are the Game Master (GM) for the dark fantasy world of "Oort" (奥尔特大陆).
Your goal is to weave a compelling narrative involving gods, magic, and destiny.

# World Context (Current Snapshot)
${worldContext}

# Active Character Details
${charContext}

# Output Constraint (CRITICAL)
You MUST reply in valid JSON format. Do NOT include any text outside the JSON block.
1. Narrative Style:
   - Use vivid, sensory-rich descriptions for the environment (sight, sound, smell).
   - Maintain a serious, immersive dark fantasy tone.
   - Separate "Environment" descriptions from "Dialogue".
   - Environment descriptions should be atmospheric and set the scene.
   - Dialogue should be in character.
2. Game Mechanics:
   - Use 'world_updates' to advance time, modify character status, or unlock settings.
   - If the player attempts an action requiring a check (e.g., attacking, persuading, climbing), use 'interaction' to request a roll.
   - If a player tries an impossible feat, describe the failure/backlash in 'sequence'.
3. Language:
   - The content of the 'sequence' MUST be in CHINESE (Simplified).
   - Internal keys and structure must remain English.

JSON Structure Template:
{
  "sequence": [
    { "type": "environment", "content": "Environmental description..." },
    { "type": "dialogue", "speaker_name": "Name", "content": "Spoken text..." }
  ],
  "interaction": {
    "needs_roll": boolean,
    "dc": number,
    "description": "Reason for roll",
    "attribute": "str|dex|con|int|wis|cha"
  },
  "active_role": {
    "add": ["char_id"],
    "delete": ["char_id"]
  },
  "world_updates": [
    {
      "action": "CREATE | UPDATE",
      "type": "character | setting | interaction | chapter",
      "target_id": "id_if_update",
      "data": { ... }
    }
  ]
}
`

    let finalPrompt = `${systemMessage}\n\n# History\n${historyText}`

    // Inject Interaction Result if present
    if (interactionResult) {
      finalPrompt += `\n\n${interactionResult}`
    }

    // Append User Input if present
    if (userPrompt && userPrompt.trim() !== '') {
      finalPrompt += `\n\n[PLAYER]: ${userPrompt}`
    }

    return finalPrompt
  }
}
