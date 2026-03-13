<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useWorldStore } from '../store/world'
import { useChronicleStore } from '../store/chronicle'
import { db } from '../db/db'
import { migrateWorldData } from '../db/migrator'
import { validateAndNormalizeWorldCards } from '../core/WorldValidator'
import CardBrowser from '../components/CardBrowser.vue'
import WorldSelector from '../components/WorldSelector.vue'
import WorldExporter from '../components/WorldExporter.vue'
import { Plus, Trash2, FolderOpen } from 'lucide-vue-next'
import { WorldCard } from '@shared/Interface'

const emit = defineEmits<{
  (e: 'open-import-wizard'): void
}>()

const worldStore = useWorldStore()
const chronicleStore = useChronicleStore()

const viewMode = ref<'cards' | 'worldbook'>('cards')

const isCardsView = computed(() => viewMode.value === 'cards')
const isWorldbookView = computed(() => viewMode.value === 'worldbook')

const categories = ref([
  { id: 'character', name: '人物卡', isCore: true, type: 'character' },
  { id: 'chapter', name: '章节卡', isCore: true, type: 'chapter' },
  { id: 'setting', name: '设定卡', isCore: true, type: 'setting' },
  { id: 'interaction', name: '交互卡', isCore: true, type: 'interaction' }
])

const activeCategory = ref('character')
const searchQuery = ref('')
const activeSettingCategory = ref('all')
const editingCard = ref<WorldCard | null>(null)
const statusMsg = ref('')
const statusType = ref<'success' | 'error' | ''>('success')

const showStatus = (msg: string, type: 'success' | 'error' = 'success') => {
  statusMsg.value = msg
  statusType.value = type
  setTimeout(() => {
    statusMsg.value = ''
  }, 3000)
}

// Persistence for Manager state
onMounted(async () => {
  const savedCat = localStorage.getItem('faramita_manager_category')
  if (savedCat) activeCategory.value = savedCat
  
  const savedSettingCat = localStorage.getItem('faramita_manager_setting_category')
  if (savedSettingCat) activeSettingCategory.value = savedSettingCat

  // Load custom categories
  const savedCustomCats = JSON.parse(localStorage.getItem('faramita_custom_categories') || '[]')
  savedCustomCats.forEach((catName: string) => {
    if (!categories.value.find(c => c.id === catName)) {
      categories.value.push({ id: catName, name: catName, isCore: false, type: 'custom' })
    }
  })
  
  // Scan existing cards for any missed custom categories
  worldStore.cards.forEach(card => {
    if (card.type === 'custom') {
       const catName = (card as any).category
       if (catName && !categories.value.find(c => c.id === catName)) {
         categories.value.push({ id: catName, name: catName, isCore: false, type: 'custom' })
       }
    }
  })
  
  // Load template files
  await loadTemplateFiles()
})

const saveCustomCategories = () => {
  const custom = categories.value.filter(c => !c.isCore).map(c => c.id)
  localStorage.setItem('faramita_custom_categories', JSON.stringify(custom))
}

const showAddCategoryModal = ref(false)
const newCategoryName = ref('')

const handleAddCategory = () => {
  newCategoryName.value = ''
  showAddCategoryModal.value = true
}

const confirmAddCategory = () => {
  const name = newCategoryName.value.trim()
  if (name) {
    if (categories.value.find(c => c.id === name)) {
      showStatus('该分类已存在', 'error')
      return
    }
    categories.value.push({ id: name, name: name, isCore: false, type: 'custom' })
    saveCustomCategories()
    activeCategory.value = name
    showAddCategoryModal.value = false
  }
}

const handleDeleteCategory = (catId: string) => {
  if (confirm(`确定要删除分类“${catId}”吗？这将不会删除其中的卡片，但分类入口将移除。`)) {
    categories.value = categories.value.filter(c => c.id !== catId)
    saveCustomCategories()
    if (activeCategory.value === catId) {
      activeCategory.value = 'character'
    }
  }
}

watch(activeCategory, (newVal) => {
  localStorage.setItem('faramita_manager_category', newVal)
})

watch(activeSettingCategory, (newVal) => {
  localStorage.setItem('faramita_manager_setting_category', newVal)
})

watch(
  () => chronicleStore.jumpRequestTick,
  async () => {
    const cardId = chronicleStore.jumpTargetCardId
    if (!cardId) return

    let card = worldStore.cards.find((item) => item.id === cardId)
    if (!card) {
      await worldStore.loadWorld()
      card = worldStore.cards.find((item) => item.id === cardId)
    }

    if (!card) {
      showStatus(`未找到冲突关联卡片：${cardId}`, 'error')
      chronicleStore.clearOpenCardRequest()
      return
    }

    if (card.type === 'custom') {
      activeCategory.value = (card as any).category || 'custom'
      if (!categories.value.find((c) => c.id === activeCategory.value)) {
        categories.value.push({
          id: activeCategory.value,
          name: activeCategory.value,
          isCore: false,
          type: 'custom'
        })
      }
    } else {
      activeCategory.value = card.type
    }

    viewMode.value = 'cards'
    editingCard.value = JSON.parse(JSON.stringify(card))
    showStatus(`已跳转到冲突卡片：${card.id}`)
    chronicleStore.clearOpenCardRequest()
  }
)

