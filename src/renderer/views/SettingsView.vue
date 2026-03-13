<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useConfigStore } from '../store/config'
import { useWorldStore } from '../store/world'
import { SkillRegistry } from '../core/SkillRegistry'
import { Logger } from '../core/Logger'
import { Settings, Save, Check, AlertCircle, MessageCircle, Image, Video, ChevronDown, ChevronRight, Eye, EyeOff, Wifi } from 'lucide-vue-next'

const configStore = useConfigStore()
const worldStore = useWorldStore()

const activeSettingTab = ref('ai-api')
const themeMode = ref<'dark' | 'light'>('dark')
const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')

const characterCards = computed(() => {
  return worldStore.cards.filter(c => c.type === 'character') as any[]
})

const currentPlayerId = computed(() => {
  return worldStore.meta?.player_character_id || ''
})

const handlePlayerChange = async (e: Event) => {
  const value = (e.target as HTMLSelectElement).value
  await worldStore.setPlayerCharacterId(value || null)
  await worldStore.saveToFile()
}
const statusMessage = ref('')
const configJsonBuffer = ref('')
const eventLogs = ref<Array<{ id?: number; timestamp: number; category: string; level: string; code: string; message: string }>>([])
const tokenVisible = ref<Record<string, boolean>>({ chat: false, image: false, video: false })
const connectionTestStatus = ref<Record<string, 'idle' | 'testing' | 'success' | 'error'>>({ chat: 'idle', image: 'idle', video: 'idle' })
const connectionTestMsg = ref<Record<string, string>>({ chat: '', image: '', video: '' })

interface UnifiedAPIConfig {
  chat: {
    baseUrl: string
    token: string
    model: string
  }
  image: {
    baseUrl: string
    token: string
    model: string
  }
  video: {
    baseUrl: string
    token: string
    model: string
  }
}

const apiConfig = ref<UnifiedAPIConfig>({
  chat: {
    baseUrl: '',
    token: '',
    model: ''
  },
  image: {
    baseUrl: '',
    token: '',
    model: ''
  },
  video: {
    baseUrl: '',
    token: '',
    model: ''
  }
})

const expandedSections = ref<Record<string, boolean>>({
  chat: true,
  image: false,
  video: false
})

const settingTabs = [
  { id: 'ai-api', name: 'AI API', icon: 'Cpu' },
  { id: 'general', name: '通用设置', icon: 'Settings' }
]

const skillsState = ref(
  SkillRegistry.getAllSkills().map(skill => {
    const config = configStore.skillConfigs[skill.id]
    return {
      id: skill.id,
      name: skill.name,
      phase: skill.phase,
      enabled: config?.enabled ?? true,
      priority: config?.priority ?? skill.defaultPriority,
      defaultPriority: skill.defaultPriority
    }
  })
)

const toggleSection = (section: string) => {
  expandedSections.value[section] = !expandedSections.value[section]
}

const toggleTokenVisible = (section: string) => {
  tokenVisible.value[section] = !tokenVisible.value[section]
}

