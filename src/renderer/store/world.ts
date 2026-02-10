import { defineStore } from 'pinia'
import { toRaw } from 'vue'
import { db } from '../db/db'
import { WorldCard, WorldMeta } from '@shared/Interface'

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
    async loadWorld() {
      this.loading = true
      try {
        const metaRecord = await db.settings.get('world_meta')
        this.meta = metaRecord ? metaRecord.value : null
        this.cards = await db.world_cards.toArray()
        
        // Load active characters from settings or default to only Player (char-001)
        const activeRecord = await db.settings.get('active_characters')
        if (activeRecord) {
           this.activeCharacterIds = activeRecord.value
        } else {
           // Default: Only player is active initially
           this.activeCharacterIds = ['char-001']
           await this.updateActiveCharacters(['char-001'], [])
        }
      } finally {
        this.loading = false
      }
    },
    async setActiveCharacters(ids: string[]) {
      this.activeCharacterIds = ids
      await db.settings.put({ key: 'active_characters', value: ids })
    },
    async updateActiveCharacters(add: string[], remove: string[]) {
      const current = new Set(this.activeCharacterIds)
      add.forEach(id => current.add(id))
      remove.forEach(id => current.delete(id))
      this.activeCharacterIds = Array.from(current)
      // Fix DataCloneError by ensuring plain array via JSON serialization
      const plainIds = JSON.parse(JSON.stringify(this.activeCharacterIds))
      await db.settings.put({ key: 'active_characters', value: plainIds })
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

        const templateData = JSON.parse(result.content)
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
          ...(templateData.entries?.interaction_cards || [])
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
          // Use put to handle both new and existing items
          console.log('Updating database with', cardsToUpdate.length, 'cards')
          await db.world_cards.bulkPut(JSON.parse(JSON.stringify(cardsToUpdate)))
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
      
      const plainCard = JSON.parse(JSON.stringify(rawCard))
      
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
      
      const plainCard = JSON.parse(JSON.stringify(rawCard))
      await db.world_cards.add(plainCard)
      this.cards.push(plainCard)
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
            interaction_cards: allCards.filter(c => c.type === 'interaction')
          }
        }

        const result = await (window as any).api.saveWorldFile(JSON.stringify(data, null, 2))
        return result
      } finally {
        this.loading = false
      }
    }
  }
})
