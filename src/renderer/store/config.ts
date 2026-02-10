import { defineStore } from 'pinia'
import { db } from '../db/db'

export const useConfigStore = defineStore('config', {
  state: () => ({
    apiKey: '',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat'
  }),
  actions: {
    async loadConfig() {
      const apiRecord = await db.settings.get('api_config')
      if (apiRecord) {
        this.apiKey = apiRecord.value.apiKey
        this.baseUrl = apiRecord.value.baseUrl
        this.model = apiRecord.value.model
      }
    },
    async saveConfig() {
      await db.settings.put({
        key: 'api_config',
        value: {
          apiKey: this.apiKey,
          baseUrl: this.baseUrl,
          model: this.model
        }
      })
    }
  }
})
