export interface WorldMeta {
  uuid: string // Unique identifier for the world
  name: string
  version: string
  author: string
  description: string
  player_character_id?: string
  schema_version?: number
}

// ===== v0.2.0: TraitTag 系统 =====
export interface TraitTag {
  text: string
  type: 'strength' | 'flaw' | 'bond' | 'mark'
  source: 'origin' | 'story' | 'player'
  weight: 1 | 2 | 3
  active: boolean
}

export type JudgmentOutcome = 'full_success' | 'partial_success' | 'failure'
export type Difficulty = 'easy' | 'normal' | 'hard' | 'extreme'

export interface TagModifier {
  text: string
  weight: number
  positive: boolean
}

export interface RollResult {
  dice: [number, number]
  diceTotal: number
  tagModifier: number
  difficultyModifier: number
  finalResult: number
  outcome: JudgmentOutcome
  isCriticalSuccess?: boolean
  tags: TagModifier[]
  difficulty: Difficulty
}

export interface Visibility {
  public_visible: boolean
  player_visible: boolean
  unlock_condition: string | null
  is_learned?: boolean
}

// ===== v0.2.1: 运行时知识元信息 =====

export interface ActivationCondition {
  type: 'chapter' | 'active_character' | 'recent_mention' | 'world_state' | 'scene_mode'
  value: string | string[]
  lookback?: number
}

export interface RuntimeLoreMeta {
  entry_title?: string
  summary?: string
  activation?: {
    mode?: 'always' | 'keyword' | 'semantic' | 'hybrid'
    keys?: string[]
    regex_keys?: string[]
    conditions?: ActivationCondition[]
    filter_logic?: 'and_any' | 'and_all' | 'not_any' | 'not_all'
    scan_depth?: number
    case_sensitive?: boolean
    match_whole_word?: boolean
  }
  insertion?: {
    position?: 'system-prelude' | 'world-context' | 'chapter-context'
            | 'character-context' | 'author-note' | 'depth'
    depth?: number
    order?: number
    role?: 'system' | 'user' | 'assistant'
    outlet?: string
  }
  budgeting?: {
    reserved_tokens?: number
    max_tokens?: number
    trim_direction?: 'head' | 'tail' | 'none'
  }
  timed_effect?: {
    sticky?: number
    cooldown?: number
    delay?: number
  }
  grouping?: {
    inclusion_groups?: string[]
    priority_mode?: 'weight' | 'deterministic'
    group_weight?: number
  }
  content_layers?: {
    player?: string
    gm?: string
    ai_summary?: string
  }
  visibility_scope?: {
    gm_only?: boolean
    player_visible?: boolean
    hidden_from_export?: boolean
  }
  quality_score?: number
  relation_refs?: Array<{
    target_id: string
    type: 'belongs_to' | 'located_at' | 'allies_with' | 'owns' | 'related_to' | string
    label?: string
  }>
}

export interface BaseCard {
  id: string
  type: 'setting' | 'chapter' | 'character' | 'interaction' | 'custom'
  visible: Visibility
  // ===== v0.2.0 新增 =====
  activation_keywords?: string[]
  activation_priority?: number
  always_active?: boolean
  timed_effect?: {
    sticky?: number
    cooldown?: number
  }
  // ===== v0.2.1 新增 =====
  runtime_lore?: RuntimeLoreMeta
}

