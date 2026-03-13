import { defineStore } from 'pinia'
import { toRaw } from 'vue'
import { db } from '../db/db'
import { ChronicleEntry, AIResponseInteraction, WorldStateDelta, ConflictReport, RollResult, TurnTrace, ContextPackage, AIResponseWorldUpdate } from '@shared/Interface'
import { SkillPipeline } from '../core/SkillPipeline'
import { useConfigStore } from './config'
import { useWorldStore } from './world'

export const useChronicleStore = defineStore('chronicle', {
  state: () => ({
    history: [] as ChronicleEntry[],
    isStreaming: false, 
    currentStreamText: '',
    parsedStreamSequence: [] as any[], // For incremental typing
    pendingInteraction: null as AIResponseInteraction | null,
    isWaitingForRoll: false,
    recentWorldStateDeltas: [] as WorldStateDelta[],
    latestConflictReport: null as ConflictReport | null,
    jumpTargetCardId: null as string | null,
    jumpRequestTick: 0,
    latestSuggestions: [] as string[],
    latestTurnTrace: null as TurnTrace | null,
    currentContextPackage: null as ContextPackage | null,
    pendingWorldUpdateProposal: null as AIResponseWorldUpdate[] | null,
    currentReviewDecision: null as 'commit' | 'defer-commit' | null
  }),
  actions: {
    async loadHistory() {
      this.history = await db.chronicle.orderBy('turn').toArray()
      await this.refreshWorldStatePanelData()
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
      if (!interaction.needs_roll) {
        this.isWaitingForRoll = false
        this.pendingInteraction = null
        return
      }

      const VALID_DIFFICULTIES = ['easy', 'normal', 'hard', 'extreme']
      const hasValidDifficulty = typeof interaction.difficulty === 'string' && VALID_DIFFICULTIES.includes(interaction.difficulty)
      const hasDescription = typeof interaction.description === 'string' && interaction.description.trim().length > 0

      if (!hasValidDifficulty || !hasDescription) {
        void this.addEntry({
          turn: this.history.length + 1,
          role: 'system',
          content: '[System] 判定请求格式不完整（缺少 difficulty 或 description），已阻断本次投掷。',
          timestamp: Date.now()
        })
        this.isWaitingForRoll = false
        this.pendingInteraction = null
        return
      }
      
      this.pendingInteraction = interaction
      this.isWaitingForRoll = true
      
      const DIFF_LABELS: Record<string, string> = { easy: '简单', normal: '普通', hard: '困难', extreme: '极难' }
      const DIFF_MODS: Record<string, number> = { easy: 2, normal: 0, hard: -2, extreme: -4 }
      const diff = interaction.difficulty || 'normal'
      const tagMod = (interaction.relevant_tags || []).reduce((s, t) => s + (t.positive ? t.weight : -t.weight), 0)
      const diffMod = DIFF_MODS[diff] ?? 0
      const totalMod = tagMod + diffMod
      const needPartial = 6 - totalMod
      const needFull = 9 - totalMod
      const diffLabel = DIFF_LABELS[diff] || diff
      const systemMsg = `[DICE] ${interaction.description || 'Action'} | ${diffLabel} | 🎯 ≥${needPartial}部成 ≥${needFull}全成 | 12=大成功`
      
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
      // Clear suggestions when user sends a message
      this.latestSuggestions = []

      // 1. Add User Entry
      await this.addEntry({
        turn: this.history.length + 1,
        role: 'user',
        content,
        timestamp: Date.now()
      })

      await this._generateAIResponse()
    },

    async resolveInteraction(rollResult: RollResult) {
      if (!this.pendingInteraction) return

      const OUTCOME_CN: Record<string, string> = {
        full_success: '✅完全成功', partial_success: '⚠️部分成功', failure: '❌失败'
      }
      const outcomeText = rollResult.isCriticalSuccess ? '🌟大成功' : (OUTCOME_CN[rollResult.outcome] || rollResult.outcome)
      const totalMod = rollResult.tagModifier + rollResult.difficultyModifier
      const modLabel = totalMod >= 0 ? `+${totalMod}` : `${totalMod}`
      const rollResultMsg = `[ROLL_RESULT] 2d6=${rollResult.diceTotal}(${modLabel})=${rollResult.finalResult} ${outcomeText}`

      if (this.history.length > 0) {
        const lastEntry = this.history[this.history.length - 1]
        if (lastEntry.role === 'system' && lastEntry.content.startsWith('[DICE]')) {
          if (lastEntry.id) {
            await db.chronicle.delete(lastEntry.id)
          }
          this.history.pop()
        }
      }

      await this.addEntry({
        turn: this.history.length + 1,
        role: 'system',
        content: rollResultMsg,
        timestamp: Date.now()
      })

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
        // Prepare history — exclude the last entry if it's the user message we just added
        const lastEntry = this.history[this.history.length - 1]
        let userPrompt = ''
        let historyToPass = this.history

        if (lastEntry?.role === 'user') {
          userPrompt = lastEntry.content
          historyToPass = this.history.slice(0, -1)
        }

        const activeIds = worldStore.activeCharacterIds

        // Inject conflict warnings from previous turn into the next prompt
        const initialPromptFragments: Record<string, string> = {}
        if (this.latestConflictReport?.issues?.length) {
          initialPromptFragments['conflict_warnings'] = this.latestConflictReport.issues
            .map(i => `[${i.severity}] ${i.message}`)
            .join('\n')
        }

        // Execute the Skill Pipeline
        const result = await SkillPipeline.executePipeline(
          userPrompt,
          historyToPass,
          activeIds,
          {
            onStreamToken: () => {},
            onStatusUpdate: (status) => {
              this.currentStreamText = status
            },
            initialPromptFragments
          }
        )

        // Cache turnTrace and review decision
        if (result.turnTrace) {
          this.latestTurnTrace = result.turnTrace
          // Determine review decision from turnTrace
          const deferCommit = (result.turnTrace.review && !result.turnTrace.review.commitSafe) ||
            (result.turnTrace.planner?.riskLevel === 'high') ||
            (result.aiResponse?.world_updates && result.aiResponse.world_updates.length > 5)
          this.currentReviewDecision = deferCommit ? 'defer-commit' : 'commit'
          // Persist turnTrace to db
          db.turn_trace.add({
            turn: result.turnTrace.turn,
            timestamp: Date.now(),
            trace: JSON.parse(JSON.stringify(result.turnTrace))
          }).catch(e => console.warn('Failed to persist turnTrace:', e))
        }

        this.currentStreamText = ''
        this.isStreaming = false

        const response = result.aiResponse

        // Cache pending world update proposal for defer-commit review
        if (this.currentReviewDecision === 'defer-commit' && response?.world_updates?.length) {
          this.pendingWorldUpdateProposal = response.world_updates
        } else {
          this.pendingWorldUpdateProposal = null
        }

        if (response) {
          // Process notifications from all skills
          const allNotifications: string[] = []
          Object.values(result.skillOutputs).forEach((payload: any) => {
            if (payload?.notifications && Array.isArray(payload.notifications)) {
              allNotifications.push(...payload.notifications)
            }
          })

          for (const note of allNotifications) {
            await this.addEntry({
              turn: this.history.length + 1,
              role: 'system',
              content: `[System] ${note}`,
              timestamp: Date.now()
            })
          }

          const trackerPayload = result.skillOutputs['world-state-tracker']
          if (trackerPayload?.deltas && Array.isArray(trackerPayload.deltas)) {
            this.recentWorldStateDeltas = trackerPayload.deltas
          } else {
            await this.refreshWorldStatePanelData()
          }

          const conflictPayload = result.skillOutputs['conflict-detection']
          if (conflictPayload?.report) {
            this.latestConflictReport = conflictPayload.report
          }

          // Add assistant entry (stored as JSON string)
          await this.addEntry({
            turn: this.history.length + 1,
            role: 'assistant',
            content: JSON.stringify(response),
            timestamp: Date.now()
          })

          // Handle interaction — InteractionCalibrationSkill already calibrated needs_roll
          if (response.interaction && response.interaction.needs_roll) {
            this.setInteraction(response.interaction)
          }

          // Store suggestions for UI display
          if (response.suggestions && Array.isArray(response.suggestions) && response.suggestions.length > 0) {
            this.latestSuggestions = response.suggestions.slice(0, 3)
          } else {
            this.latestSuggestions = []
          }
        } else {
          // Pipeline produced no response
          console.error('Pipeline produced no AI response')
          await this.addEntry({
            turn: this.history.length + 1,
            role: 'assistant',
            content: JSON.stringify({
              sequence: [{ type: 'environment', content: result.rawResponseText || '[No response]' }]
            }),
            timestamp: Date.now()
          })
        }

        // Log pipeline warnings/errors for debugging
        if (result.warnings.length > 0) {
          console.warn('[Pipeline Warnings]', result.warnings)
        }
        if (result.errors.length > 0) {
          console.error('[Pipeline Errors]', result.errors)
        }

      } catch (error) {
        console.error('AI Processing Error:', error)
        this.isStreaming = false
        this.currentStreamText = ''
      }
    },
    async refreshWorldStatePanelData() {
      const deltas = await db.world_state_log.orderBy('turn').reverse().limit(5).toArray()
      this.recentWorldStateDeltas = deltas
    },
    requestOpenCard(cardId: string) {
      this.jumpTargetCardId = cardId
      this.jumpRequestTick = Date.now()
    },
    clearOpenCardRequest() {
      this.jumpTargetCardId = null
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
