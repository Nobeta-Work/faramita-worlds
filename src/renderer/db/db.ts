import Dexie, { type Table } from 'dexie'
import { WorldCard, ChronicleEntry, WorldStateDelta, TurnTrace, StoryMemoryAtom } from '@shared/Interface'

export interface EventLogEntry {
  id?: number
  timestamp: number
  category: string
  level: 'debug' | 'info' | 'warn' | 'error'
  code: string
  message: string
  context?: any
}

export class FaramitaDB extends Dexie {
  world_cards!: Table<WorldCard>
  chronicle!: Table<ChronicleEntry>
  world_state_log!: Table<WorldStateDelta>
  event_log!: Table<EventLogEntry>
  settings!: Table<{ key: string; value: any }>
  turn_trace!: Table<TurnTrace>
  story_memory!: Table<StoryMemoryAtom>

  constructor() {
    super('FaramitaWorldsDB')
    this.version(1).stores({
      world_cards: 'id, type, category',
      chronicle: '++id, turn, role, timestamp',
      settings: 'key'
    })

    this.version(2).stores({
      world_cards: 'id, type, category',
      chronicle: '++id, turn, role, timestamp',
      world_state_log: '++id, turn, timestamp, *cardIds',
      settings: 'key'
    })

    this.version(3).stores({
      world_cards: 'id, type, category',
      chronicle: '++id, turn, role, timestamp',
      world_state_log: '++id, turn, timestamp, *cardIds',
      event_log: '++id, timestamp, category, level, code',
      settings: 'key'
    })

    this.version(4).stores({
      world_cards: 'id, type, category',
      chronicle: '++id, turn, role, timestamp',
      world_state_log: '++id, turn, timestamp, *cardIds',
      event_log: '++id, timestamp, category, level, code',
      settings: 'key',
      turn_trace: '++id, turn, timestamp',
      story_memory: 'id, chapterId, importance, *entities, *locationHints'
    })
  }

  async clearAll() {
    await this.world_cards.clear()
    await this.chronicle.clear()
    await this.world_state_log.clear()
    await this.event_log.clear()
    await this.settings.clear()
    await this.turn_trace.clear()
    await this.story_memory.clear()
  }
}

export const db = new FaramitaDB()
