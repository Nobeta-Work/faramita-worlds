<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useConfigStore } from '../store/config'
import { Settings, Save, Check, AlertCircle, MessageCircle, Image, Video, ChevronDown, ChevronRight } from 'lucide-vue-next'

const configStore = useConfigStore()

const activeSettingTab = ref('ai-api')
const activeSubTab = ref<'chat' | 'image' | 'video'>('chat')
const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const statusMessage = ref('')

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

const subTabs = [
  { id: 'chat', name: '对话', icon: MessageCircle },
  { id: 'image', name: '图像', icon: Image },
  { id: 'video', name: '视频', icon: Video }
]

const toggleSection = (section: string) => {
  expandedSections.value[section] = !expandedSections.value[section]
}

const handleSave = async () => {
  saveStatus.value = 'saving'
  statusMessage.value = '正在保存...'
  
  try {
    configStore.apiKey = apiConfig.value.chat.token
    configStore.baseUrl = apiConfig.value.chat.baseUrl
    configStore.model = apiConfig.value.chat.model
    await configStore.saveConfig()
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

const loadConfig = async () => {
  await configStore.loadConfig()
  if (configStore.baseUrl || configStore.model) {
    apiConfig.value.chat.baseUrl = configStore.baseUrl
    apiConfig.value.chat.token = configStore.apiKey
    apiConfig.value.chat.model = configStore.model
  }
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
                    <input 
                      v-model="apiConfig.chat.token" 
                      type="password" 
                      placeholder="sk-..."
                    />
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
                    <input 
                      v-model="apiConfig.image.token" 
                      type="password" 
                      placeholder="sk-..."
                    />
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
                    <input 
                      v-model="apiConfig.video.token" 
                      type="password" 
                      placeholder="sk-..."
                    />
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
              </div>
            </div>
          </div>
        </template>
        
        <!-- General Settings (Placeholder) -->
        <template v-if="activeSettingTab === 'general'">
          <div class="general-section">
            <h3>通用设置</h3>
            <p class="placeholder-text">更多系统设置选项预留空间...</p>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  display: flex;
  height: 100vh;
  background-color: #121212;
  color: #eee;
}

.settings-sidebar {
  width: 220px;
  background-color: #1a1a1a;
  border-right: 1px solid #333;
  padding: 20px 0;
}

.sidebar-title {
  padding: 0 20px 20px;
  font-size: 14px;
  font-weight: bold;
  color: #d4af37;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid #333;
  margin-bottom: 10px;
}

.settings-nav-item {
  padding: 12px 20px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
  color: #888;
}

.settings-nav-item:hover {
  background-color: #252525;
  color: #eee;
}

.settings-nav-item.active {
  background-color: #2a2a2a;
  color: #d4af37;
  border-left: 3px solid #d4af37;
}

.settings-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-header {
  padding: 20px 30px;
  border-bottom: 1px solid #333;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #161616;
}

.settings-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: normal;
  color: #eee;
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
  color: #4ecdc4;
}

.status-text.error {
  color: #ff6b6b;
}

.status-text.saving {
  color: #d4af37;
}

.btn-save {
  background-color: #d4af37;
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
  background-color: #f0c040;
  box-shadow: 0 0 10px rgba(212, 175, 55, 0.3);
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
  color: #888;
  font-size: 13px;
  margin-bottom: 25px;
  padding: 15px;
  background-color: rgba(212, 175, 55, 0.05);
  border-radius: 6px;
  border-left: 3px solid #d4af37;
  line-height: 1.6;
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
  padding: 0 20px 20px;
  border-top: 1px solid #333;
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
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.field input {
  background-color: #252525;
  border: 1px solid #333;
  border-radius: 4px;
  padding: 10px 12px;
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

.general-section h3 {
  margin: 0 0 15px;
  font-size: 16px;
  font-weight: normal;
  color: #ccc;
}

.placeholder-text {
  color: #666;
  font-style: italic;
}
</style>