const settingCategories = [
  { id: 'all', name: '全部' },
  { id: 'background', name: '背景故事' },
  { id: 'race', name: '种族' },
  { id: 'class', name: '职业' },
  { id: 'level', name: '等级位阶' },
  { id: 'world', name: '地理/世界' },
  { id: 'rule', name: '规则' }
]

const filteredCards = computed(() => {
  const query = searchQuery.value.toLowerCase()
  const activeCatDef = categories.value.find(c => c.id === activeCategory.value)
  
  let cards: WorldCard[] = []
  
  if (activeCatDef?.isCore) {
    cards = worldStore.cards.filter(c => c.type === activeCatDef.type)
  } else {
    cards = worldStore.cards.filter(c => c.type === 'custom' && (c as any).category === activeCategory.value)
  }
  
  // Secondary filter for settings
  if (activeCategory.value === 'setting' && activeSettingCategory.value !== 'all') {
    cards = cards.filter(c => {
      const cardCat = (c as any).category
      // Special case: 'rule' was being filtered out or misidentified
      return cardCat === activeSettingCategory.value
    })
  }

  return cards.filter(c => {
    // Check main fields
    const searchStr = `${(c as any).name || ''} ${(c as any).title || ''} ${c.id} ${(c as any).category || ''}`.toLowerCase()
    if (searchStr.includes(query)) return true
    
    // Check nested content/tags for deeper search
    if ((c as any).content?.toLowerCase().includes(query)) return true
    if ((c as any).tags?.some((t: string) => t.toLowerCase().includes(query))) return true
    
    return false
  })
})

const handleEdit = (card: WorldCard) => {
  viewMode.value = 'cards'
  editingCard.value = JSON.parse(JSON.stringify(card))
  showStatus(`已打开编辑：${card.id}`)
}

const handleDelete = async (id: string) => {
  if (confirm('确定要删除这张卡片吗？')) {
    try {
      await worldStore.deleteCard(id)
      if (editingCard.value?.id === id) {
        editingCard.value = null
      }
      showStatus('卡片删除成功')
    } catch (error: any) {
      showStatus(`删除失败: ${error.message}`, 'error')
    }
  }
}

const handleBatchDelete = async (ids: string[]) => {
  try {
    for (const id of ids) {
      await worldStore.deleteCard(id)
      if (editingCard.value?.id === id) {
        editingCard.value = null
      }
    }
    const result = await worldStore.saveToFile()
    if (result.success) {
      showStatus(`已批量删除 ${ids.length} 张卡片`)
    } else {
      showStatus(`删除后保存失败: ${result.error}`, 'error')
    }
  } catch (error: any) {
    showStatus(`批量删除失败: ${error.message}`, 'error')
  }
}

const handleBatchSetAlwaysActive = async (ids: string[], value: boolean) => {
  try {
    for (const id of ids) {
      const card = worldStore.cards.find(c => c.id === id)
      if (card) {
        (card as any).always_active = value
        await worldStore.updateCard(card)
      }
    }
    const result = await worldStore.saveToFile()
    if (result.success) {
      showStatus(`已${value ? '设为常驻' : '取消常驻'} ${ids.length} 张卡片`)
    }
  } catch (error: any) {
    showStatus(`批量操作失败: ${error.message}`, 'error')
  }
}

const handleBatchSetPriority = async (ids: string[], priority: number) => {
  try {
    for (const id of ids) {
      const card = worldStore.cards.find(c => c.id === id)
      if (card) {
        (card as any).priority = priority
        await worldStore.updateCard(card)
      }
    }
    const result = await worldStore.saveToFile()
    if (result.success) {
      showStatus(`已设置 ${ids.length} 张卡片优先级为 ${priority}`)
    }
  } catch (error: any) {
    showStatus(`批量操作失败: ${error.message}`, 'error')
  }
}

const generateSmartId = (type: string) => {
  const prefix = type === 'character' ? 'char-' : `${type}-`
  const existingIds = worldStore.cards
    .filter(c => c.id.startsWith(prefix))
    .map(c => {
      const numPart = c.id.replace(prefix, '')
      return parseInt(numPart)
    })
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b)
  
  let nextNum = 1
  for (const num of existingIds) {
    if (num === nextNum) {
      nextNum++
    } else if (num > nextNum) {
      break
    }
  }
  
  return `${prefix}${nextNum.toString().padStart(3, '0')}`
}

