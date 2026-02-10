import { db } from './db'
import oortData from '../../world_template/Oort.json'
import { WorldCard } from '@shared/Interface'

export async function importInitialData() {
  const cardCount = await db.world_cards.count()
  if (cardCount > 0) return // Already initialized

  console.log('Initializing database with Oort.json...')

  const cards: WorldCard[] = []

  const processCards = (data: any[]) => {
    return data.map(card => ({
      ...card,
      visible: card.visible || {
        public_visible: true,
        player_visible: true,
        unlock_condition: null
      }
    }))
  }

  // Add setting cards
  if (oortData.entries.setting_cards) {
    cards.push(...processCards(oortData.entries.setting_cards))
  }

  // Add chapter cards
  if (oortData.entries.chapter_cards) {
    cards.push(...processCards(oortData.entries.chapter_cards))
  }

  // Add character cards
  if (oortData.entries.character_cards) {
    cards.push(...processCards(oortData.entries.character_cards))
  }

  // Add interaction cards
  if (oortData.entries.interaction_cards) {
    cards.push(...processCards(oortData.entries.interaction_cards))
  }

  await db.world_cards.bulkAdd(cards)
  
  await db.settings.put({ 
    key: 'world_meta', 
    value: oortData.world_meta 
  })

  console.log('Database initialized successfully.')
}
