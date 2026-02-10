<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useWorldStore } from '../store/world'
import { useChronicleStore } from '../store/chronicle'
import { useConfigStore } from '../store/config'
import { db } from '../db/db'
import CardEditor from '../components/CardEditor.vue'
import { Plus, Trash2, Search, RefreshCw, Download, Upload, FolderOpen, Settings, Save, Check, AlertCircle, ChevronDown, ChevronRight, Book } from 'lucide-vue-next'
import { WorldCard } from '@shared/Interface'

const worldStore = useWorldStore()
const chronicleStore = useChronicleStore()
const configStore = useConfigStore()

const viewMode = ref<'cards' | 'worldbook'>('cards')

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
  editingCard.value = JSON.parse(JSON.stringify(card))
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

  editingCard.value = newCard
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

const saveSettings = () => {
  configStore.saveConfig()
}

const templateFiles = ref<string[]>([])
const showImportModal = ref(false)
const showExportModal = ref(false)
const selectedTemplateFile = ref('')
const selectedWorldFile = ref('')
const exportFileName = ref('')
const newWorldName = ref('')

const loadTemplateFiles = async () => {
  const result = await (window as any).api.listWorldTemplates()
  if (result.success) {
    templateFiles.value = result.files || []
  }
}

const handleExportFile = async () => {
  const fileName = exportFileName.value.trim() || 'my-world'
  const content = JSON.stringify({
    world_meta: worldStore.meta,
    entries: {
      setting_cards: worldStore.cards.filter(c => c.type === 'setting'),
      chapter_cards: worldStore.cards.filter(c => c.type === 'chapter'),
      character_cards: worldStore.cards.filter(c => c.type === 'character'),
      interaction_cards: worldStore.cards.filter(c => c.type === 'interaction')
    }
  }, null, 2)

  const result = await (window as any).api.saveWorldFileExternal(content, fileName)
  if (result.success) {
    showStatus(`导出成功: ${result.filePath}`)
    showExportModal.value = false
    exportFileName.value = ''
  } else {
    showStatus(`导出失败: ${result.error}`, 'error')
  }
}

const handleImportFile = async () => {
  const result = await (window as any).api.loadWorldFileExternal()
  if (result.success && result.content) {
    try {
      const data = JSON.parse(result.content)
      let importCount = 0
      let updateCount = 0

      const allCards = [
        ...(data.entries?.setting_cards || []),
        ...(data.entries?.chapter_cards || []),
        ...(data.entries?.character_cards || []),
        ...(data.entries?.interaction_cards || [])
      ]

      const existingIds = new Set(worldStore.cards.map(c => c.id))

      for (const card of allCards) {
        if (!existingIds.has(card.id)) {
          await worldStore.addCard(card)
          importCount++
        } else {
          await worldStore.updateCard(card)
          updateCount++
        }
      }

      await worldStore.saveToFile()
      showStatus(`导入成功: 新增 ${importCount} 个, 更新 ${updateCount} 个`)
      showImportModal.value = false
    } catch (e: any) {
      showStatus(`导入失败: 文件格式错误 - ${e.message}`, 'error')
    }
  } else if (!result.cancelled) {
    showStatus(`导入失败: ${result.error}`, 'error')
  }
}

const openImportModal = async () => {
  showImportModal.value = true
}

const openExportModal = () => {
  exportFileName.value = ''
  showExportModal.value = true
}

