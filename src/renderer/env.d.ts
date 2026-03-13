/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module '*.md?raw' {
  const content: string
  export default content
}

interface Window {
  api: {
    saveWorldFile: (content: string, worldName?: string, worldUuid?: string) => Promise<{ success: boolean; filePath?: string; error?: string }>
    saveWorldCards: (content: string, fileName: string) => Promise<{ success: boolean; filePath?: string; error?: string }>
    loadWorldCards: (fileName: string) => Promise<{ success: boolean; content?: string; error?: string }>
    listWorldTemplates: () => Promise<{ success: boolean; files?: string[]; error?: string }>
    deleteWorldTemplate: (fileName: string) => Promise<{ success: boolean; error?: string }>
    loadWorldFileExternal: () => Promise<{ success: boolean; content?: string; cancelled?: boolean; error?: string }>
    importTextFile: () => Promise<{ success: boolean; filename?: string; content?: string; encoding?: string; cancelled?: boolean; error?: string }>
    saveWorldFileExternal: (content: string, suggestedName: string) => Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }>
    // Deprecated - use saveArchiveFile instead
    saveArchive: (content: string) => Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }>
    // Deprecated - use loadArchiveFile instead
    loadArchive: () => Promise<{ success: boolean; content?: string; cancelled?: boolean; error?: string }>
    // New save system
    listSaveFiles: (worldUuid: string) => Promise<{ success: boolean; files?: Array<{ filename: string; timestamp: number }>; error?: string }>
    saveArchiveFile: (content: string, worldUuid: string, worldName: string) => Promise<{ success: boolean; filePath?: string; filename?: string; error?: string }>
    loadArchiveFile: (filename: string) => Promise<{ success: boolean; content?: string; error?: string }>
    deleteArchiveFile: (filename: string) => Promise<{ success: boolean; error?: string }>
    autoSaveOnQuit: (content: string, worldUuid: string, worldName: string) => Promise<{ success: boolean; filePath?: string; filename?: string; error?: string }>
    quitApp: () => Promise<{ success: boolean }>
  }
  
  // Electron API
  electron: typeof import('@electron-toolkit/preload').electronAPI
}
