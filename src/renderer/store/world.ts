import { defineStore } from 'pinia'
import { toRaw } from 'vue'
import { db } from '../db/db'
import { WorldCard, WorldMeta } from '@shared/Interface'
import { useChronicleStore } from './chronicle'
import { migrateWorldData } from '../db/migrator'
import { validateAndNormalizeWorldCards } from '../core/WorldValidator'

export const useWorldStore = defineStore('world', {
  state: () => ({
    meta: null as WorldMeta | null,
    cards: [] as WorldCard[],
    activeCharacterIds: [] as string[],
    loading: false
  }),
  getters: {
    activeCharacters: (state) => {
      return state.cards.filter(c => 
        c.type === 'character' && state.activeCharacterIds.includes(c.id)
      ) as any[] // Type casting if needed, or rely on filter
    }
  },
  actions: {
    resolveDefaultPlayerId() {
      const configuredPlayerId = this.meta?.player_character_id
      if (configuredPlayerId) {
        const exists = this.cards.some(card => card.type === 'character' && card.id === configuredPlayerId)
        if (exists) return configuredPlayerId
      }

      const taggedPlayer = this.cards.find(card =>
        card.type === 'character' && Array.isArray((card as any).tags) && (card as any).tags.includes('player')
      )
      if (taggedPlayer) return taggedPlayer.id

      const firstCharacter = this.cards.find(card => card.type === 'character')
      return firstCharacter?.id || null
    },
    async loadWorld() {
      this.loading = true
      try {
        const metaRecord = await db.settings.get('world_meta')
        this.meta = metaRecord ? metaRecord.value : null
        this.cards = await db.world_cards.toArray()

        if (this.meta && ((this.meta as any).schema_version ?? 1) < 4) {
          const worldData = {
            world_meta: this.meta,
            entries: {
              setting_cards: this.cards.filter(c => c.type === 'setting'),
              chapter_cards: this.cards.filter(c => c.type === 'chapter'),
              character_cards: this.cards.filter(c => c.type === 'character'),
              interaction_cards: this.cards.filter(c => c.type === 'interaction'),
              custom_cards: this.cards.filter(c => c.type === 'custom')
            }
          }

          const migrated = migrateWorldData(worldData as any)
          if (migrated.report.changed) {
            const migratedCards = [
              ...(migrated.data.entries.setting_cards || []),
              ...(migrated.data.entries.chapter_cards || []),
              ...(migrated.data.entries.character_cards || []),
              ...(migrated.data.entries.interaction_cards || []),
              ...(migrated.data.entries.custom_cards || [])
            ] as WorldCard[]

            await db.world_cards.clear()
            if (migratedCards.length > 0) {
              await db.world_cards.bulkAdd(migratedCards)
            }
            await db.settings.put({ key: 'world_meta', value: migrated.data.world_meta })

            this.meta = migrated.data.world_meta as any
            this.cards = migratedCards
          }
        }
        
          // Load active characters from settings or default to player character
        const activeRecord = await db.settings.get('active_characters')
        if (activeRecord) {
           this.activeCharacterIds = activeRecord.value
        } else {
            const defaultPlayerId = this.resolveDefaultPlayerId()
            if (defaultPlayerId) {
             this.activeCharacterIds = [defaultPlayerId]
             await this.updateActiveCharacters([defaultPlayerId], [])
            } else {
             this.activeCharacterIds = []
             await db.settings.put({ key: 'active_characters', value: [] })
            }
        }
      } finally {
        this.loading = false
      }
    },
    async setActiveCharacters(ids: string[]) {
      this.activeCharacterIds = ids
      await db.settings.put({ key: 'active_characters', value: ids })
      
      // Auto-save archive when active characters change
      const chronicleStore = useChronicleStore()
      await chronicleStore.saveArchive()
    },
    async updateActiveCharacters(add: string[], remove: string[]) {
      const current = new Set(this.activeCharacterIds)
      add.forEach(id => current.add(id))
      remove.forEach(id => current.delete(id))
      this.activeCharacterIds = Array.from(current)
      // Fix DataCloneError by ensuring plain array via JSON serialization
      const plainIds = JSON.parse(JSON.stringify(this.activeCharacterIds))
      await db.settings.put({ key: 'active_characters', value: plainIds })
      
      // Auto-save archive when active characters change
      const chronicleStore = useChronicleStore()
      await chronicleStore.saveArchive()
    },
    async syncWithTemplate() {
      this.loading = true
      try {
        // 获取当前世界书的名称
        console.log('syncWithTemplate called, current meta:', this.meta)
        
        if (!this.meta || !this.meta.name) {
          // 尝试从数据库重新加载 meta
          const metaRecord = await db.settings.get('world_meta')
          if (metaRecord && metaRecord.value) {
            this.meta = metaRecord.value
            console.log('Reloaded meta from DB:', this.meta)
          } else {
            return { success: false, error: '未找到世界书元数据' }
          }
        }

        // 根据世界书名称加载对应的模板文件
        const templateFileName = `${this.meta!.name}.json`
        console.log('Loading template file:', templateFileName)
        
        const result = await (window as any).api.loadWorldCards(templateFileName)
        
        console.log('API result:', result.success, result.error)
        
        if (!result.success || !result.content) {
          return { success: false, error: `未找到模板文件: ${templateFileName}` }
        }

        const templateDataRaw = JSON.parse(result.content)
        const migratedTemplate = migrateWorldData(templateDataRaw)
        const templateData = migratedTemplate.data
        console.log('Template data loaded, world_meta:', templateData.world_meta)
        console.log('Template entries:', Object.keys(templateData.entries || {}))
        
        const existingCardsMap = new Map(this.cards.map(c => [c.id, c]))
        console.log('Current cards in store:', this.cards.length)
        console.log('Existing card IDs:', Array.from(existingCardsMap.keys()))
        const cardsToUpdate: WorldCard[] = []
        let addCount = 0
        let updateCount = 0
        
        const allTemplateCards = [
          ...(templateData.entries?.setting_cards || []),
          ...(templateData.entries?.chapter_cards || []),
          ...(templateData.entries?.character_cards || []),
          ...(templateData.entries?.interaction_cards || []),
          ...(templateData.entries?.custom_cards || [])
        ]
        
        console.log('Total template cards:', allTemplateCards.length)

        for (const card of allTemplateCards) {
          const existing = existingCardsMap.get(card.id)
          
          console.log(`Processing card ${card.id}, exists: ${!!existing}`)
          
          if (!existing) {
            // New card: Add with default visibility if missing
            const newCard = {
              ...card,
              visible: (card as any).visible || {
                public_visible: true,
                player_visible: true,
                unlock_condition: null
              }
            } as WorldCard
            cardsToUpdate.push(newCard)
            addCount++
          } else {
            // Existing card: Check if template data is different from DB data
            // We strip reactivity and compare plain objects
            const templateStr = JSON.stringify(card)
            const existingStr = JSON.stringify(existing)
            
            if (templateStr !== existingStr) {
              // Template has manual edits: Update DB to match Template
              cardsToUpdate.push(JSON.parse(templateStr))
              updateCount++
            }
          }
        }

        if (cardsToUpdate.length > 0) {
          const validated = validateAndNormalizeWorldCards(cardsToUpdate)
          if (!validated.report.valid) {
            const firstError = validated.report.issues.find(issue => issue.level === 'error')
            return { success: false, error: firstError?.message || '模板数据校验失败' }
          }

          // Use put to handle both new and existing items
          console.log('Updating database with', cardsToUpdate.length, 'cards')
          await db.world_cards.bulkPut(JSON.parse(JSON.stringify(validated.cards)))
          console.log('Database updated, reloading world')
          await this.loadWorld()
          console.log('World reloaded, new cards count:', this.cards.length)
          return { 
            success: true, 
            count: addCount, 
            updateCount: updateCount 
          }
        }
        console.log('No cards to update')
        return { success: true, count: 0, updateCount: 0 }
      } catch (error: any) {
        console.error('Sync failed:', error)
        return { success: false, error: error.message }
      } finally {
        this.loading = false
      }
    },
    async updateCard(card: WorldCard) {
      // DataCloneError deep fix: use toRaw and then JSON stringify to ensure absolute purity
      const rawCard = toRaw(card) as any
      
      // Ensure status exists for characters
      if (rawCard.type === 'character' && !rawCard.status) {
        rawCard.status = []
      }
      
      const validated = validateAndNormalizeWorldCards([rawCard])
      if (!validated.report.valid) {
        const firstError = validated.report.issues.find(issue => issue.level === 'error')
        throw new Error(firstError?.message || '卡片校验失败')
      }

      const plainCard = JSON.parse(JSON.stringify(validated.cards[0]))
      
      await db.world_cards.put(plainCard)
      const index = this.cards.findIndex(c => c.id === card.id)
      if (index !== -1) {
        this.cards[index] = plainCard
      } else {
        this.cards.push(plainCard)
      }
    },
    async deleteCard(id: string) {
      await db.world_cards.delete(id)
      this.cards = this.cards.filter(c => c.id !== id)
    },
    async addCard(card: WorldCard) {
      const rawCard = toRaw(card) as any
      
      // Ensure status exists for characters
      if (rawCard.type === 'character' && !rawCard.status) {
        rawCard.status = []
      }
      
      const validated = validateAndNormalizeWorldCards([rawCard])
      if (!validated.report.valid) {
        const firstError = validated.report.issues.find(issue => issue.level === 'error')
        throw new Error(firstError?.message || '卡片校验失败')
      }

      const plainCard = JSON.parse(JSON.stringify(validated.cards[0]))
      await db.world_cards.add(plainCard)
      this.cards.push(plainCard)
    },
    async setChapterActive(chapterId: string) {
      const updatedCards: WorldCard[] = []
      for (const card of this.cards) {
        if (card.type !== 'chapter') continue
        const chapter = card as any
        if (chapter.id === chapterId) {
          if (chapter.status !== 'active' || !chapter.is_current) {
            chapter.status = 'active'
            chapter.is_current = true
            updatedCards.push(card)
          }
        } else if (chapter.status === 'active' || chapter.is_current) {
          chapter.status = 'completed'
          chapter.is_current = false
          updatedCards.push(card)
        }
      }
      for (const card of updatedCards) {
        const plain = JSON.parse(JSON.stringify(toRaw(card)))
        await db.world_cards.put(plain)
      }
    },
    async setPlayerCharacterId(characterId: string | null) {
      if (!this.meta) return
      this.meta.player_character_id = characterId || undefined
      const plainMeta = JSON.parse(JSON.stringify(toRaw(this.meta)))
      await db.settings.put({ key: 'world_meta', value: plainMeta })
    },
    async saveToFile() {
      this.loading = true
      try {
        const metaRecord = await db.settings.get('world_meta')
        const meta = metaRecord ? metaRecord.value : this.meta
        const allCards = await db.world_cards.toArray()

        const data = {
          world_meta: meta,
          entries: {
            setting_cards: allCards.filter(c => c.type === 'setting'),
            chapter_cards: allCards.filter(c => c.type === 'chapter'),
            character_cards: allCards.filter(c => c.type === 'character'),
            interaction_cards: allCards.filter(c => c.type === 'interaction'),
            custom_cards: allCards.filter(c => c.type === 'custom')
          }
        }

        const result = await (window as any).api.saveWorldFile(
          JSON.stringify(data, null, 2),
          meta?.name,
          meta?.uuid
        )
        return result
      } finally {
        this.loading = false
      }
    },
    async exportWorld(mode: 'share' | 'runtime' = 'share') {
      const allCards = await db.world_cards.toArray()
      const meta = this.meta

      if (mode === 'share') {
        // Share mode: strip runtime_lore internal fields, keep human-editable data
        const cleanedCards = allCards.map(card => {
          const { runtime_lore, ...rest } = card as any
          return rest as WorldCard
        })
        return {
          world_meta: meta,
          entries: {
            setting_cards: cleanedCards.filter(c => c.type === 'setting'),
            chapter_cards: cleanedCards.filter(c => c.type === 'chapter'),
            character_cards: cleanedCards.filter(c => c.type === 'character'),
            interaction_cards: cleanedCards.filter(c => c.type === 'interaction'),
            custom_cards: cleanedCards.filter(c => c.type === 'custom')
          }
        }
      }

      // Runtime mode: include all data including runtime_lore
      return {
        world_meta: meta,
        entries: {
          setting_cards: allCards.filter(c => c.type === 'setting'),
          chapter_cards: allCards.filter(c => c.type === 'chapter'),
          character_cards: allCards.filter(c => c.type === 'character'),
          interaction_cards: allCards.filter(c => c.type === 'interaction'),
          custom_cards: allCards.filter(c => c.type === 'custom')
        }
      }
    },
    getRelatedCards(cardId: string): WorldCard[] {
      const card = this.cards.find(c => c.id === cardId)
      if (!card?.runtime_lore?.relation_refs?.length) return []
      const relatedIds = card.runtime_lore.relation_refs.map(r => r.target_id)
      return this.cards.filter(c => relatedIds.includes(c.id))
    },
    getRelationGraph(): Array<{ from: string; to: string; type: string; label?: string }> {
      const edges: Array<{ from: string; to: string; type: string; label?: string }> = []
      for (const card of this.cards) {
        const refs = card.runtime_lore?.relation_refs
        if (!refs?.length) continue
        for (const ref of refs) {
          edges.push({ from: card.id, to: ref.target_id, type: ref.type, label: ref.label })
        }
      }
      return edges
    }
  }
})