const handleAddNew = () => {
  const activeCatDef = categories.value.find(c => c.id === activeCategory.value)
  if (!activeCatDef) return

  const newId = generateSmartId(activeCategory.value)
  let newCard: any = {
    id: newId,
    type: activeCatDef.isCore ? activeCatDef.type : 'custom',
    visible: {
      public_visible: true,
      player_visible: true,
      unlock_condition: null
    }
  }

  if (activeCategory.value === 'character') {
    newCard = { ...newCard, name: '', prefix_name: '', race: [], age: 0, gender: '', class: '', level: 1, affiliation: [], status: [], attributes: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, personality: [], inventory: [], background: [], tags: [] }
  } else if (activeCategory.value === 'chapter') {
    newCard = { 
      ...newCard, 
      title: '', 
      summary: '',
      objective: '', 
      status: 'pending',
      is_current: false,
      plot_points: [],
      rewards: [],
      tags: []
    }
  } else if (activeCategory.value === 'setting') {
    newCard = { ...newCard, category: 'background', title: '', content: '', tags: [], scaling_modes: {}, suffix_names: [], step: 20 }
  } else if (activeCategory.value === 'interaction') {
    newCard = { ...newCard, name: '', min_level: 1, element: '', cost: '', d20_logic: null, effect: '' }
  } else {
    // Custom
    newCard = { ...newCard, category: activeCategory.value, title: '新卡片', content: '', tags: [] }
  }

  viewMode.value = 'cards'
  editingCard.value = newCard
  showStatus(`已创建新卡：${newId}`)
}

const handleSave = async (card: WorldCard) => {
  // Validation
  if (card.type === 'character') {
    const char = card as any
    if (!char.name || !char.race || !char.class) {
      showStatus('请填写完整的角色信息 (姓名、种族、职业)', 'error')
      return
    }
  } else if (card.type === 'chapter') {
    if (!(card as any).title) {
      showStatus('请填写章节标题', 'error')
      return
    }
  } else if (card.type === 'setting') {
    if (!(card as any).title) {
      showStatus('请填写设定标题', 'error')
      return
    }
  } else if (card.type === 'interaction') {
    if (!(card as any).name) {
      showStatus('请填写交互名称', 'error')
      return
    }
  } else if (card.type === 'custom') {
    if (!(card as any).title) {
      showStatus('请填写标题', 'error')
      return
    }
  }

  try {
    await worldStore.updateCard(card)
    const result = await worldStore.saveToFile()
    if (result.success) {
      showStatus('世界书保存成功，文件已同步。')
      editingCard.value = null // Close the right editor pane
    } else {
      showStatus(`保存失败: ${result.error}`, 'error')
    }
  } catch (error: any) {
    showStatus(`操作异常: ${error.message}`, 'error')
  }
}

const handleActivateChapter = async () => {
  if (!editingCard.value || editingCard.value.type !== 'chapter') return
  try {
    await worldStore.setChapterActive(editingCard.value.id)
    const result = await worldStore.saveToFile()
    if (result.success) {
      showStatus(`已将「${(editingCard.value as any).title}」设为当前章节`)
      // Refresh the editing card to reflect new status
      const updated = worldStore.cards.find(c => c.id === editingCard.value!.id)
      if (updated) editingCard.value = updated
    } else {
      showStatus(`保存失败: ${result.error}`, 'error')
    }
  } catch (error: any) {
    showStatus(`操作异常: ${error.message}`, 'error')
  }
}

const handleSync = async () => {
  const result = await worldStore.syncWithTemplate()
  if (result.success) {
    const adds = result.count || 0
    const updates = (result as any).updateCount || 0
    
    if (adds > 0 || updates > 0) {
      let msg = '同步成功：'
      if (adds > 0) msg += `新增 ${adds} 个条目 `
      if (updates > 0) msg += `更新 ${updates} 个手动修改项`
      showStatus(msg)
    } else {
      showStatus('所有条目已是最新。')
    }
  } else {
    showStatus(`同步失败: ${result.error}`, 'error')
  }
}

const templateFiles = ref<string[]>([])
const showExportDialog = ref(false)
const selectedWorldFile = ref('')

const loadTemplateFiles = async () => {
  const result = await (window as any).api.listWorldTemplates()
  if (result.success) {
    templateFiles.value = result.files || []
  }
}

const openImportWizard = () => {
  emit('open-import-wizard')
}

const handleDeleteTemplate = async (fileName: string) => {
  const displayName = fileName.replace('.json', '')
  const confirmed = confirm(`确定删除世界书模板“${displayName}”吗？此操作不可撤销。`)
  if (!confirmed) return

  const api = (window as any).api
  const electron = (window as any).electron

  let result: { success: boolean; error?: string }
  if (typeof api?.deleteWorldTemplate === 'function') {
    result = await api.deleteWorldTemplate(fileName)
  } else if (electron?.ipcRenderer?.invoke) {
    result = await electron.ipcRenderer.invoke('delete-world-template', fileName)
  } else {
    result = { success: false, error: '当前运行时缺少删除接口，请重启应用后重试。' }
  }

  if (!result.success) {
    showStatus(`删除失败: ${result.error || '未知错误'}`, 'error')
    return
  }

  if (selectedWorldFile.value === fileName) {
    selectedWorldFile.value = ''
  }

  await loadTemplateFiles()
  showStatus(`已删除世界书模板: ${displayName}`)
}

