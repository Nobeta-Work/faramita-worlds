import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  saveWorldFile: (content: string, worldName?: string, worldUuid?: string) => ipcRenderer.invoke('save-world-file', content, worldName, worldUuid),
  saveWorldCards: (content: string, fileName: string) => ipcRenderer.invoke('save-world-cards', content, fileName),
  loadWorldCards: (fileName: string) => ipcRenderer.invoke('load-world-cards', fileName),
  listWorldTemplates: () => ipcRenderer.invoke('list-world-templates'),
  deleteWorldTemplate: (fileName: string) => ipcRenderer.invoke('delete-world-template', fileName),
  loadWorldFileExternal: () => ipcRenderer.invoke('load-world-file-external'),
  importTextFile: () => ipcRenderer.invoke('import-text-file'),
  saveWorldFileExternal: (content: string, suggestedName: string) => ipcRenderer.invoke('save-world-file-external', content, suggestedName),
  // New save system
  listSaveFiles: (worldUuid: string) => ipcRenderer.invoke('list-save-files', worldUuid),
  saveArchiveFile: (content: string, worldUuid: string, worldName: string) => ipcRenderer.invoke('save-archive-file', content, worldUuid, worldName),
  loadArchiveFile: (filename: string) => ipcRenderer.invoke('load-archive-file', filename),
  deleteArchiveFile: (filename: string) => ipcRenderer.invoke('delete-archive-file', filename),
  autoSaveOnQuit: (content: string, worldUuid: string, worldName: string) => ipcRenderer.invoke('auto-save-on-quit', content, worldUuid, worldName),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  // Deprecated
  saveArchive: (content: string) => ipcRenderer.invoke('save-archive', content),
  loadArchive: () => ipcRenderer.invoke('load-archive')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
