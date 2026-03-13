import { db } from './db'
import { WorldCard } from '@shared/Interface'
import { migrateWorldData } from './migrator'
import { validateAndNormalizeWorldCards } from '../core/WorldValidator'

const getLastWorldUuid = async (): Promise<string | null> => {
  const appConfig = await db.settings.get('app_config')
  if (appConfig?.value?.lastWorldUuid) {
    return appConfig.value.lastWorldUuid
  }

  const fallback = await db.settings.get('last_world_uuid')
  if (typeof fallback?.value === 'string' && fallback.value.trim()) {
    return fallback.value.trim()
  }

  return null
}

const loadTemplateData = async (fileName: string) => {
  const result = await window.api.loadWorldCards(fileName)
  if (!result.success || !result.content) {
    throw new Error(result.error || `加载模板失败: ${fileName}`)
  }

  const parsed = JSON.parse(result.content)
  return migrateWorldData(parsed)
}

const selectInitialTemplate = async () => {
  const preferredUuid = await getLastWorldUuid()
  const templateResult = await window.api.listWorldTemplates()

  if (!templateResult.success || !templateResult.files || templateResult.files.length === 0) {
    throw new Error(templateResult.error || '未找到可用模板文件')
  }

  let fallbackTemplate: { fileName: string; migrated: ReturnType<typeof migrateWorldData> } | null = null

  for (const fileName of templateResult.files) {
    try {
      const migrated = await loadTemplateData(fileName)
      if (!fallbackTemplate) {
        fallbackTemplate = { fileName, migrated }
      }

      const uuid = (migrated.data as any)?.world_meta?.uuid
      if (preferredUuid && uuid === preferredUuid) {
        return { fileName, migrated }
      }
    } catch (error) {
      console.warn(`[Importer] 跳过无效模板: ${fileName}`, error)
    }
  }

  if (fallbackTemplate) {
    return fallbackTemplate
  }

  throw new Error('所有模板均无法解析')
}

export async function importInitialData() {
  const cardCount = await db.world_cards.count()
  if (cardCount > 0) return // Already initialized

  if (typeof window === 'undefined' || !window.api) {
    throw new Error('Renderer API 不可用，无法初始化模板数据')
  }

  const { fileName, migrated } = await selectInitialTemplate()
  console.log(`Initializing database with template: ${fileName}`)

  if (migrated.report.changed) {
    console.log(`[Migrator] ${fileName} migrated to schema v${migrated.data.world_meta?.schema_version || 3}`, migrated.report.issues)
  }

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
  if (migrated.data.entries.setting_cards) {
    cards.push(...processCards(migrated.data.entries.setting_cards))
  }

  // Add chapter cards
  if (migrated.data.entries.chapter_cards) {
    cards.push(...processCards(migrated.data.entries.chapter_cards))
  }

  // Add character cards
  if (migrated.data.entries.character_cards) {
    cards.push(...processCards(migrated.data.entries.character_cards))
  }

  // Add interaction cards
  if (migrated.data.entries.interaction_cards) {
    cards.push(...processCards(migrated.data.entries.interaction_cards))
  }

  if (migrated.data.entries.custom_cards) {
    cards.push(...processCards(migrated.data.entries.custom_cards))
  }

  const validated = validateAndNormalizeWorldCards(cards)
  if (!validated.report.valid) {
    const firstError = validated.report.issues.find(issue => issue.level === 'error')
    throw new Error(firstError?.message || '初始化模板校验失败')
  }

  await db.world_cards.bulkAdd(validated.cards)
  
  await db.settings.put({ 
    key: 'world_meta', 
    value: migrated.data.world_meta 
  })

  await db.settings.put({
    key: 'last_world_uuid',
    value: migrated.data.world_meta.uuid
  })

  console.log('Database initialized successfully.')
}