const handleImportTemplate = async () => {
  try {
    const result = await window.api.loadWorldFileExternal()
    if (!result.success) {
      if (!result.cancelled) {
        showStatus(`导入失败: ${result.error || '未知错误'}`, 'error')
      }
      return
    }

    if (!result.content) {
      showStatus('导入失败: 文件内容为空', 'error')
      return
    }

    const dataRaw = JSON.parse(result.content)
    const migrated = migrateWorldData(dataRaw)
    const data = migrated.data

    if (!data.world_meta) {
      showStatus('导入失败: 模板缺少 world_meta 信息', 'error')
      return
    }

    await db.settings.put({ key: 'world_meta', value: data.world_meta })
    worldStore.meta = data.world_meta as any

    await db.world_cards.clear()

    const allCards = [
      ...(data.entries?.setting_cards || []),
      ...(data.entries?.chapter_cards || []),
      ...(data.entries?.character_cards || []),
      ...(data.entries?.interaction_cards || []),
      ...(data.entries?.custom_cards || [])
    ]

    if (allCards.length > 0) {
      const validated = validateAndNormalizeWorldCards(allCards)
      if (!validated.report.valid) {
        const firstError = validated.report.issues.find(issue => issue.level === 'error')
        showStatus(`导入失败: ${firstError?.message || '世界书校验失败'}`, 'error')
        return
      }
      await db.world_cards.bulkAdd(validated.cards)
    }

    await worldStore.loadWorld()
    await loadWorldArchive(data.world_meta)

    showStatus(`已导入世界模板: ${data.world_meta.name}`)
    viewMode.value = 'cards'
    selectedWorldFile.value = ''
    await loadTemplateFiles()
  } catch (error: any) {
    showStatus(`导入失败: ${error.message}`, 'error')
  }
}



const handleSelectWorld = async () => {
  if (!selectedWorldFile.value) return

  console.log('Loading world:', selectedWorldFile.value)
  const result = await (window as any).api.loadWorldCards(selectedWorldFile.value)
  console.log('API result:', result.success, result.error)
  if (result.success && result.content) {
    console.log('Content preview:', result.content.substring(0, 200))
    try {
      const dataRaw = JSON.parse(result.content)
      const migrated = migrateWorldData(dataRaw)
      const data = migrated.data
      console.log('World data loaded:', data.world_meta)
      console.log('Full data structure:', Object.keys(data))
      console.log('Entries:', data.entries)
      console.log('Cards count:', {
        setting: data.entries?.setting_cards?.length || 0,
        chapter: data.entries?.chapter_cards?.length || 0,
        character: data.entries?.character_cards?.length || 0,
        interaction: data.entries?.interaction_cards?.length || 0,
        custom: data.entries?.custom_cards?.length || 0
      })
      
      // 1. 加载 world_meta
      if (data.world_meta) {
        await db.settings.put({ key: 'world_meta', value: data.world_meta })
        worldStore.meta = data.world_meta as any
        console.log('World meta saved:', worldStore.meta)
      } else {
        showStatus('世界书缺少 world_meta 信息', 'error')
        return
      }

      // 2. 清空并加载所有卡片
      await db.world_cards.clear()
      console.log('Database cleared')
      
      const allCards = [
        ...(data.entries?.setting_cards || []),
        ...(data.entries?.chapter_cards || []),
        ...(data.entries?.character_cards || []),
        ...(data.entries?.interaction_cards || []),
        ...(data.entries?.custom_cards || [])
      ]
      
      console.log('Total cards to add:', allCards.length)
      
      if (allCards.length > 0) {
        const validated = validateAndNormalizeWorldCards(allCards)
        if (!validated.report.valid) {
          const firstError = validated.report.issues.find(issue => issue.level === 'error')
          showStatus(`加载失败: ${firstError?.message || '世界书校验失败'}`, 'error')
          return
        }

        await db.world_cards.bulkAdd(validated.cards)
        console.log('Cards added to database')
      }
      
      await worldStore.loadWorld()
      console.log('WorldStore loaded, cards count:', worldStore.cards.length)

      // 3. 检索并加载该世界书的最新存档
      await loadWorldArchive(data.world_meta)

      showStatus(`已加载世界书: ${data.world_meta.name}`)
      viewMode.value = 'cards'
      selectedWorldFile.value = ''
    } catch (e: any) {
      showStatus(`加载失败: ${e.message}`, 'error')
      console.error('Load world error:', e)
    }
  } else {
    showStatus(`加载失败: ${result.error}`, 'error')
  }
}