export interface SettingCard extends BaseCard {
  type: 'setting'
  category: 'background' | 'race' | 'level' | 'class' | 'rule'
         | 'location' | 'faction' | 'item' | 'lore' | 'skill'
         | string
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
  // ===== v0.2.1 新增 =====
  default_active_entities?: string[]
  chapter_memory_summary?: string
  entrance_conditions?: string
  exit_conditions?: string
  risk_level?: 'low' | 'medium' | 'high'
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

export interface VoiceProfile {
  tone: string
  vocabulary_level: '典雅' | '口语化' | '粗犷' | '学术'
  speech_patterns: string[]
  emotional_range: string
  example_dialogues: string[]
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
  traits?: TraitTag[]
  /** @deprecated 迁移期保留，迁移完成后删除 */
  attributes?: Attributes
  personality: string[] | null
  inventory: InventoryItem[] | null
  background: string[] | null
  tags: string[]
  voice_profile?: VoiceProfile | null
  // ===== v0.2.1 新增 =====
  aliases?: string[]
  narrative_role?: 'protagonist' | 'major_npc' | 'background'
  relationship_refs?: Array<{
    target_id: string
    type: 'ally' | 'enemy' | 'neutral' | 'family' | 'mentor' | string
    label?: string
  }>
  scene_presence_rules?: string[]
}

export interface InteractionCard extends BaseCard {
  type: 'interaction'
  name: string
  description: string
  related_tags?: string[]
  difficulty: Difficulty
  prerequisite_tags?: string[]
  cost?: string
  // ===== 迁移期保留（标注 @deprecated）=====
  /** @deprecated */ d20_logic?: string | null
  /** @deprecated */ min_level?: number
  /** @deprecated */ element?: string
  /** @deprecated */ effect?: string
  // ===== v0.2.1 新增 =====
  trigger_contexts?: string[]
  suggested_costs?: string[]
  failure_escalations?: string[]
  related_entities?: string[]
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
  description?: string
  relevant_tags?: TagModifier[]
  difficulty?: Difficulty
  // ===== 迁移期保留 =====
  /** @deprecated */ attribute?: string
  /** @deprecated */ dc?: number
}

export interface AIResponseWorldUpdate {
  action: 'CREATE' | 'UPDATE'
  type: 'character' | 'setting' | 'interaction' | 'chapter'
  target_id?: string
  data: any
}

export interface AIResponse {
  sequence: AIResponseSequence[]
  interaction?: AIResponseInteraction
  active_role?: string[]
  world_updates?: AIResponseWorldUpdate[]
  needed_card_ids?: string[]
  active_role_suggestions?: string[]
  suggestions?: string[]
}

// Save Archive Interface
export interface SaveArchive {
  world_meta: WorldMeta
  timestamp: number
  active_information: string[] // Active character IDs
  history: ChronicleEntry[]
}

export interface WorldStateChange {
  cardId: string
  field: string
  oldValue: any
  newValue: any
}

export interface WorldStateDelta {
  id?: number
  turn: number
  timestamp: number
  cardIds: string[]
  changes: WorldStateChange[]
}

export interface ConflictIssue {
  severity: 'critical' | 'major' | 'minor'
  code: string
  message: string
  cardId?: string
  turn?: number
}

export interface ConflictReport {
  issues: ConflictIssue[]
  summary: {
    critical: number
    major: number
    minor: number
  }
}

// ============================================================
// AI Skill Pipeline Types
// ============================================================

/** Phases in the Skill Pipeline execution order */
export type SkillPhase =
  | 'context-assembly'
  | 'discovery'
  | 'pre-narrative'
  | 'narrative'
  | 'post-narrative'

/** Ordered list of phases for pipeline execution */
export const SKILL_PHASE_ORDER: SkillPhase[] = [
  'context-assembly',
  'discovery',
  'pre-narrative',
  'narrative',
  'post-narrative'
]

/** Log level for skill execution events */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type MemoryLayer = ShortTermMemory | LongTermMemory | WorldStateSnapshot

export interface ShortTermMemory {
  type: 'short-term'
  entries: ChronicleEntry[]
  windowSize: number
}

export interface LongTermMemory {
  type: 'long-term'
  chapterId: string
  summary: string
  timestamp: number
}

export interface WorldStateSnapshot {
  type: 'world-snapshot'
  activeChapterId: string | null
  activeCharacterIds: string[]
  activeSettingIds: string[]
  summary: string
  delta: Record<string, any>
  timestamp: number
}

export interface MemoryManagerConfig {
  shortTermWindowSize: number
  summarizationThreshold: number
  tokenBudget: number
}

/** A single log entry produced during skill execution */
export interface SkillLogEntry {
  timestamp: number
  level: LogLevel
  skillId: string
  phase: SkillPhase | 'standalone'
  message: string
  data?: any
}

/** Shared context passed through the entire pipeline for one turn */
export interface SkillContext {
  // --- Input ---
  userPrompt: string
  history: ChronicleEntry[]
  activeCharacterIds: string[]

  // --- Accumulated State (populated by skills) ---
  /** Assembled context text from MemoryManagerSkill */
  assembledContext: string
  /** 分层记忆对象（由 MemoryManagerSkill 注入） */
  memoryLayers?: {
    shortTerm?: ShortTermMemory
    longTerm?: LongTermMemory[]
    worldSnapshot?: WorldStateSnapshot
  }
  /** Card IDs identified by CardRelevanceSkill */
  neededCardIds: string[]
  /** Role suggestions from discovery */
  activeRoleSuggestions: string[]
  /** Named prompt fragments injected by various skills (key → text) */
  promptFragments: Record<string, string>
  /** The final AI response parsed by CoreNarrativeSkill */
  aiResponse: AIResponse | null
  /** Raw AI response text */
  rawResponseText: string

