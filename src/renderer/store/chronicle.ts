import { defineStore } from 'pinia'
import { toRaw } from 'vue'
import { db } from '../db/db'
import { ChronicleEntry, AIResponseInteraction } from '@shared/Interface'
import { AIProtocol } from '../core/AIProtocol'
import { NarrativeEngine } from '../core/NarrativeEngine'
import { AIService } from '../core/AIService'
import { useConfigStore } from './config'
import { useWorldStore } from './world'

export const useChronicleStore = defineStore('chronicle', {
  state: () => ({
    history: [] as ChronicleEntry[],
    isStreaming: false, 
    currentStreamText: '',
    parsedStreamSequence: [] as any[], // For incremental typing
    pendingInteraction: null as AIResponseInteraction | null,
    isWaitingForRoll: false
  }),
  actions: {
    async loadHistory() {
      this.history = await db.chronicle.orderBy('turn').toArray()
    },
    async addEntry(entry: Omit<ChronicleEntry, 'id'>) {
      // Ensure plain object for Dexie
      const rawEntry = toRaw(entry)
      const id = await db.chronicle.add(rawEntry as ChronicleEntry)
      this.history.push({ ...entry, id } as ChronicleEntry)
      
      // Auto-save archive after adding entry
      await this.saveArchive()
    },
    async rollback(turn: number) {
      const toDelete = this.history.filter(e => e.turn >= turn)
      for (const entry of toDelete) {
        if (entry.id) await db.chronicle.delete(entry.id)
      }
      this.history = this.history.filter(e => e.turn < turn)
      this.pendingInteraction = null
      this.isWaitingForRoll = false
      
      // Auto-save archive after rollback
      await this.saveArchive()
    },
    setInteraction(interaction: AIResponseInteraction) {
      // [临时方案] 当 needs_roll = false 时，不显示投掷面板，不设置 pendingInteraction
      if (!interaction.needs_roll) {
        this.isWaitingForRoll = false
        this.pendingInteraction = null  // 清除pendingInteraction
        return
      }
      
      this.pendingInteraction = interaction
      this.isWaitingForRoll = true
      
      const attrText = interaction.attribute ? ` with ${interaction.attribute}` : ''
      const systemMsg = `[SYSTEM] [DICE] ${interaction.description || 'Action'}${attrText}`
      
      this.addEntry({
        turn: this.history.length + 1,
        role: 'system',
        content: systemMsg,
        timestamp: Date.now()
      })
    },
    clearInteraction() {
      this.pendingInteraction = null
      this.isWaitingForRoll = false
    },
    
    // Core AI Logic
    async processUserMessage(content: string) {
      // 1. Add User Entry
      await this.addEntry({
        turn: this.history.length + 1,
        role: 'user',
        content,
        timestamp: Date.now()
      })

      await this._generateAIResponse()
    },

    async resolveInteraction(rollResult: number) {
      if (!this.pendingInteraction) return

      const interaction = this.pendingInteraction
      const checkResult = (interaction.dc && rollResult >= interaction.dc) ? 'SUCCESS' : 'FAILURE'
      
      const rollResultMsg = ` | Roll: ${rollResult} (DC ${interaction.dc || '?'}) => ${checkResult}`

      if (this.history.length > 0) {
        const lastEntry = this.history[this.history.length - 1]
        if (lastEntry.role === 'system' && lastEntry.content.startsWith('[SYSTEM] [DICE]')) {
          const updatedContent = lastEntry.content + rollResultMsg
          await db.chronicle.update(lastEntry.id, { content: updatedContent })
          lastEntry.content = updatedContent
        }
      }

      this.clearInteraction()
      await this._generateAIResponse()
      
      // Auto-save archive after resolving interaction
      await this.saveArchive()
    },

    async _generateAIResponse() {
      const configStore = useConfigStore()
      const worldStore = useWorldStore()

      if (!configStore.apiKey) {
        console.error('No API Key set')
        return
      }

      this.isStreaming = true
      this.currentStreamText = 'Thinking...'

      try {
        const aiService = new AIService({
          apiKey: configStore.apiKey,
          baseUrl: configStore.baseUrl,
          model: configStore.model
        })

        // Construct Prompt
        const lastEntry = this.history[this.history.length - 1]
        let userPrompt = ''
        let historyToPass = this.history
        
        if (lastEntry.role === 'user') {
           userPrompt = lastEntry.content
           historyToPass = this.history.slice(0, -1)
        }
        // If lastEntry is system or assistant, we leave userPrompt empty 
        // and include the entry in historyToPass.
        
        // Fix: If userPrompt is empty (e.g. following a system msg), we must try to find the last user action
        // or just proceed with an empty prompt (AI will react to latest history).
        // BUT if it's empty, we should check if we really need to respond?
        // Actually, if called, we assume a response is needed.
        // Let's ensure userPrompt is not undefined.
        
        const activeIds = worldStore.activeCharacterIds

        // Step 1: Discovery Phase
        this.currentStreamText = 'Consulting Archives...'
        const discoveryPrompt = await AIProtocol.constructDiscoveryPrompt(
          userPrompt,
          activeIds,
          historyToPass
        )
        
        let neededCardIds: string[] = []
        try {
          // Use non-streaming request for discovery to be fast and atomic
          const discoveryResponse = await aiService.sendMessage(
            discoveryPrompt,
            () => {}, // No token callback needed
            () => {},
            true
          )
          
          // Parse JSON from response
          const discoveryJson = NarrativeEngine.parseResponse(discoveryResponse)
          if (discoveryJson) {
            if (discoveryJson.needed_card_ids) {
              neededCardIds = discoveryJson.needed_card_ids
            }
            // Auto-activate suggested roles if any
            if (discoveryJson.active_role_suggestions && discoveryJson.active_role_suggestions.length > 0) {
              await worldStore.updateActiveCharacters(discoveryJson.active_role_suggestions, [])
              // Add a system note about activation
              // We'll fetch names for nicer log
              // But for speed, just rely on the upcoming narrative to explain or the UI to update
            }
          }
        } catch (e) {
          console.warn('Discovery phase failed, proceeding without supplementary cards', e)
        }

        // Step 2: Narrative Phase
        this.currentStreamText = 'Thinking...'
        this.parsedStreamSequence = []
        
        const prompt = await AIProtocol.constructNarrativePrompt(
          userPrompt, 
          activeIds, 
          historyToPass,
          neededCardIds
        )

        // Send to AI (Accumulate full JSON)
        let fullResponseText = ''
        await aiService.sendMessage(
          prompt, 
          (token) => {
             fullResponseText += token
             // Optional: You could parse incrementally here if complex, 
             // but for now we wait for full JSON to ensure validity
          },
          () => {},
          true // skipContextInjection
        )

        this.currentStreamText = '' // Clear thinking text
        this.isStreaming = false // Stop "Thinking..." UI

        // Parse Response
        const response = NarrativeEngine.parseResponse(fullResponseText)
        
        if (response) {
          // 1. Updates
          if (response.world_updates) {
            const notifications = await NarrativeEngine.processUpdates(response.world_updates)
            // User req 5: Simple system notification for updates
            for (const note of notifications) {
              await this.addEntry({
                turn: this.history.length + 1,
                role: 'system',
                content: `[System] ${note}`,
                timestamp: Date.now()
              })
            }
          }
          if (response.active_role) {
            await NarrativeEngine.processActiveRoles(response.active_role)
          }

          // 2. Add Assistant Entry (Stored as JSON string)
          // We add it immediately. The UI Bubble will handle the "Typing" effect 
          // if we pass a flag or if we just let the user read it instantly.
          // The user asked to "extract sequence ... then type out".
          // So we should add the entry, and let the UI handle the typing animation 
          // based on the structured content.
          
          await this.addEntry({
            turn: this.history.length + 1,
            role: 'assistant',
            content: JSON.stringify(response), // Store full JSON
            timestamp: Date.now()
          })

          // 3. Handle Interaction
          if (response.interaction && response.interaction.needs_roll) {
            // [临时方案] 50%概率忽略投掷请求，直接当作无投掷处理
            // 效果：AI叙述正常显示，玩家可继续输入行为
            // TODO: 后续需要优化AI提示词来减少投掷频率
            const shouldRoll = Math.random() < 0.5
            if (!shouldRoll) {
              response.interaction.needs_roll = false
              console.log('[临时] 50%概率忽略投掷请求，正常显示叙述')
            }
            this.setInteraction(response.interaction)
          }
        } else {
          // Fallback if parsing failed
          console.error('Failed to parse AI response')
          await this.addEntry({
            turn: this.history.length + 1,
            role: 'assistant',
            content: JSON.stringify({ 
              sequence: [{ type: 'environment', content: fullResponseText }] 
            }),
            timestamp: Date.now()
          })
        }

      } catch (error) {
        console.error('AI Processing Error:', error)
        this.isStreaming = false
        this.currentStreamText = ''
      }
    },
    async saveArchive() {
      const worldStore = useWorldStore()
      if (!worldStore.meta || !worldStore.meta.uuid) {
        console.error('World meta or uuid not found')
        return { success: false, error: 'World meta not found' }
      }
      
      const archive = {
        world_meta: worldStore.meta,
        timestamp: Date.now(),
        active_information: worldStore.activeCharacterIds,
        history: this.history
      }
      
      const result = await (window.api as any).saveArchiveFile(
        JSON.stringify(archive, null, 2),
        worldStore.meta.uuid,
        worldStore.meta.name
      )
      return result
    },
    async loadArchive() {
      // This method is deprecated - use loadArchiveFile instead
      console.warn('loadArchive is deprecated, use loadArchiveFile with specific filename')
      return { success: false, error: 'Use loadArchiveFile instead' }
    },
    async loadArchiveFile(filename: string) {
      const result = await (window.api as any).loadArchiveFile(filename)
      if (result.success && result.content) {
        try {
          const archive = JSON.parse(result.content)
          if (Array.isArray(archive.history)) {
            await db.chronicle.clear()
            this.history = []
            await db.chronicle.bulkAdd(archive.history)
            await this.loadHistory()
            this.clearInteraction()
            
            // Load active information
            if (archive.active_information && Array.isArray(archive.active_information)) {
              const worldStore = useWorldStore()
              await worldStore.setActiveCharacters(archive.active_information)
            }
            
            return { success: true }
          }
        } catch (e: any) {
          console.error('Failed to parse archive file:', e)
          return { success: false, error: 'Invalid archive format' }
        }
      }
      return result
    }
  }
})