const handleSelectWorld = async () => {
  if (!selectedWorldFile.value) return

  console.log('Loading world:', selectedWorldFile.value)
  const result = await (window as any).api.loadWorldCards(selectedWorldFile.value)
  console.log('API result:', result.success, result.error)
  if (result.success && result.content) {
    console.log('Content preview:', result.content.substring(0, 200))
    try {
      const data = JSON.parse(result.content)
      console.log('World data loaded:', data.world_meta)
      console.log('Full data structure:', Object.keys(data))
      console.log('Entries:', data.entries)
      console.log('Cards count:', {
        setting: data.entries?.setting_cards?.length || 0,
        chapter: data.entries?.chapter_cards?.length || 0,
        character: data.entries?.character_cards?.length || 0,
        interaction: data.entries?.interaction_cards?.length || 0
      })
      
      // 1. 加载 world_meta
      if (data.world_meta) {
        await db.settings.put({ key: 'world_meta', value: data.world_meta })
        worldStore.meta = data.world_meta
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
        ...(data.entries?.interaction_cards || [])
      ]
      
      console.log('Total cards to add:', allCards.length)
      
      if (allCards.length > 0) {
        await db.world_cards.bulkAdd(allCards)
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
          // 默认只激活玩家角色
          await worldStore.setActiveCharacters(['char-001'])
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

const createEmptyArchive = async (worldMeta: any) => {
  try {
    // 清空历史记录
    await db.chronicle.clear()
    await chronicleStore.loadHistory()
    chronicleStore.clearInteraction()
    
    // 重置活跃角色为默认（只有玩家）
    await worldStore.setActiveCharacters(['char-001'])
    
    // 创建并保存空存档
    const emptyArchive = {
      world_meta: worldMeta,
      timestamp: Date.now(),
      active_information: ['char-001'],
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

  try {
    // Generate UUID for the world
    const uuid = crypto.randomUUID()
    
    const content = JSON.stringify({
      world_meta: {
        uuid: uuid,
        name: worldMeta.value.name,
        version: worldMeta.value.version,
        author: worldMeta.value.author,
        description: worldMeta.value.description
      },
      entries: {
        setting_cards: [],
        chapter_cards: [],
        character_cards: [],
        interaction_cards: []
      }
    }, null, 2)

    console.log('Calling saveWorldCards with fileName:', fileName)
    const result = await (window as any).api.saveWorldCards(content, fileName)
    console.log('saveWorldCards result:', result)
    
    if (result.success) {
      showStatus(`已创建世界书: ${fileName}`)
      await loadTemplateFiles()
      // Reset form
      worldMeta.value = {
        name: '',
        version: '1.0.0',
        author: '',
        description: ''
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
  description: ''
})

const expandedSections = ref<Record<string, boolean>>({
  load: true,
  create: false,
  importExport: false
})
</script>

<template>
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
          :class="{ active: activeCategory === cat.id && viewMode === 'cards' }"
          @click="activeCategory = cat.id; editingCard = null; viewMode = 'cards'"
        >
          <span class="cat-name">{{ cat.name }}</span>
          <button v-if="!cat.isCore" class="btn-delete-cat" @click.stop="handleDeleteCategory(cat.id)" title="删除分类">
            <Trash2 :size="14" />
          </button>
        </div>
        <div class="sidebar-footer">
          <button class="btn-action" :class="{ active: viewMode === 'worldbook' }" @click="viewMode = 'worldbook'; editingCard = null" title="选择或创建世界书">
            <FolderOpen :size="14" /> 世界书
          </button>
        </div>
      </div>

    <!-- Cards View -->
    <div v-if="viewMode === 'cards'" class="main-content">
        <div class="toolbar">
          <div class="search-box">
            <Search :size="16" />
            <input v-model="searchQuery" placeholder="搜索卡片..." />
          </div>
          <div class="sync-section">
            <button class="btn-sync" @click="handleSync" :disabled="worldStore.loading" title="从 JSON 模板同步新增项">
              <RefreshCw :size="16" :class="{ spinning: worldStore.loading }" />
              同步模板
            </button>
          </div>
          <button class="btn-primary" @click="handleAddNew" :disabled="worldStore.loading">
            <Plus :size="16" /> 新增{{ categories.find(c => c.id === activeCategory)?.name }}
          </button>
        </div>

        <div v-if="activeCategory === 'setting'" class="secondary-tabs">
          <div
            v-for="scat in settingCategories"
            :key="scat.id"
            class="tab-item"
            :class="{ active: activeSettingCategory === scat.id }"
            @click="activeSettingCategory = scat.id"
          >
            {{ scat.name }}
          </div>
        </div>

        <div class="card-grid">
          <div v-for="card in filteredCards" :key="card.id" class="manager-card" @click="handleEdit(card)">
            <div class="card-info">
              <div class="card-name">{{ (card as any).name || (card as any).title || card.id }}</div>
              <div class="card-id">{{ card.id }}</div>
            </div>
            <button class="btn-delete" @click.stop="handleDelete(card.id)">
              <Trash2 :size="16" />
            </button>
          </div>
        </div>
      </div>

    <!-- World Book Management View -->
    <div v-if="viewMode === 'worldbook'" class="worldbook-view">
      <div class="worldbook-header">
        <h2>世界书管理</h2>
        <p class="worldbook-hint">管理世界书模板，从模板加载或创建新的世界书</p>
      </div>

      <div class="worldbook-content">
        <!-- Load Template Section -->
        <div class="config-section">
          <div class="section-header" @click="expandedSections.load = !expandedSections.load">
            <div class="section-title">
              <FolderOpen :size="18" />
              <span>加载世界书模板</span>
            </div>
            <ChevronDown v-if="expandedSections.load" :size="16" class="chevron" />
            <ChevronRight v-else :size="16" class="chevron" />
          </div>
          <div v-if="expandedSections.load" class="section-content">
            <p class="config-hint">
              从以下预置模板中选择加载世界书。加载后可以从模板同步新增内容。
            </p>
            <div class="template-grid">
              <div
                v-for="file in templateFiles"
                :key="file"
                class="template-item"
                :class="{ selected: selectedWorldFile === file }"
                @click="selectedWorldFile = file"
              >
                <Book :size="20" />
                <span class="template-name">{{ file.replace('.json', '') }}</span>
              </div>
              <div v-if="templateFiles.length === 0" class="no-templates">
                暂无可用模板
              </div>
            </div>
            <div class="section-actions">
              <button class="btn-primary" @click="handleSelectWorld" :disabled="!selectedWorldFile">
                <FolderOpen :size="16" /> 加载选中模板
              </button>
            </div>
          </div>
        </div>

        <!-- Create New World Section -->
        <div class="config-section">
          <div class="section-header" @click="expandedSections.create = !expandedSections.create">
            <div class="section-title">
              <Plus :size="18" />
              <span>创建新世界书</span>
            </div>
            <ChevronDown v-if="expandedSections.create" :size="16" class="chevron" />
            <ChevronRight v-else :size="16" class="chevron" />
          </div>
          <div v-if="expandedSections.create" class="section-content">
            <p class="config-hint">
              创建新的世界书。这将生成一个包含基础结构的空世界书文件。
            </p>
            <div class="field-row">
              <div class="field flex-2">
                <label>世界书名称 *</label>
                <input
                  v-model="worldMeta.name"
                  type="text"
                  placeholder="输入世界书名称"
                />
              </div>
              <div class="field flex-1">
                <label>版本</label>
                <input
                  v-model="worldMeta.version"
                  type="text"
                  placeholder="1.0.0"
                />
              </div>
            </div>
            <div class="field">
              <label>作者</label>
              <input
                v-model="worldMeta.author"
                type="text"
                placeholder="输入作者名称"
              />
            </div>
            <div class="field">
              <label>描述</label>
              <textarea
                v-model="worldMeta.description"
                rows="3"
                placeholder="输入世界书描述"
              />
            </div>
            <div class="section-actions">
              <button class="btn-primary" @click="handleCreateWorld" :disabled="!worldMeta.name.trim()">
                <Plus :size="16" /> 创建新世界书
              </button>
            </div>
          </div>
        </div>
    </div>

    <div v-if="viewMode === 'cards'" class="editor-pane" :class="{ open: !!editingCard }">
      <CardEditor
          v-if="editingCard"
          :key="editingCard.id"
          :card="editingCard"
          @save="handleSave"
          @close="editingCard = null"
        />
        <div v-else class="editor-placeholder">
          请选择或创建一个卡片进行编辑
        </div>
      </div>
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
</div>
</template>

<style scoped>
.manager-view {
  display: flex;
  height: 100vh;
  background-color: #121212;
  color: #eee;
}

.sidebar {
  width: 200px;
  background-color: #1a1a1a;
  border-right: 1px solid #333;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 20px;
  font-size: 12px;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 1px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.btn-icon-small {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-icon-small:hover {
  color: #d4af37;
  background-color: #252525;
}

.btn-delete-cat {
  background: none;
  border: none;
  color: #666;
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
  color: #f44336;
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
  background-color: #252525;
}

.nav-item.active {
  background-color: #2a2a2a;
  color: #d4af37;
  border-left: 3px solid #d4af37;
}

.sidebar-footer {
  margin-top: auto;
  border-top: 1px solid #333;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.btn-action {
  background-color: #1a1a1a;
  color: #888;
  border: 1px solid #333;
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
  background-color: #252525;
  color: #d4af37;
  border-color: #d4af37;
}

.btn-action.active {
  background-color: #3d3115;
  color: #d4af37;
  border-color: #d4af37;
}

.main-content {
  flex: 1;
  padding: 30px;
  overflow-y: auto;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  margin-bottom: 30px;
  gap: 20px;
}

.search-box {
  flex: 1;
  background-color: #1a1a1a;
  border: 1px solid #333;
  border-radius: 4px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 10px;
}

.search-box input {
  background: none;
  border: none;
  color: #fff;
  padding: 10px 0;
  width: 100%;
  outline: none;
}

.btn-primary {
  background-color: #3d3115;
  color: #d4af37;
  border: 1px solid #d4af37;
  padding: 0 20px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-primary:hover {
  background-color: #4d3d1a;
}

.btn-secondary {
  background-color: #2a2a2a;
  color: #888;
  border: 1px solid #444;
  padding: 0 20px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background-color: #333;
  color: #eee;
  border-color: #d4af37;
}

.btn-sync {
  background-color: #1a1a1a;
  color: #888;
  border: 1px solid #333;
  padding: 0 15px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.btn-sync:hover:not(:disabled) {
  background-color: #252525;
  color: #eee;
  border-color: #d4af37;
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
  color: #888;
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
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  pointer-events: none;
}

.status-toast.success {
  background-color: #1b4332;
  color: #74c69d;
  border: 1px solid #2d6a4f;
}

.status-toast.error {
  background-color: #431b1b;
  color: #c67474;
  border: 1px solid #6a2d2d;
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
  border-bottom: 1px solid #333;
  padding-bottom: 10px;
}

.secondary-tabs .tab-item {
  padding: 6px 12px;
  font-size: 13px;
  color: #888;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.secondary-tabs .tab-item:hover {
  background-color: #252525;
  color: #eee;
}

.secondary-tabs .tab-item.active {
  background-color: #d4af37;
  color: #000;
  font-weight: bold;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 20px;
}

.manager-card {
  background-color: #1a1a1a;
  border: 1px solid #333;
  padding: 15px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: border-color 0.2s;
}

.manager-card:hover {
  border-color: #d4af37;
}

.card-name {
  font-weight: bold;
  margin-bottom: 4px;
}

.card-id {
  font-size: 12px;
  color: #666;
}

.btn-delete {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
}

.btn-delete:hover {
  color: #f44336;
}

.editor-pane {
  width: 0;
  overflow: hidden;
  transition: width 0.3s ease;
  position: relative;
  border-left: 0 solid #333;
}

.editor-pane.open {
  width: 450px;
  border-left-width: 1px;
}

.editor-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #666;
  font-style: italic;
}

.settings-full {
  max-width: 600px;
}

.settings-full h2 {
  color: #d4af37;
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
  color: #888;
}

.field input {
  width: 100%;
  background-color: #1a1a1a;
  border: 1px solid #333;
  padding: 12px;
  border-radius: 4px;
  color: #fff;
  outline: none;
}

.field input:focus {
  border-color: #d4af37;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.modal-content {
  background: #1a1a1a;
  border: 1px solid #333;
  padding: 20px;
  border-radius: 8px;
  width: 300px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.modal-content h3 {
  margin: 0 0 10px 0;
  color: #d4af37;
  font-size: 1.2rem;
  text-align: center;
}

.modal-desc {
  font-size: 12px;
  color: #888;
  margin-bottom: 15px;
  text-align: center;
}

.template-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #333;
  border-radius: 4px;
  margin-bottom: 15px;
}

.template-item {
  padding: 10px 12px;
  cursor: pointer;
  font-size: 13px;
  border-bottom: 1px solid #252525;
  transition: all 0.2s;
}

.template-item:last-child {
  border-bottom: none;
}

.template-item:hover {
  background-color: #252525;
}

.template-item.selected {
  background-color: #3d3115;
  color: #d4af37;
}

.no-templates {
  padding: 20px;
  text-align: center;
  color: #666;
  font-size: 13px;
  border: 1px dashed #333;
  border-radius: 4px;
  margin-bottom: 15px;
}

.modal-content input {
  width: 100%;
  padding: 8px 12px;
  margin-bottom: 20px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: #eee;
  box-sizing: border-box;
}

.modal-content input:focus {
  border-color: #d4af37;
  outline: none;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.modal-actions button {
  padding: 6px 16px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 4px;
  color: #eee;
  cursor: pointer;
  transition: all 0.2s;
}

.modal-actions button:hover {
  background: rgba(255, 255, 255, 0.2);
}

.modal-actions button.primary {
  background: #d4af37;
  color: #000;
  font-weight: bold;
}

.modal-actions button.primary:hover {
  background: #f0c040;
  box-shadow: 0 0 10px rgba(212, 175, 55, 0.4);
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
  border-bottom: 1px solid #252525;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 10px;
}

.world-item:last-child {
  border-bottom: none;
}

.world-item:hover {
  background-color: #252525;
}

.world-item.selected {
  background-color: #3d3115;
  color: #d4af37;
}

.no-worlds {
  padding: 20px;
  text-align: center;
  color: #666;
  font-size: 13px;
  border: 1px dashed #333;
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
  color: #666;
  font-size: 12px;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #333;
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
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.field input {
  background-color: #252525;
  border: 1px solid #333;
  border-radius: 4px;
  padding: 12px;
  color: #eee;
  font-size: 14px;
  transition: all 0.2s;
}

.field input:focus {
  border-color: #d4af37;
  outline: none;
  box-shadow: 0 0 0 2px rgba(212, 175, 55, 0.1);
}

.field input::placeholder {
  color: #555;
}

.worldbook-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.worldbook-header {
  padding: 20px 30px;
  border-bottom: 1px solid #333;
  background-color: #161616;
}

.worldbook-header h2 {
  margin: 0 0 10px 0;
  font-size: 20px;
  font-weight: normal;
  color: #eee;
}

.worldbook-hint {
  color: #888;
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
  background-color: #1a1a1a;
  border: 1px solid #333;
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
  background-color: #252525;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  color: #eee;
}

.section-title svg {
  color: #d4af37;
}

.chevron {
  color: #666;
  transition: transform 0.2s;
}

.section-content {
  padding: 20px;
  border-top: 1px solid #333;
}

.config-hint {
  color: #888;
  font-size: 13px;
  margin-bottom: 20px;
  padding: 15px;
  background-color: rgba(212, 175, 55, 0.05);
  border-radius: 6px;
  border-left: 3px solid #d4af37;
  line-height: 1.6;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.template-item {
  background-color: #252525;
  border: 1px solid #333;
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
  border-color: #d4af37;
  background-color: #2a2a2a;
}

.template-item.selected {
  border-color: #d4af37;
  background-color: #3d3115;
}

.template-name {
  font-size: 13px;
  color: #eee;
  text-align: center;
}

.template-item.selected .template-name {
  color: #d4af37;
}

.no-templates {
  grid-column: 1 / -1;
  padding: 30px;
  text-align: center;
  color: #666;
  font-size: 13px;
  border: 1px dashed #333;
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
  background-color: #252525;
  border: 1px solid #333;
  border-radius: 4px;
  padding: 10px 12px;
  color: #eee;
  font-size: 14px;
  transition: all 0.2s;
  font-family: inherit;
  resize: vertical;
}

.field textarea:focus {
  border-color: #d4af37;
  outline: none;
  box-shadow: 0 0 0 2px rgba(212, 175, 55, 0.1);
}

.field textarea::placeholder {
  color: #555;
}
</style>
