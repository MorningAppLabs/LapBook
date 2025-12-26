// Electron main process - handles app lifecycle and window management
const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { checkForUpdates, showChangelogIfNeeded } = require('./updater');

// Reference to main window
let mainWindow;

// Global error handler
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  // Log to file in production
  if (!app.isPackaged) {
    console.error('Stack:', error.stack);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled promise rejection:', reason);
});

/**
 * Create the main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      // Enable secure IPC communication between main and renderer
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // Security: isolate renderer from Node.js
      nodeIntegration: false, // Security: disable Node.js in renderer
      sandbox: false // Allow preload script to use Node.js
    },
    backgroundColor: '#f5f5dc', // Sepia default
    icon: path.join(__dirname, 'LapBook Icon.png')
  });

  // Load the main HTML file
  mainWindow.loadFile('renderer/index.html');

  // Open DevTools in development (comment out for production)
  // mainWindow.webContents.openDevTools();

  // Create application menu
  createMenu();
  
  // Show changelog if this is a new version
  showChangelogIfNeeded(mainWindow);
  
  // Check for updates on startup
  setTimeout(() => {
    checkForUpdates(mainWindow, false);
  }, 3000); // Wait 3 seconds after startup
  
  // Cleanup on window close to prevent memory leaks
  mainWindow.on('close', () => {
    // Send cleanup signal to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app-closing');
    }
  });
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Create application menu with File options
 */
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Book (EPUB/PDF)...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            openEpubFile();
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'Alt+F4',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About LapBook',
          click: () => {
            mainWindow.webContents.send('show-about');
          }
        },
        {
          label: 'Changelog',
          click: () => {
            mainWindow.webContents.send('show-changelog');
          }
        },
        {
          label: 'Check for Updates',
          click: () => {
            checkForUpdates(mainWindow, true);
          }
        },
        { type: 'separator' },
        {
          label: 'Bug Report / Feature Request',
          click: () => {
            const version = app.getVersion();
            const subject = encodeURIComponent(`LapBook v${version} - Bug Report/Feature Request`);
            shell.openExternal(`mailto:morningapplabs@gmail.com?subject=${subject}`);
          }
        },
        { type: 'separator' },
        {
          label: 'Privacy Policy',
          click: () => {
            mainWindow.webContents.send('show-privacy');
          }
        },
        {
          label: 'Terms of Use',
          click: () => {
            mainWindow.webContents.send('show-terms');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/**
 * Open file dialog to select an EPUB or PDF file
 */
async function openEpubFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'eBooks', extensions: ['epub', 'pdf'] },
      { name: 'EPUB Books', extensions: ['epub'] },
      { name: 'PDF Documents', extensions: ['pdf'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    // Send the file path to renderer process
    mainWindow.webContents.send('open-epub', filePath);
  }
}

// Handle IPC request to open EPUB or PDF file dialog
ipcMain.handle('dialog:openEpub', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'eBooks', extensions: ['epub', 'pdf'] },
      { name: 'EPUB Books', extensions: ['epub'] },
      { name: 'PDF Documents', extensions: ['pdf'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// Handle reading EPUB file as ArrayBuffer (needed by epub.js)
ipcMain.handle('file:readEpub', async (event, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    
    // CRITICAL FIX: Convert Node.js Buffer to ArrayBuffer
    // epub.js requires a true ArrayBuffer, not a Node.js Buffer.
    // When Buffer crosses the IPC boundary via contextBridge, it doesn't
    // automatically convert to ArrayBuffer - we must do it explicitly.
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );
    
    return arrayBuffer;
  } catch (error) {
    console.error('Error reading EPUB file:', error);
    throw error;
  }
});

// Handle settings file operations
ipcMain.handle('settings:load', async () => {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error('Error loading settings:', error);
    return null;
  }
});

ipcMain.handle('settings:save', async (event, settings) => {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving settings:', error);
    return false;
  }
});

// Handle highlights operations
ipcMain.handle('highlights:load', async (event, bookIdentifier) => {
  try {
    const highlightsDir = path.join(app.getPath('userData'), 'highlights');
    if (!fs.existsSync(highlightsDir)) {
      fs.mkdirSync(highlightsDir, { recursive: true });
    }
    
    const highlightsPath = path.join(highlightsDir, `${bookIdentifier}.json`);
    if (fs.existsSync(highlightsPath)) {
      const data = fs.readFileSync(highlightsPath, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('Error loading highlights:', error);
    return [];
  }
});

ipcMain.handle('highlights:save', async (event, bookIdentifier, highlights) => {
  try {
    const highlightsDir = path.join(app.getPath('userData'), 'highlights');
    if (!fs.existsSync(highlightsDir)) {
      fs.mkdirSync(highlightsDir, { recursive: true });
    }
    
    const highlightsPath = path.join(highlightsDir, `${bookIdentifier}.json`);
    fs.writeFileSync(highlightsPath, JSON.stringify(highlights, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving highlights:', error);
    return false;
  }
});

// Handle library operations
ipcMain.handle('library:load', async () => {
  try {
    const libraryPath = path.join(app.getPath('userData'), 'library.json');
    if (fs.existsSync(libraryPath)) {
      const data = fs.readFileSync(libraryPath, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('Error loading library:', error);
    return [];
  }
});

ipcMain.handle('library:save', async (event, library) => {
  try {
    const libraryPath = path.join(app.getPath('userData'), 'library.json');
    fs.writeFileSync(libraryPath, JSON.stringify(library, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving library:', error);
    return false;
  }
});

// Handle cover image storage
ipcMain.handle('library:saveCover', async (event, bookId, imageData) => {
  try {
    const coversDir = path.join(app.getPath('userData'), 'covers');
    if (!fs.existsSync(coversDir)) {
      fs.mkdirSync(coversDir, { recursive: true });
    }
    
    const coverPath = path.join(coversDir, `${bookId}.jpg`);
    // Remove data URL prefix if present
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(coverPath, base64Data, 'base64');
    return coverPath;
  } catch (error) {
    console.error('Error saving cover:', error);
    return null;
  }
});

ipcMain.handle('library:getCoverPath', async (event, bookId) => {
  try {
    const coversDir = path.join(app.getPath('userData'), 'covers');
    const coverPath = path.join(coversDir, `${bookId}.jpg`);
    if (fs.existsSync(coverPath)) {
      return coverPath;
    }
    return null;
  } catch (error) {
    console.error('Error getting cover path:', error);
    return null;
  }
});

// Handle IPC request to open external URL
ipcMain.handle('open-external', async (event, url) => {
  shell.openExternal(url);
});

// Handle IPC request to get changelog path
ipcMain.handle('get-changelog-path', () => {
  return path.join(__dirname, 'CHANGELOG.md');
});

// Handle IPC request to get privacy policy path
ipcMain.handle('get-privacy-path', () => {
  return path.join(__dirname, 'PRIVACY.md');
});

// Handle IPC request to get terms of use path
ipcMain.handle('get-terms-path', () => {
  return path.join(__dirname, 'TERMS.md');
});

// Handle IPC request to read file
ipcMain.handle('read-file', async (event, filePath) => {
  return fs.readFileSync(filePath, 'utf8');
});

// App lifecycle events
app.whenReady().then(() => {
  createWindow();

  // On macOS, re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
