export interface WorldMeta {
  uuid: string // Unique identifier for the world
  name: string
  version: string
  author: string
  description: string
}

export interface Visibility {
  public_visible: boolean
  player_visible: boolean
  unlock_condition: string | null
  is_learned?: boolean
}

export interface BaseCard {
  id: string
  type: 'setting' | 'chapter' | 'character' | 'interaction' | 'custom'
  visible: Visibility
}

export interface SettingCard extends BaseCard {
  type: 'setting'
  category: 'background' | 'race' | 'level' | 'class' | 'rule'
  title?: string
  content?: string
  tags?: string[]
  base_range?: [number, number]
  scaling_modes?: Record<string, { step: number; prefix_names: string[] }>
  default_mode?: string
  step?: number
  suffix_names?: string[]
}

export interface PlotPoint {
  id: string
  title: string
  content: string
  secret_notes: string
}

export interface ChapterCard extends BaseCard {
  type: 'chapter'
  title: string
  summary?: string
  objective: string
  status: 'pending' | 'active' | 'completed'
  is_current: boolean
  plot_points: PlotPoint[]
  rewards?: string[]
  tags?: string[]
}

export interface Attributes {
  str: number
  dex: number
  con: number
  int: number
  wis: number
  cha: number
}

export interface InventoryItem {
  item: string
  description: string
  effect: string | null
}

export interface CharacterCard extends BaseCard {
  type: 'character'
  name: string
  prefix_name?: string
  race: string | string[]
  age: number
  gender: string
  class: string
  level: number
  affiliation: string[]
  status: string[]
  attributes: Attributes
  personality: string[] | null
  inventory: InventoryItem[] | null
  background: string[] | null
  tags: string[]
}

export interface InteractionCard extends BaseCard {
  type: 'interaction'
  name: string
  min_level: number
  element: string
  cost: string
  d20_logic: string | null
  effect: string
}

export interface CustomCard extends BaseCard {
  type: 'custom'
  category: string
  title: string
  content: string
  tags: string[]
}

export type WorldCard = SettingCard | ChapterCard | CharacterCard | InteractionCard | CustomCard

export interface ChronicleEntry {
  id?: number
  turn: number
  role: 'user' | 'assistant' | 'system'
  content: string // Display text or JSON string
  timestamp: number
  world_state_snapshot?: any
  metadata?: any // For storing structured AI response or interaction data
}

// AI Response Schema
export interface AIResponseSequence {
  type: 'environment' | 'dialogue'
  speaker_name?: string
  content: string
}

export interface AIResponseInteraction {
  needs_roll: boolean
  attribute?: string // Optional now
  dc?: number
  description?: string
}

export interface AIResponseWorldUpdate {
  action: 'CREATE' | 'UPDATE'
  type: 'character' | 'setting' | 'interaction' | 'chapter'
  target_id?: string
  data: any
}

export interface AIResponseActiveRole {
  add?: string[]
  delete?: string[]
}

export interface AIResponse {
  sequence: AIResponseSequence[]
  interaction?: AIResponseInteraction
  active_role?: AIResponseActiveRole
  world_updates?: AIResponseWorldUpdate[]
  needed_card_ids?: string[]
  active_role_suggestions?: string[]
}

// Save Archive Interface
export interface SaveArchive {
  world_meta: WorldMeta
  timestamp: number
  active_information: string[] // Active character IDs
  history: ChronicleEntry[]
}