const testConnection = async (section: 'chat' | 'image' | 'video') => {
  const cfg = apiConfig.value[section]
  if (!cfg.baseUrl || !cfg.token) {
    connectionTestMsg.value[section] = '请先填写 Base URL 和 Token'
    connectionTestStatus.value[section] = 'error'
    return
  }
  connectionTestStatus.value[section] = 'testing'
  connectionTestMsg.value[section] = '测试中...'
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(`${cfg.baseUrl}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cfg.token}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    })
    clearTimeout(timeoutId)
    if (res.ok) {
      connectionTestStatus.value[section] = 'success'
      connectionTestMsg.value[section] = '连接成功'
    } else {
      connectionTestStatus.value[section] = 'error'
      connectionTestMsg.value[section] = `连接失败: ${res.status} ${res.statusText}`
    }
  } catch (e: any) {
    connectionTestStatus.value[section] = 'error'
    connectionTestMsg.value[section] = e.name === 'AbortError' ? '连接超时' : `连接失败: ${e.message}`
  }
  setTimeout(() => {
    connectionTestStatus.value[section] = 'idle'
    connectionTestMsg.value[section] = ''
  }, 4000)
}

const refreshSkillsState = () => {
  skillsState.value = SkillRegistry.getAllSkills().map(skill => {
    const config = configStore.skillConfigs[skill.id]
    return {
      id: skill.id,
      name: skill.name,
      phase: skill.phase,
      enabled: config?.enabled ?? true,
      priority: config?.priority ?? skill.defaultPriority,
      defaultPriority: skill.defaultPriority
    }
  })
}

const updateSkillConfig = (skillId: string, patch: { enabled?: boolean; priority?: number }) => {
  configStore.updateSkillConfig(skillId, {
    enabled: patch.enabled,
    priority: patch.priority
  })
  refreshSkillsState()
}

const loadEventLogs = async () => {
  eventLogs.value = await Logger.list(100)
}

const clearEventLogs = async () => {
  await Logger.clear()
  await loadEventLogs()
}

const exportConfigJson = () => {
  configJsonBuffer.value = JSON.stringify(configStore.exportConfig(), null, 2)
}

const importConfigJson = async () => {
  const raw = configJsonBuffer.value.trim()
  if (!raw) return

  const parsed = JSON.parse(raw)
  await configStore.importConfig(parsed)
  refreshSkillsState()
}

const handleSave = async () => {
  saveStatus.value = 'saving'
  statusMessage.value = '正在保存...'
  
  try {
    configStore.apiKey = apiConfig.value.chat.token
    configStore.baseUrl = apiConfig.value.chat.baseUrl
    configStore.model = apiConfig.value.chat.model
    await configStore.saveConfig()
    await configStore.saveSkillConfigs()

    await Logger.log('SYSTEM', 'info', 'SETTINGS_SAVE', 'Settings saved successfully', {
      activeTab: activeSettingTab.value
    })

    await loadEventLogs()
    saveStatus.value = 'saved'
    statusMessage.value = '保存成功'
    setTimeout(() => {
      saveStatus.value = 'idle'
      statusMessage.value = ''
    }, 2000)
  } catch (error) {
    saveStatus.value = 'error'
    statusMessage.value = '保存失败，请重试'
  }
}

const applyTheme = (mode: 'dark' | 'light') => {
  themeMode.value = mode
  document.documentElement.setAttribute('data-theme', mode)
  localStorage.setItem('faramita_theme', mode)
}

const loadConfig = async () => {
  await configStore.loadConfig()

  const savedTheme = localStorage.getItem('faramita_theme')
  if (savedTheme === 'light' || savedTheme === 'dark') {
    themeMode.value = savedTheme
  }
  document.documentElement.setAttribute('data-theme', themeMode.value)

  if (configStore.baseUrl || configStore.model) {
    apiConfig.value.chat.baseUrl = configStore.baseUrl
    apiConfig.value.chat.token = configStore.apiKey
    apiConfig.value.chat.model = configStore.model
  }

  refreshSkillsState()
  await loadEventLogs()
}

onMounted(() => {
  loadConfig()
})
</script>

<template>
  <div class="settings-view">
    <div class="settings-sidebar">
      <div class="sidebar-title">
        <Settings :size="18" /> 系统设置
      </div>
      <div 
        v-for="tab in settingTabs" 
        :key="tab.id"
        class="settings-nav-item"
        :class="{ active: activeSettingTab === tab.id }"
        @click="activeSettingTab = tab.id"
      >
        {{ tab.name }}
      </div>
    </div>
    
    <div class="settings-main">
      <div class="settings-header">
        <h2>{{ settingTabs.find(t => t.id === activeSettingTab)?.name }}</h2>
        <div class="save-section">
          <span v-if="statusMessage" class="status-text" :class="saveStatus">
            <AlertCircle v-if="saveStatus === 'error'" :size="14" />
            <Check v-else-if="saveStatus === 'saved'" :size="14" />
            {{ statusMessage }}
          </span>
          <button class="btn-save" @click="handleSave" :disabled="saveStatus === 'saving'">
            <Save :size="16" />
            {{ saveStatus === 'saving' ? '保存中...' : '保存更改' }}
          </button>
        </div>
      </div>
      
      <div class="settings-content">
        <!-- AI API Settings -->
        <template v-if="activeSettingTab === 'ai-api'">
          <div class="unified-config">
            <p class="config-hint">
              统一配置 AI 接口。切换不同模型（如 GPT-4、DeepSeek、Claude、Gemini）时，只需修改下方对应类型的配置项即可。
            </p>
            
            <!-- Chat Config -->
            <div class="config-section">
              <div class="section-header" @click="toggleSection('chat')">
                <div class="section-title">
                  <MessageCircle :size="18" />
                  <span>对话生成</span>
                </div>
                <ChevronDown v-if="expandedSections.chat" :size="16" class="chevron" />
                <ChevronRight v-else :size="16" class="chevron" />
              </div>
              <div v-if="expandedSections.chat" class="section-content">
                <div class="field-row">
                  <div class="field flex-2">
                    <label>Base URL</label>
                    <input 
                      v-model="apiConfig.chat.baseUrl" 
                      type="text" 
                      placeholder="https://api.openai.com/v1"
                    />
                  </div>
                  <div class="field flex-1">
                    <label>Token / API Key</label>
                    <div class="token-field">
                      <input 
                        v-model="apiConfig.chat.token" 
                        :type="tokenVisible.chat ? 'text' : 'password'" 
                        placeholder="sk-..."
                      />
                      <button class="btn-eye" @click="toggleTokenVisible('chat')" type="button" tabindex="-1">
                        <Eye v-if="tokenVisible.chat" :size="16" />
                        <EyeOff v-else :size="16" />
                      </button>
                    </div>
                  </div>
                </div>
                <div class="field">
                  <label>模型名称</label>
                  <input 
                    v-model="apiConfig.chat.model" 
                    type="text" 
                    placeholder="gpt-4, claude-3-opus, deepseek-chat, gemini-pro"
                  />
                </div>
                <div class="connection-test">
                  <button class="btn-test" @click="testConnection('chat')" :disabled="connectionTestStatus.chat === 'testing'">
                    <Wifi :size="14" />
                    {{ connectionTestStatus.chat === 'testing' ? '测试中...' : '测试连接' }}
                  </button>
                  <span v-if="connectionTestMsg.chat" class="test-msg" :class="connectionTestStatus.chat">{{ connectionTestMsg.chat }}</span>
                </div>
              </div>
            </div>
            
            <!-- Image Config -->
            <div class="config-section">
              <div class="section-header" @click="toggleSection('image')">
                <div class="section-title">
                  <Image :size="18" />
                  <span>图像生成</span>
                </div>
                <ChevronDown v-if="expandedSections.image" :size="16" class="chevron" />
                <ChevronRight v-else :size="16" class="chevron" />
              </div>
              <div v-if="expandedSections.image" class="section-content">
                <div class="field-row">
                  <div class="field flex-2">
                    <label>Base URL</label>
                    <input 
                      v-model="apiConfig.image.baseUrl" 
                      type="text" 
                      placeholder="https://api.stability.ai/v1"
                    />
                  </div>
                  <div class="field flex-1">
                    <label>Token / API Key</label>
                    <div class="token-field">
                      <input 
                        v-model="apiConfig.image.token" 
                        :type="tokenVisible.image ? 'text' : 'password'" 
                        placeholder="sk-..."
                      />
                      <button class="btn-eye" @click="toggleTokenVisible('image')" type="button" tabindex="-1">
                        <Eye v-if="tokenVisible.image" :size="16" />
                        <EyeOff v-else :size="16" />
                      </button>
                    </div>
                  </div>
                </div>
                <div class="field">
                  <label>模型名称</label>
                  <input 
                    v-model="apiConfig.image.model" 
                    type="text" 
                    placeholder="dall-e-3, stable-diffusion-xl"
                  />
                </div>
                <div class="connection-test">
                  <button class="btn-test" @click="testConnection('image')" :disabled="connectionTestStatus.image === 'testing'">
                    <Wifi :size="14" />
                    {{ connectionTestStatus.image === 'testing' ? '测试中...' : '测试连接' }}
                  </button>
                  <span v-if="connectionTestMsg.image" class="test-msg" :class="connectionTestStatus.image">{{ connectionTestMsg.image }}</span>
                </div>
              </div>
            </div>
            
            <!-- Video Config -->
            <div class="config-section">
              <div class="section-header" @click="toggleSection('video')">
                <div class="section-title">
                  <Video :size="18" />
                  <span>视频生成</span>
                </div>
                <ChevronDown v-if="expandedSections.video" :size="16" class="chevron" />
                <ChevronRight v-else :size="16" class="chevron" />
              </div>
              <div v-if="expandedSections.video" class="section-content">
                <div class="field-row">
                  <div class="field flex-2">
                    <label>Base URL</label>
                    <input 
                      v-model="apiConfig.video.baseUrl" 
                      type="text" 
                      placeholder="https://api.example.com/v1"
                    />
                  </div>
                  <div class="field flex-1">
                    <label>Token / API Key</label>
                    <div class="token-field">
                      <input 
                        v-model="apiConfig.video.token" 
                        :type="tokenVisible.video ? 'text' : 'password'" 
                        placeholder="sk-..."
                      />
                      <button class="btn-eye" @click="toggleTokenVisible('video')" type="button" tabindex="-1">
                        <Eye v-if="tokenVisible.video" :size="16" />
                        <EyeOff v-else :size="16" />
                      </button>
                    </div>
                  </div>
                </div>
                <div class="field">
                  <label>模型名称</label>
                  <input 
                    v-model="apiConfig.video.model" 
                    type="text" 
                    placeholder="sora-v1, video-01"
                  />
                </div>
                <div class="connection-test">
                  <button class="btn-test" @click="testConnection('video')" :disabled="connectionTestStatus.video === 'testing'">
                    <Wifi :size="14" />
                    {{ connectionTestStatus.video === 'testing' ? '测试中...' : '测试连接' }}
                  </button>
                  <span v-if="connectionTestMsg.video" class="test-msg" :class="connectionTestStatus.video">{{ connectionTestMsg.video }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
        
        <!-- General Settings -->
        <template v-if="activeSettingTab === 'general'">
          <div class="general-section">
            <h3>玩家角色</h3>
            <div class="field-row">
              <div class="field flex-2">
                <label>选择你的玩家角色</label>
                <select :value="currentPlayerId" @change="handlePlayerChange">
                  <option value="">自动（第一个角色卡）</option>
                  <option v-for="char in characterCards" :key="char.id" :value="char.id">
                    {{ char.name }} ({{ char.id }})
                  </option>
                </select>
              </div>
            </div>

            <h3>界面主题</h3>
            <div class="theme-switcher">
              <button class="theme-btn" :class="{ active: themeMode === 'dark' }" @click="applyTheme('dark')">
                深色
              </button>
            </div>

            <h3>AI 运行参数</h3>
            <div class="field-row">
              <div class="field flex-1">
                <label>temperature</label>
                <input v-model.number="configStore.temperature" type="number" min="0" max="2" step="0.1" />
              </div>
              <div class="field flex-1">
                <label>max_tokens</label>
                <input v-model.number="configStore.maxTokens" type="number" min="128" step="128" />
              </div>
              <div class="field flex-1">
                <label>retry_count</label>
                <input v-model.number="configStore.retryCount" type="number" min="0" step="1" />
              </div>
              <div class="field flex-1">
                <label>timeout(ms)</label>
                <input v-model.number="configStore.timeout" type="number" min="1000" step="1000" />
              </div>
            </div>

            <h3>记忆系统参数</h3>
            <div class="field-row">
              <div class="field flex-1">
                <label>短期窗口</label>
                <input v-model.number="configStore.shortTermWindowSize" type="number" min="1" step="1" />
              </div>
              <div class="field flex-1">
                <label>摘要触发阈值</label>
                <input v-model.number="configStore.summarizationThreshold" type="number" min="5" step="1" />
              </div>
              <div class="field flex-1">
                <label>token预算</label>
                <input v-model.number="configStore.tokenBudget" type="number" min="512" step="128" />
              </div>
            </div>

            <h3>Skill 管理</h3>
            <div class="skill-list">
              <div v-for="skill in skillsState" :key="skill.id" class="skill-item">
                <div class="skill-main">
                  <div class="skill-name">{{ skill.name }}</div>
                  <div class="skill-meta">{{ skill.id }} · {{ skill.phase }}</div>
                </div>
                <label class="skill-toggle">
                  <input
                    type="checkbox"
                    :checked="skill.enabled"
                    @change="updateSkillConfig(skill.id, { enabled: ($event.target as HTMLInputElement).checked })"
                  />
                  启用
                </label>
                <div class="field skill-priority">
                  <label>priority</label>
                  <input
                    type="number"
                    :value="skill.priority"
                    @input="updateSkillConfig(skill.id, { priority: Number(($event.target as HTMLInputElement).value) })"
                  />
                </div>
              </div>
            </div>

            <h3>配置导入/导出</h3>
            <div class="field">
              <label>配置 JSON</label>
              <textarea v-model="configJsonBuffer" class="config-json" placeholder="点击“导出当前配置”后可复制；粘贴 JSON 后点击“导入并应用”。"></textarea>
            </div>
            <div class="general-actions">
              <button class="btn-save" @click="exportConfigJson">导出当前配置</button>
              <button class="btn-save" @click="importConfigJson">导入并应用</button>
            </div>

            <h3>运行日志</h3>
            <div class="general-actions">
              <button class="btn-save" @click="loadEventLogs">刷新日志</button>
              <button class="btn-save" @click="clearEventLogs">清空日志</button>
            </div>
            <div class="event-log-list">
              <div v-for="item in eventLogs" :key="item.id || `${item.timestamp}-${item.code}`" class="event-log-item">
                <div class="event-log-time">{{ new Date(item.timestamp).toLocaleString() }}</div>
                <div class="event-log-msg">[{{ item.category }}_{{ item.code }}] {{ item.message }}</div>
              </div>
              <p v-if="eventLogs.length === 0" class="placeholder-text">暂无日志</p>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  display: flex;
  height: 100%;
  background-color: var(--bg-app);
  color: var(--text-primary);
}

.settings-sidebar {
  width: 220px;
  background-color: var(--bg-surface);
  border-right: 1px solid var(--border-default);
  padding: 20px 0;
}

.sidebar-title {
  padding: 0 20px 20px;
  font-size: 14px;
  font-weight: bold;
  color: var(--accent-gold);
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--border-default);
  margin-bottom: 10px;
}

.settings-nav-item {
  padding: 12px 20px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
  color: var(--text-secondary);
}

.settings-nav-item:hover {
  background-color: var(--bg-elevated);
  color: var(--text-primary);
}

.settings-nav-item.active {
  background-color: var(--accent-primary-weak);
  color: var(--accent-gold);
  border-left: 3px solid var(--accent-gold);
}

.settings-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-header {
  padding: 20px 30px;
  border-bottom: 1px solid var(--border-default);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--bg-surface);
}

.settings-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: normal;
  color: var(--text-primary);
}

.theme-switcher {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.theme-btn {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  color: var(--text-secondary);
  padding: 8px 14px;
  cursor: pointer;
  transition: all var(--motion-base) ease;
}

.theme-btn:hover {
  border-color: var(--accent-primary);
  color: var(--text-primary);
}

.theme-btn.active {
  background: var(--accent-primary-weak);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.save-section {
  display: flex;
  align-items: center;
  gap: 15px;
}

.status-text {
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 5px;
}

.status-text.saved {
  color: var(--state-success);
}

.status-text.error {
  color: var(--state-danger);
}

.status-text.saving {
  color: var(--accent-gold);
}

.btn-save {
  background-color: var(--accent-gold);
  color: #000;
  border: none;
  padding: 8px 20px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: bold;
  transition: all 0.2s;
}

.btn-save:hover:not(:disabled) {
  background-color: var(--accent-gold-strong);
  box-shadow: 0 0 10px var(--accent-gold-weak);
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.settings-content {
  flex: 1;
  padding: 30px;
  overflow-y: auto;
}

.config-hint {
  color: var(--text-secondary);
  font-size: 13px;
  margin-bottom: 25px;
  padding: 15px;
  background-color: var(--accent-gold-weak);
  border-radius: 6px;
  border-left: 3px solid var(--accent-gold);
  line-height: 1.6;
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
  padding: 0 20px 20px;
  border-top: 1px solid var(--border-default);
}

.field-row {
  display: flex;
  gap: 15px;
  margin-bottom: 15px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field.flex-1 {
  flex: 1;
}

.field.flex-2 {
  flex: 2;
}

.field label {
  font-size: 12px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.field input,
.field select {
  background-color: var(--bg-input);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  padding: 10px 12px;
  color: var(--text-primary);
  font-size: 14px;
  transition: all 0.2s;
  width: 100%;
}

.field select {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237f8897' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 32px;
}

.field select option {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.field input:focus,
.field select:focus {
  border-color: var(--accent-gold);
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-gold-weak);
}

.field input::placeholder {
  color: var(--text-muted);
}

.general-section h3 {
  margin: 0 0 15px;
  font-size: 16px;
  font-weight: normal;
  color: var(--text-primary);
}

.placeholder-text {
  color: var(--text-muted);
  font-style: italic;
}

.general-actions {
  display: flex;
  gap: 10px;
  margin: 10px 0 16px;
}

.skill-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 18px;
}

.skill-item {
  display: grid;
  grid-template-columns: 1fr auto 130px;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background-color: var(--bg-surface);
}

.skill-name {
  color: var(--text-primary);
}

.skill-meta {
  font-size: 12px;
  color: var(--text-secondary);
}

.skill-toggle {
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}

.skill-priority {
  margin: 0;
}

.config-json {
  width: 100%;
  min-height: 140px;
  background-color: var(--bg-input);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  padding: 10px 12px;
  color: var(--text-primary);
  resize: vertical;
  font-family: monospace;
}

.event-log-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.event-log-item {
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 8px 10px;
  background-color: var(--bg-surface);
}

.event-log-time {
  font-size: 12px;
  color: var(--text-secondary);
}

.event-log-msg {
  font-size: 13px;
  color: var(--text-primary);
}

.token-field {
  display: flex;
  align-items: center;
  background-color: var(--bg-input);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  transition: all 0.2s;
}
.token-field:focus-within {
  border-color: var(--accent-gold);
  box-shadow: 0 0 0 2px var(--accent-gold-weak);
}
.token-field input {
  flex: 1;
  background: none;
  border: none;
  padding: 10px 12px;
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
}
.token-field input:focus {
  border: none;
  box-shadow: none;
}
.btn-eye {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  transition: color 0.2s;
}
.btn-eye:hover {
  color: var(--text-primary);
}

.connection-test {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
}
.btn-test {
  background-color: var(--bg-elevated);
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
  padding: 6px 14px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  transition: all 0.2s;
}
.btn-test:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--accent-primary);
}
.btn-test:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.test-msg {
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.test-msg.success { color: var(--state-success); }
.test-msg.error { color: var(--state-danger); }
.test-msg.testing { color: var(--accent-gold); }
</style>