const loadWorldArchive = async (worldMeta: any) => {
  if (!worldMeta.uuid) {
    console.warn('World meta missing uuid, skipping archive load')
    return
  }

  try {
    // 获取该世界书的所有存档
    const result = await (window as any).api.listSaveFiles(worldMeta.uuid)
    
    if (result.success && result.files && result.files.length > 0) {
      // 找到时间最近的存档
      const latestSave = result.files.sort((a: any, b: any) => b.timestamp - a.timestamp)[0]
      console.log('Loading latest archive:', latestSave.filename)
      
      // 加载存档
      const loadResult = await (window as any).api.loadArchiveFile(latestSave.filename)
      if (loadResult.success && loadResult.content) {
        const archive = JSON.parse(loadResult.content)
        
        // 加载历史记录
        await db.chronicle.clear()
        if (archive.history && archive.history.length > 0) {
          await db.chronicle.bulkAdd(archive.history)
        }
        await chronicleStore.loadHistory()
        chronicleStore.clearInteraction()
        
        // 加载活跃信息
        if (archive.active_information && Array.isArray(archive.active_information)) {
          await worldStore.setActiveCharacters(archive.active_information)
        } else {
          await worldStore.setActiveCharacters(resolveDefaultActiveCharacterIds(worldMeta))
        }
        
        console.log('Archive loaded successfully')
      }
    } else {
      // 没有存档，创建空存档
      console.log('No archive found, creating new one')
      await createEmptyArchive(worldMeta)
    }
  } catch (error: any) {
    console.error('Load archive error:', error)
    // 出错时也创建空存档
    await createEmptyArchive(worldMeta)
  }
}

const resolveDefaultActiveCharacterIds = (worldMeta: any): string[] => {
  if (worldMeta?.player_character_id) {
    return [worldMeta.player_character_id]
  }

  const taggedPlayer = worldStore.cards.find(card =>
    card.type === 'character' && Array.isArray((card as any).tags) && (card as any).tags.includes('player')
  )
  if (taggedPlayer) {
    return [taggedPlayer.id]
  }

  const firstCharacter = worldStore.cards.find(card => card.type === 'character')
  return firstCharacter ? [firstCharacter.id] : []
}

const createEmptyArchive = async (worldMeta: any) => {
  try {
    // 清空历史记录
    await db.chronicle.clear()
    await chronicleStore.loadHistory()
    chronicleStore.clearInteraction()
    
    const defaultActiveIds = resolveDefaultActiveCharacterIds(worldMeta)
    await worldStore.setActiveCharacters(defaultActiveIds)
    
    // 创建并保存空存档
    const emptyArchive = {
      world_meta: worldMeta,
      timestamp: Date.now(),
      active_information: defaultActiveIds,
      history: []
    }
    
    await (window as any).api.saveArchiveFile(
      JSON.stringify(emptyArchive, null, 2),
      worldMeta.uuid,
      worldMeta.name
    )
    
    console.log('Empty archive created')
  } catch (error: any) {
    console.error('Create empty archive error:', error)
  }
}

const handleCreateWorld = async () => {
  console.log('handleCreateWorld called, worldMeta:', worldMeta.value)
  const fileName = worldMeta.value.name.trim()
  if (!fileName) {
    showStatus('请输入世界书名称', 'error')
    return
  }

  const normalizedTags = (worldMeta.value.tagsText || '')
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
  worldMeta.value.tags = normalizedTags

  try {
    // Generate UUID for the world
    const uuid = crypto.randomUUID()
    
    const content = JSON.stringify({
      world_meta: {
        uuid: uuid,
        name: worldMeta.value.name,
        version: worldMeta.value.version,
        author: worldMeta.value.author,
        description: worldMeta.value.description,
        schema_version: 2,
        default_language: (worldMeta.value.default_language || 'zh-CN').trim() || 'zh-CN',
        tags: normalizedTags,
        player_character_id: worldMeta.value.player_character_id || undefined
      },
      entries: {
        setting_cards: [],
        chapter_cards: [],
        character_cards: [],
        interaction_cards: [],
        custom_cards: []
      }
    }, null, 2)

    console.log('Calling saveWorldFile with world name/uuid:', fileName, uuid)
    const result = await window.api.saveWorldFile(content, worldMeta.value.name, uuid)
    console.log('saveWorldFile result:', result)
    
    if (result.success) {
      showStatus(`已创建世界书: ${fileName}`)
      await loadTemplateFiles()
      // Reset form
      worldMeta.value = {
        name: '',
        version: '1.0.0',
        author: '',
        description: '',
        default_language: 'zh-CN',
        tagsText: '',
        tags: [],
        player_character_id: ''
      }
    } else {
      showStatus(`创建失败: ${result.error}`, 'error')
    }
  } catch (error: any) {
    console.error('Create world error:', error)
    showStatus(`创建失败: ${error.message}`, 'error')
  }
}

const worldMeta = ref({
  name: '',
  version: '1.0.0',
  author: '',
  description: '',
  default_language: 'zh-CN',
  tagsText: '',
  tags: [] as string[],
  player_character_id: ''
})

