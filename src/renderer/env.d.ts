/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  api: {
    saveWorldFile: (content: string) => Promise<{ success: boolean; error?: string }>
    saveWorldCards: (content: string, fileName: string) => Promise<{ success: boolean; filePath?: string; error?: string }>
    loadWorldCards: (fileName: string) => Promise<{ success: boolean; content?: string; error?: string }>
    listWorldTemplates: () => Promise<{ success: boolean; files?: string[]; error?: string }>
    loadWorldFileExternal: () => Promise<{ success: boolean; content?: string; cancelled?: boolean; error?: string }>
    saveWorldFileExternal: (content: string, suggestedName: string) => Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }>
    saveArchive: (content: string) => Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }>
    loadArchive: () => Promise<{ success: boolean; content?: string; cancelled?: boolean; error?: string }>
  }
}
