import { defineStore } from 'pinia'
import { db } from '../db/db'
import type { SkillConfig } from '@shared/Interface'
import { SkillRegistry } from '../core/SkillRegistry'
import { toRaw } from 'vue'

const toPlainObject = <T>(value: T): T => {
  return JSON.parse(JSON.stringify(toRaw(value))) as T
}

export const useConfigStore = defineStore('config', {
  state: () => ({
    apiKey: typeof process !== 'undefined' && process.env && process.env.MS_KEY ? process.env.MS_KEY : '',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    // AI parameters
    temperature: 0.7,
    maxTokens: 4096,
    retryCount: 1,
    timeout: 60000,
    // Memory system parameters
    shortTermWindowSize: 8,
    summarizationThreshold: 30,
    tokenBudget: 6000,
    // Runtime world preference
    lastWorldUuid: '',
    // Welcome screen
    skipWelcome: false,
    // Skill configs
    skillConfigs: {} as Record<string, SkillConfig>,
    // v0.2.1: Debug and observability
    debugMode: false,
    contextViewerEnabled: false,
    defaultSceneMode: 'normal' as 'normal' | 'exploration' | 'social' | 'conflict',
    retrievalBudgetPercent: 0.25,
    semanticRetrievalEnabled: false
  }),
  actions: {
    async loadConfig() {
      const apiRecord = await db.settings.get('api_config')
      if (apiRecord) {
        this.apiKey = apiRecord.value.apiKey
        this.baseUrl = apiRecord.value.baseUrl
        this.model = apiRecord.value.model
        // Load extended params if present
        if (apiRecord.value.temperature !== undefined) this.temperature = apiRecord.value.temperature
        if (apiRecord.value.maxTokens !== undefined) this.maxTokens = apiRecord.value.maxTokens
        if (apiRecord.value.retryCount !== undefined) this.retryCount = apiRecord.value.retryCount
        if (apiRecord.value.timeout !== undefined) this.timeout = apiRecord.value.timeout
        if (apiRecord.value.shortTermWindowSize !== undefined) this.shortTermWindowSize = apiRecord.value.shortTermWindowSize
        if (apiRecord.value.summarizationThreshold !== undefined) this.summarizationThreshold = apiRecord.value.summarizationThreshold
        if (apiRecord.value.tokenBudget !== undefined) this.tokenBudget = apiRecord.value.tokenBudget
        if (apiRecord.value.debugMode !== undefined) this.debugMode = apiRecord.value.debugMode
        if (apiRecord.value.contextViewerEnabled !== undefined) this.contextViewerEnabled = apiRecord.value.contextViewerEnabled
        if (apiRecord.value.defaultSceneMode !== undefined) this.defaultSceneMode = apiRecord.value.defaultSceneMode
        if (apiRecord.value.retrievalBudgetPercent !== undefined) this.retrievalBudgetPercent = apiRecord.value.retrievalBudgetPercent
        if (apiRecord.value.semanticRetrievalEnabled !== undefined) this.semanticRetrievalEnabled = apiRecord.value.semanticRetrievalEnabled
      }

      const lastWorldRecord = await db.settings.get('last_world_uuid')
      if (typeof lastWorldRecord?.value === 'string') {
        this.lastWorldUuid = lastWorldRecord.value
      }

      const skipRecord = await db.settings.get('skip_welcome')
      if (skipRecord?.value === true) {
        this.skipWelcome = true
      }

      // Load skill configs
      const skillRecord = await db.settings.get('skill_configs')
      if (skillRecord && skillRecord.value) {
        this.skillConfigs = skillRecord.value
        SkillRegistry.applyConfigs(this.skillConfigs)
      }
    },
    async saveConfig() {
      await db.settings.put({
        key: 'api_config',
        value: {
          apiKey: this.apiKey,
          baseUrl: this.baseUrl,
          model: this.model,
          temperature: this.temperature,
          maxTokens: this.maxTokens,
          retryCount: this.retryCount,
          timeout: this.timeout,
          shortTermWindowSize: this.shortTermWindowSize,
          summarizationThreshold: this.summarizationThreshold,
          tokenBudget: this.tokenBudget,
          debugMode: this.debugMode,
          contextViewerEnabled: this.contextViewerEnabled,
          defaultSceneMode: this.defaultSceneMode,
          retrievalBudgetPercent: this.retrievalBudgetPercent,
          semanticRetrievalEnabled: this.semanticRetrievalEnabled
        }
      })

      await db.settings.put({
        key: 'last_world_uuid',
        value: this.lastWorldUuid || ''
      })

      await db.settings.put({
        key: 'skip_welcome',
        value: this.skipWelcome
      })
    },
    async saveSkillConfigs() {
      const plainSkillConfigs = toPlainObject(this.skillConfigs)
      await db.settings.put({
        key: 'skill_configs',
        value: plainSkillConfigs
      })
      SkillRegistry.applyConfigs(plainSkillConfigs)
    },
    updateSkillConfig(skillId: string, config: Partial<SkillConfig>) {
      const existing = this.skillConfigs[skillId] || { enabled: true, priority: 0, params: {} }
      this.skillConfigs[skillId] = { ...existing, ...config }
    },
    exportConfig() {
      return {
        api: {
          apiKey: this.apiKey,
          baseUrl: this.baseUrl,
          model: this.model,
          temperature: this.temperature,
          maxTokens: this.maxTokens,
          retryCount: this.retryCount,
          timeout: this.timeout
        },
        memory: {
          shortTermWindowSize: this.shortTermWindowSize,
          summarizationThreshold: this.summarizationThreshold,
          tokenBudget: this.tokenBudget
        },
        debug: {
          debugMode: this.debugMode,
          contextViewerEnabled: this.contextViewerEnabled,
          defaultSceneMode: this.defaultSceneMode,
          retrievalBudgetPercent: this.retrievalBudgetPercent,
          semanticRetrievalEnabled: this.semanticRetrievalEnabled
        },
        world: {
          lastWorldUuid: this.lastWorldUuid
        },
        skills: this.skillConfigs
      }
    },
    async importConfig(payload: any) {
      if (payload?.api) {
        this.apiKey = payload.api.apiKey ?? this.apiKey
        this.baseUrl = payload.api.baseUrl ?? this.baseUrl
        this.model = payload.api.model ?? this.model
        this.temperature = payload.api.temperature ?? this.temperature
        this.maxTokens = payload.api.maxTokens ?? this.maxTokens
        this.retryCount = payload.api.retryCount ?? this.retryCount
        this.timeout = payload.api.timeout ?? this.timeout
      }

      if (payload?.memory) {
        this.shortTermWindowSize = payload.memory.shortTermWindowSize ?? this.shortTermWindowSize
        this.summarizationThreshold = payload.memory.summarizationThreshold ?? this.summarizationThreshold
        this.tokenBudget = payload.memory.tokenBudget ?? this.tokenBudget
      }

      if (payload?.world?.lastWorldUuid !== undefined) {
        this.lastWorldUuid = payload.world.lastWorldUuid
      }

      if (payload?.debug) {
        this.debugMode = payload.debug.debugMode ?? this.debugMode
        this.contextViewerEnabled = payload.debug.contextViewerEnabled ?? this.contextViewerEnabled
        this.defaultSceneMode = payload.debug.defaultSceneMode ?? this.defaultSceneMode
        this.retrievalBudgetPercent = payload.debug.retrievalBudgetPercent ?? this.retrievalBudgetPercent
        this.semanticRetrievalEnabled = payload.debug.semanticRetrievalEnabled ?? this.semanticRetrievalEnabled
      }

      if (payload?.skills && typeof payload.skills === 'object') {
        this.skillConfigs = payload.skills
      }

      await this.saveConfig()
      await this.saveSkillConfigs()
    }
  }
})