const expandedSections = ref<Record<string, boolean>>({
  load: true,
  create: false,
  importExport: false
})
</script>

<template>
  <div class="manager-root">
  <div class="manager-view">
    <!-- Global Status Toast -->
    <transition name="status-fade">
      <div v-if="statusMsg" class="status-toast" :class="statusType">
        {{ statusMsg }}
      </div>
    </transition>

    <div class="sidebar">
        <div class="sidebar-header">
          分类
          <button class="btn-icon-small" @click="handleAddCategory" title="添加新分类">
            <Plus :size="14" />
          </button>
        </div>
        <div
          v-for="cat in categories"
          :key="cat.id"
          class="nav-item"
          :class="{ active: activeCategory === cat.id && isCardsView }"
          @click="activeCategory = cat.id; editingCard = null; viewMode = 'cards'"
        >
          <span class="cat-name">{{ cat.name }}</span>
          <button v-if="!cat.isCore" class="btn-delete-cat" @click.stop="handleDeleteCategory(cat.id)" title="删除分类">
            <Trash2 :size="14" />
          </button>
        </div>
        <div class="sidebar-footer">
          <button class="btn-action" :class="{ active: isWorldbookView }" @click="viewMode = 'worldbook'; editingCard = null" title="选择或创建世界书">
            <FolderOpen :size="14" /> 世界书
          </button>
        </div>
      </div>

    <CardBrowser
      v-if="isCardsView"
      :categories="categories"
      :active-category="activeCategory"
      :setting-categories="settingCategories"
      :active-setting-category="activeSettingCategory"
      :search-query="searchQuery"
      :editing-card="editingCard"
      :filtered-cards="filteredCards"
      :loading="worldStore.loading"
      @update:search-query="searchQuery = $event"
      @update:active-setting-category="activeSettingCategory = $event"
      @update:editing-card="editingCard = $event"
      @sync="handleSync"
      @add-new="handleAddNew"
      @save-card="handleSave"
      @edit-card="handleEdit"
      @delete-card="handleDelete"
      @batch-delete="handleBatchDelete"
      @batch-set-always-active="handleBatchSetAlwaysActive"
      @batch-set-priority="handleBatchSetPriority"
      @activate-chapter="handleActivateChapter"
    />

    <WorldSelector
      v-else
      :template-files="templateFiles"
      :selected-world-file="selectedWorldFile"
      :expanded-sections="expandedSections"
      :world-meta="worldMeta"
      @update:selected-world-file="selectedWorldFile = $event"
      @update:world-meta="worldMeta = $event"
      @toggle-section="(section) => expandedSections[section] = !expandedSections[section]"
      @load-selected-world="handleSelectWorld"
      @import-template="handleImportTemplate"
      @delete-template="handleDeleteTemplate"
      @open-import-wizard="openImportWizard"
      @open-export-dialog="showExportDialog = true"
      @create-world="handleCreateWorld"
    />

  </div>

  <!-- Custom Category Modal -->
  <div v-if="showAddCategoryModal" class="modal-overlay" @click.self="showAddCategoryModal = false">
    <div class="modal-content">
      <h3>新增分类</h3>
      <input 
        v-model="newCategoryName" 
        type="text" 
        placeholder="输入分类名称"
        @keyup.enter="confirmAddCategory"
        ref="categoryInput"
      >
      <div class="modal-actions">
        <button @click="showAddCategoryModal = false">取消</button>
        <button class="primary" @click="confirmAddCategory">确定</button>
      </div>
    </div>
  </div>

  <WorldExporter
    v-if="showExportDialog"
    @close="showExportDialog = false"
  />
  </div>
</template>

<style scoped>
.manager-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.manager-view {
  display: flex;
  height: 100%;
  background-color: var(--bg-app);
  color: var(--text-primary);
}

