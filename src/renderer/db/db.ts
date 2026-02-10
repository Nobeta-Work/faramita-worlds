import Dexie, { type Table } from 'dexie'
import { WorldCard, ChronicleEntry } from '@shared/Interface'

export class FaramitaDB extends Dexie {
  world_cards!: Table<WorldCard>
  chronicle!: Table<ChronicleEntry>
  settings!: Table<{ key: string; value: any }>

  constructor() {
    super('FaramitaWorldsDB')
    this.version(1).stores({
      world_cards: 'id, type, category',
      chronicle: '++id, turn, role, timestamp',
      settings: 'key'
    })
  }

  async clearAll() {
    await this.world_cards.clear()
    await this.chronicle.clear()
    await this.settings.clear()
  }
}

export const db = new FaramitaDB()
