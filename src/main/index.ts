import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { writeFile, readFile, readdir, mkdir, stat, unlink } from 'fs/promises'
import { existsSync } from 'fs'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  ipcMain.handle('save-world-file', async (_event, content: string) => {
    try {
      // Use app.getAppPath() to find the project root
      // In development, app.getAppPath() usually points to the project root or the build output directory
      // We want to target src/world_template/Oort.json specifically for the user's template
      const projectRoot = app.getAppPath()
      let filePath = ''
      
      if (is.dev) {
        // In dev mode with electron-vite, index.js is in out/main/
        filePath = join(projectRoot, 'src/world_template/Oort.json')
      } else {
        // In production, this file might be in a different location
        // For now, we still try to find it relative to the app path
        filePath = join(projectRoot, 'src/world_template/Oort.json')
      }
      
      await writeFile(filePath, content, 'utf8')
      return { success: true }
    } catch (error: any) {
      console.error('Failed to save world file:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('save-archive', async (_event, content: string) => {
    try {
      const { filePath } = await dialog.showSaveDialog({
        title: 'Save Archive',
        defaultPath: 'archive.json',
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
      })

      if (!filePath) {
        return { success: false, cancelled: true }
      }

      await writeFile(filePath, content, 'utf8')
      return { success: true, filePath }
    } catch (error: any) {
      console.error('Failed to save archive:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('load-archive', async () => {
    try {
      const { filePaths, canceled } = await dialog.showOpenDialog({
        title: 'Load Archive',
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
        properties: ['openFile']
      })

      if (canceled || filePaths.length === 0) {
        return { success: false, cancelled: true }
      }

      const content = await readFile(filePaths[0], 'utf8')
      return { success: true, content }
    } catch (error: any) {
      console.error('Failed to load archive:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('save-world-cards', async (_event, content: string, fileName: string) => {
    try {
      const projectRoot = app.getAppPath()
      console.log('[Main] save-world-cards called')
      console.log('[Main] projectRoot:', projectRoot)
      console.log('[Main] fileName:', fileName)
      console.log('[Main] is.dev:', is.dev)
      
      let filePath = ''
      
      if (is.dev) {
        filePath = join(projectRoot, 'src/world_template', fileName.endsWith('.json') ? fileName : `${fileName}.json`)
      } else {
        filePath = join(projectRoot, 'src/world_template', fileName.endsWith('.json') ? fileName : `${fileName}.json`)
      }
      
      console.log('[Main] Writing to filePath:', filePath)
      await writeFile(filePath, content, 'utf8')
      console.log('[Main] File written successfully')
      return { success: true, filePath }
    } catch (error: any) {
      console.error('[Main] Failed to save world cards:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('load-world-cards', async (_event, fileName: string) => {
    try {
      const projectRoot = app.getAppPath()
      let filePath = ''
      
      if (is.dev) {
        filePath = join(projectRoot, 'src/world_template', fileName.endsWith('.json') ? fileName : `${fileName}.json`)
      } else {
        filePath = join(projectRoot, 'src/world_template', fileName.endsWith('.json') ? fileName : `${fileName}.json`)
      }

      const content = await readFile(filePath, 'utf8')
      return { success: true, content }
    } catch (error: any) {
      console.error('Failed to load world cards:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('list-world-templates', async () => {
    try {
      const projectRoot = app.getAppPath()
      let templateDir = ''
      
      if (is.dev) {
        templateDir = join(projectRoot, 'src/world_template')
      } else {
        templateDir = join(projectRoot, 'src/world_template')
      }

      const { readdirSync } = await import('fs')
      const files = readdirSync(templateDir).filter(f => f.endsWith('.json'))
      return { success: true, files }
    } catch (error: any) {
      console.error('Failed to list world templates:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('load-world-file-external', async () => {
    try {
      const { filePaths, canceled } = await dialog.showOpenDialog({
        title: '导入世界书',
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
        properties: ['openFile']
      })

      if (canceled || filePaths.length === 0) {
        return { success: false, cancelled: true }
      }

      const content = await readFile(filePaths[0], 'utf8')
      return { success: true, content }
    } catch (error: any) {
      console.error('Failed to load world file:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('save-world-file-external', async (_event, content: string, suggestedName: string) => {
    try {
      const { filePath } = await dialog.showSaveDialog({
        title: '导出世界书',
        defaultPath: `${suggestedName}.json`,
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
      })

      if (!filePath) {
        return { success: false, cancelled: true }
      }

      await writeFile(filePath, content, 'utf8')
      return { success: true, filePath }
    } catch (error: any) {
      console.error('Failed to save world file:', error)
      return { success: false, error: error.message }
    }
  })

  // New Save Archive System
  const getSaveDir = () => {
    const projectRoot = app.getAppPath()
    if (is.dev) {
      return join(projectRoot, 'saves')
    } else {
      return join(projectRoot, 'saves')
    }
  }

  const ensureSaveDir = async () => {
    const saveDir = getSaveDir()
    if (!existsSync(saveDir)) {
      await mkdir(saveDir, { recursive: true })
    }
    return saveDir
  }

  ipcMain.handle('list-save-files', async (_event, worldUuid: string) => {
    try {
      const saveDir = await ensureSaveDir()
      const files = await readdir(saveDir)
      
      // Filter save files for this world (worldName.save.json or worldName.save.1.json etc)
      const saveFiles = files.filter(f => 
        f.includes(worldUuid) && f.endsWith('.save.json')
      )
      
      // Get file stats to sort by modification time
      const filesWithStats = await Promise.all(
        saveFiles.map(async (filename) => {
          const filePath = join(saveDir, filename)
          const stats = await stat(filePath)
          return {
            filename,
            filePath,
            mtime: stats.mtime.getTime()
          }
        })
      )
      
      // Sort by modification time (newest first)
      filesWithStats.sort((a, b) => b.mtime - a.mtime)
      
      return { 
        success: true, 
        files: filesWithStats.map(f => ({
          filename: f.filename,
          timestamp: f.mtime
        }))
      }
    } catch (error: any) {
      console.error('Failed to list save files:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('save-archive-file', async (_event, content: string, worldUuid: string, worldName: string) => {
    try {
      const saveDir = await ensureSaveDir()
      const timestamp = Date.now()
      
      // List existing saves for this world
      const files = await readdir(saveDir)
      const worldSaves = files.filter(f => 
        f.includes(worldUuid) && f.endsWith('.save.json')
      )
      
      // Get file stats
      const filesWithStats = await Promise.all(
        worldSaves.map(async (filename) => {
          const filePath = join(saveDir, filename)
          const stats = await stat(filePath)
          return {
            filename,
            filePath,
            mtime: stats.mtime.getTime()
          }
        })
      )
      
      // Sort by modification time (oldest first)
      filesWithStats.sort((a, b) => a.mtime - b.mtime)
      
      // Delete oldest if we have 5 or more
      if (filesWithStats.length >= 5) {
        const toDelete = filesWithStats.slice(0, filesWithStats.length - 4)
        for (const file of toDelete) {
          await unlink(file.filePath)
        }
      }
      
      // Save new file
      const fileName = `${worldName}_${worldUuid}_${timestamp}.save.json`
      const filePath = join(saveDir, fileName)
      await writeFile(filePath, content, 'utf8')
      
      return { success: true, filePath, filename: fileName }
    } catch (error: any) {
      console.error('Failed to save archive file:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('load-archive-file', async (_event, filename: string) => {
    try {
      const saveDir = getSaveDir()
      const filePath = join(saveDir, filename)
      const content = await readFile(filePath, 'utf8')
      return { success: true, content }
    } catch (error: any) {
      console.error('Failed to load archive file:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('delete-archive-file', async (_event, filename: string) => {
    try {
      const saveDir = getSaveDir()
      const filePath = join(saveDir, filename)
      await unlink(filePath)
      return { success: true }
    } catch (error: any) {
      console.error('Failed to delete archive file:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('auto-save-on-quit', async (_event, content: string, worldUuid: string, worldName: string) => {
    try {
      const saveDir = await ensureSaveDir()
      const timestamp = Date.now()

      const files = await readdir(saveDir)
      const worldSaves = files.filter(f =>
        f.includes(worldUuid) && f.endsWith('.save.json')
      )

      const filesWithStats = await Promise.all(
        worldSaves.map(async (filename) => {
          const filePath = join(saveDir, filename)
          const stats = await stat(filePath)
          return {
            filename,
            filePath,
            mtime: stats.mtime.getTime()
          }
        })
      )

      filesWithStats.sort((a, b) => a.mtime - b.mtime)

      if (filesWithStats.length >= 5) {
        const toDelete = filesWithStats.slice(0, filesWithStats.length - 4)
        for (const file of toDelete) {
          await unlink(file.filePath)
        }
      }

      const fileName = `${worldName}_${worldUuid}_${timestamp}.save.json`
      const filePath = join(saveDir, fileName)
      await writeFile(filePath, content, 'utf8')

      console.log(`[Auto-save] Archive saved to ${fileName}`)
      return { success: true, filePath, filename: fileName }
    } catch (error: any) {
      console.error('Failed to auto-save on quit:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('quit-app', async () => {
    app.quit()
    return { success: true }
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