.sidebar {
  width: 200px;
  background-color: var(--bg-surface);
  border-right: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 20px;
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.btn-icon-small {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-icon-small:hover {
  color: var(--accent-gold);
  background-color: var(--bg-hover);
}

.btn-delete-cat {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  opacity: 0;
  transition: opacity 0.2s;
  margin-left: auto;
  display: flex;
  align-items: center;
}

.nav-item:hover .btn-delete-cat {
  opacity: 1;
}

.btn-delete-cat:hover {
  color: var(--state-danger);
}

.cat-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-item {
  padding: 12px 20px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}

.nav-item:hover {
  background-color: var(--bg-hover);
}

.nav-item.active {
  background-color: var(--accent-gold-weak);
  color: var(--accent-gold);
  border-left: 3px solid var(--accent-gold);
}

.sidebar-footer {
  margin-top: auto;
  border-top: 1px solid var(--border-default);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.btn-action {
  background-color: var(--bg-elevated);
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  transition: all 0.2s;
}

.btn-action:hover {
  background-color: var(--bg-hover);
  color: var(--accent-gold);
  border-color: var(--accent-gold);
}

.btn-action.active {
  background-color: var(--accent-gold-weak);
  color: var(--accent-gold);
  border-color: var(--accent-gold);
}

.main-content {
  flex: 1;
  padding: 30px;
  overflow-y: auto;
  background: var(--bg-app);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  margin-bottom: 30px;
  gap: 20px;
}

.search-box {
  flex: 1;
  background-color: var(--bg-input);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 10px;
}

.search-box input {
  background: none;
  border: none;
  color: var(--text-primary);
  padding: 10px 0;
  width: 100%;
  outline: none;
}

.btn-primary {
  background-color: var(--accent-gold-weak);
  color: var(--accent-gold);
  border: 1px solid var(--accent-gold);
  padding: 0 20px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-primary:hover {
  background-color: var(--accent-gold);
  color: #111;
}

.btn-secondary {
  background-color: var(--bg-elevated);
  color: var(--text-secondary);
  border: 1px solid var(--border-strong);
  padding: 0 20px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--accent-gold);
}

.btn-sync {
  background-color: var(--bg-elevated);
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
  padding: 0 15px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.btn-sync:hover:not(:disabled) {
  background-color: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--accent-gold);
}

.btn-sync:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sync-section {
  display: flex;
  align-items: center;
  gap: 10px;
}

.current-world {
  font-size: 13px;
  color: var(--text-secondary);
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spinning {
  animation: spin 2s linear infinite;
}

.status-toast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 20px;
  border-radius: 4px;
  font-size: 14px;
  z-index: 9999;
  box-shadow: var(--shadow-soft);
  pointer-events: none;
}

.status-toast.success {
  background-color: color-mix(in srgb, var(--state-success) 16%, var(--bg-surface));
  color: var(--state-success);
  border: 1px solid color-mix(in srgb, var(--state-success) 36%, var(--border-default));
}

.status-toast.error {
  background-color: color-mix(in srgb, var(--state-danger) 16%, var(--bg-surface));
  color: var(--state-danger);
  border: 1px solid color-mix(in srgb, var(--state-danger) 36%, var(--border-default));
}

.status-fade-enter-active, .status-fade-leave-active {
  transition: all 0.3s ease;
}

.status-fade-enter-from, .status-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -20px);
}

.secondary-tabs {
  display: flex;
  gap: 15px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border-default);
  padding-bottom: 10px;
}

.secondary-tabs .tab-item {
  padding: 6px 12px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.secondary-tabs .tab-item:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

.secondary-tabs .tab-item.active {
  background-color: var(--accent-gold);
  color: #111;
  font-weight: bold;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 20px;
}

.manager-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-default);
  padding: 15px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: border-color 0.2s;
}

.manager-card:hover {
  border-color: var(--accent-gold);
}

.card-name {
  font-weight: bold;
  margin-bottom: 4px;
}

.card-id {
  font-size: 12px;
  color: var(--text-muted);
}

.btn-delete {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
}

.btn-delete:hover {
  color: var(--state-danger);
}

.breadcrumb {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-default);
  margin-bottom: 16px;
}
.crumb {
  font-size: 13px;
  color: var(--text-secondary);
}
.crumb.clickable {
  cursor: pointer;
}
.crumb.clickable:hover {
  color: var(--text-primary);
}
.crumb.current {
  color: var(--accent-gold);
}
.breadcrumb-actions {
  margin-left: auto;
  display: flex;
  gap: 10px;
}
.editor-full {
  background-color: transparent;
  border: none;
  padding: 15px;
}
.content-area {
  margin-top: 16px;
}
.card-grid {
  background-color: transparent;
}
.manager-card {
  background-color: transparent;
}

.editor-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-style: italic;
}

.settings-full {
  max-width: 600px;
}

.settings-full h2 {
  color: var(--accent-gold);
  margin-bottom: 30px;
}

.settings-grid {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.field label {
  display: block;
  margin-bottom: 8px;
  color: var(--text-secondary);
}

.field input {
  width: 100%;
  background-color: var(--bg-input);
  border: 1px solid var(--border-default);
  padding: 12px;
  border-radius: 4px;
  color: var(--text-primary);
  outline: none;
}

.field input:focus {
  border-color: var(--accent-gold);
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bg-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.modal-content {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  padding: 20px;
  border-radius: 8px;
  width: 300px;
  box-shadow: var(--shadow-strong);
}

.modal-content h3 {
  margin: 0 0 10px 0;
  color: var(--accent-gold);
  font-size: 1.2rem;
  text-align: center;
}

.modal-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 15px;
  text-align: center;
}

.template-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  margin-bottom: 15px;
}

.template-item {
  padding: 10px 12px;
  cursor: pointer;
  font-size: 13px;
  border-bottom: 1px solid var(--border-default);
  transition: all 0.2s;
}

.template-item:last-child {
  border-bottom: none;
}

.template-item:hover {
  background-color: var(--bg-hover);
}