  // --- Pipeline Metadata ---
  /** Logs collected during execution */
  logs: SkillLogEntry[]
  /** Warnings (non-fatal) */
  warnings: string[]
  /** Per-skill result stash (skillId → arbitrary data) */
  skillOutputs: Record<string, any>

  // --- Streaming callback (set by pipeline consumer) ---
  onStreamToken?: (token: string) => void
  onStatusUpdate?: (status: string) => void

  // --- v0.2.1: Agent Workflow 扩展 ---
  turnTrace?: TurnTrace
  contextPackage?: ContextPackage
  retrievalBudget?: number
  reviewDecision?: 'commit' | 'defer-commit'
}

/** Result returned by each skill's execute() */
export interface SkillResult {
  success: boolean
  /** Data to merge into SkillContext.skillOutputs[skill.id] */
  data?: any
  /** Non-fatal warnings */
  warnings?: string[]
  /** If success=false, error message */
  error?: string
}

/** Persistent configuration for a single skill */
export interface SkillConfig {
  enabled: boolean
  priority: number
  /** Skill-specific params (e.g. temperature, retryCount) */
  params: Record<string, any>
}

/** Definition of an AI Skill module */
export interface AISkill {
  /** Unique identifier, e.g. 'card-relevance' */
  id: string
  /** Human-readable name */
  name: string
  /** Pipeline phase this skill belongs to */
  phase: SkillPhase | 'standalone'
  /** Default priority (lower = earlier). Can be overridden via SkillConfig. */
  defaultPriority: number
  /** Description shown in settings panel */
  description: string

  /**
   * Main execution function. Receives the shared context, performs work,
   * and returns a SkillResult. May mutate ctx (e.g. append to promptFragments).
   */
  execute(ctx: SkillContext): Promise<SkillResult>

  /**
   * Optional fallback when execute() throws or returns success=false.
   * If fallback also fails, the skill is skipped with a warning.
   */
  fallback?(error: Error, ctx: SkillContext): Promise<SkillResult>
}

/** The final result of a full pipeline execution */
export interface PipelineResult {
  success: boolean
  aiResponse: AIResponse | null
  rawResponseText: string
  logs: SkillLogEntry[]
  warnings: string[]
  errors: string[]
  /** Per-skill outputs */
  skillOutputs: Record<string, any>
  // v0.2.1
  turnTrace?: TurnTrace
}

// ============================================================
// v0.2.1: Agent Workflow 阶段产物
// ============================================================

export interface TurnPlan {
  intent: string
  sceneMode: 'normal' | 'exploration' | 'social' | 'conflict'
  riskLevel: 'low' | 'medium' | 'high'
  focusEntities: string[]
}

export interface RetrievalTrace {
  activatedCardIds: string[]
  rejectedCardIds: string[]
  reasons: Record<string, string>
  totalTokenCost: number
  budgetLimit: number
}

export interface PromptDirectivePack {
  voiceConstraints: string[]
  conflictWarnings: string[]
  sceneRules: string[]
  bannedMoves: string[]
}

export interface NarrativeTrace {
  rawLength: number
  repairCount: number
  responseValid: boolean
}

export interface ReviewTrace {
  conflicts: string[]
  warnings: string[]
  commitSafe: boolean
}

export interface TurnTrace {
  turn: number
  planner?: TurnPlan
  retrieval?: RetrievalTrace
  directives?: PromptDirectivePack
  narrative?: NarrativeTrace
  review?: ReviewTrace
}

// ============================================================
// v0.2.1: 检索型故事记忆
// ============================================================

export interface StoryMemoryAtom {
  id: string
  chapterId?: string
  summary: string
  entities: string[]
  locationHints: string[]
  sourceTurns: number[]
  importance: number
  emotionalTone?: string
  embedding?: number[]
}

// ============================================================
// v0.2.1: 上下文包
// ============================================================

export interface ContextPackage {
  memoryLayers: MemoryLayer[]
  activatedCards: WorldCard[]
  retrievalTrace: RetrievalTrace | null
  directives: PromptDirectivePack | null
  totalTokens: number
}

// ============================================================
// v0.2.1: 导入增强结果
// ============================================================

export interface EnhancedWorldbookImportResult {
  cards: WorldCard[]
  relations: Array<{
    from: string
    to: string
    type: string
    confidence: number
  }>
  activationSuggestions: Array<{
    cardId: string
    keys: string[]
    regexKeys?: string[]
    mode: 'keyword' | 'hybrid'
    rationale: string
  }>
  conflicts: Array<{
    cardId?: string
    level: 'error' | 'warning'
    message: string
  }>
  repairHints: string[]
}
