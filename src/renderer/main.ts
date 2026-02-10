import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './assets/main.css'
import { importInitialData } from './db/importer'

const app = createApp(App)
app.use(createPinia())

importInitialData().then(() => {
  app.mount('#app')
}).catch(err => {
  console.error('数据库初始化失败，请检查文件权限或是否有其他实例正在运行:', err)
  // 即使失败也挂载，让 UI 显示但可能提示错误
  app.mount('#app')
})