.template-item.selected {
  background-color: var(--accent-gold-weak);
  color: var(--accent-gold);
}

.no-templates {
  padding: 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  border: 1px dashed var(--border-default);
  border-radius: 4px;
  margin-bottom: 15px;
}

.modal-content input {
  width: 100%;
  padding: 8px 12px;
  margin-bottom: 20px;
  background: var(--bg-input);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  color: var(--text-primary);
  box-sizing: border-box;
}

.modal-content input:focus {
  border-color: var(--accent-gold);
  outline: none;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.modal-actions button {
  padding: 6px 16px;
  background: var(--bg-elevated);
  border: none;
  border-radius: 4px;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s;
}

.modal-actions button:hover {
  background: var(--bg-hover);
}

.modal-actions button.primary {
  background: var(--accent-gold);
  color: #111;
  font-weight: bold;
}

.modal-actions button.primary:hover {
  background: var(--accent-gold-strong);
  box-shadow: var(--glow-gold);
}

.modal-large {
  width: 450px;
}

.worldbook-section {
  margin-bottom: 15px;
}

.worldbook-section h4 {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: #d4af37;
  font-weight: normal;
}

.modal-content button.full-width {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
}

.world-list {
  max-height: 250px;
  overflow-y: auto;
  border: 1px solid #333;
  border-radius: 4px;
  margin-bottom: 15px;
}

.world-item {
  padding: 12px 15px;
  cursor: pointer;
  font-size: 13px;
  border-bottom: 1px solid var(--border-default);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 10px;
}

.world-item:last-child {
  border-bottom: none;
}

.world-item:hover {
  background-color: var(--bg-hover);
}

.world-item.selected {
  background-color: var(--accent-gold-weak);
  color: var(--accent-gold);
}

.no-worlds {
  padding: 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  border: 1px dashed var(--border-default);
  border-radius: 4px;
  margin-bottom: 15px;
}

.create-world {
  margin-top: 15px;
}

.divider {
  display: flex;
  align-items: center;
  margin-bottom: 15px;
  color: var(--text-muted);
  font-size: 12px;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-default);
}

.divider span {
  padding: 0 10px;
}

.create-world input {
  margin-bottom: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field label {
  font-size: 12px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.field input {
  background-color: var(--bg-input);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  padding: 12px;
  color: var(--text-primary);
  font-size: 14px;
  transition: all 0.2s;
}

.field input:focus {
  border-color: var(--accent-gold);
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-gold-weak);
}

.field input::placeholder {
  color: var(--text-muted);
}

.worldbook-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.worldbook-header {
  padding: 20px 30px;
  border-bottom: 1px solid var(--border-default);
  background-color: var(--bg-surface);
}

.worldbook-header h2 {
  margin: 0 0 10px 0;
  font-size: 20px;
  font-weight: normal;
  color: var(--text-primary);
}

.worldbook-hint {
  color: var(--text-secondary);
  font-size: 13px;
  margin: 0;
}

.worldbook-content {
  flex: 1;
  padding: 30px;
  overflow-y: auto;
  max-width: 800px;
}

.config-section {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  margin-bottom: 15px;
  overflow: hidden;
}

.section-header {
  padding: 15px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: background-color 0.2s;
}

.section-header:hover {
  background-color: var(--bg-hover);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  color: var(--text-primary);
}

.section-title svg {
  color: var(--accent-gold);
}

.chevron {
  color: var(--text-secondary);
  transition: transform 0.2s;
}

.section-content {
  padding: 20px;
  border-top: 1px solid var(--border-default);
}

.config-hint {
  color: var(--text-secondary);
  font-size: 13px;
  margin-bottom: 20px;
  padding: 15px;
  background-color: var(--accent-gold-weak);
  border-radius: 6px;
  border-left: 3px solid var(--accent-gold);
  line-height: 1.6;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.template-item {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 15px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.template-item:hover {
  border-color: var(--accent-gold);
  background-color: var(--bg-hover);
}

.template-item.selected {
  border-color: var(--accent-gold);
  background-color: var(--accent-gold-weak);
}

.template-name {
  font-size: 13px;
  color: var(--text-primary);
  text-align: center;
}

.template-item.selected .template-name {
  color: var(--accent-gold);
}

.no-templates {
  grid-column: 1 / -1;
  padding: 30px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  border: 1px dashed var(--border-default);
  border-radius: 6px;
}

.section-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 15px;
}

.field-row {
  display: flex;
  gap: 15px;
  margin-bottom: 15px;
}

.field.flex-1 {
  flex: 1;
}

.field.flex-2 {
  flex: 2;
}

.field textarea {
  background-color: var(--bg-input);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  padding: 10px 12px;
  color: var(--text-primary);
  font-size: 14px;
  transition: all 0.2s;
  font-family: inherit;
  resize: vertical;
}

.field textarea:focus {
  border-color: var(--accent-gold);
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-gold-weak);
}

.field textarea::placeholder {
  color: var(--text-muted);
}
</style>
