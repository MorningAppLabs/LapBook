// Preload script - secure bridge between main and renderer process
// This runs in a privileged context but exposes only specific APIs to renderer

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose protected methods to renderer process through contextBridge
 * These will be available as window.electronAPI in the renderer
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // Open file dialog and return selected EPUB file path
  openEpubDialog: () => ipcRenderer.invoke('dialog:openEpub'),
  
  // Read EPUB file as ArrayBuffer
  readEpubFile: (filePath) => ipcRenderer.invoke('file:readEpub', filePath),
  
  // Load saved settings from disk
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  
  // Save settings to disk
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  
  // Listen for menu-triggered file open events
  onOpenEpub: (callback) => {
    ipcRenderer.on('open-epub', (event, filePath) => callback(filePath));
  },
  
  // Listen for show about dialog
  onShowAbout: (callback) => {
    ipcRenderer.on('show-about', () => callback());
  },
  
  // Listen for show changelog dialog
  onShowChangelog: (callback) => {
    ipcRenderer.on('show-changelog', () => callback());
  },
  
  // Listen for show privacy policy
  onShowPrivacy: (callback) => {
    ipcRenderer.on('show-privacy', () => callback());
  },
  
  // Listen for show terms of use
  onShowTerms: (callback) => {
    ipcRenderer.on('show-terms', () => callback());
  },
  
  // Open external link in browser
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  // Get changelog file path
  getChangelogPath: () => ipcRenderer.invoke('get-changelog-path'),
  
  // Get privacy policy path
  getPrivacyPath: () => ipcRenderer.invoke('get-privacy-path'),
  
  // Get terms of use path
  getTermsPath: () => ipcRenderer.invoke('get-terms-path'),
  
  // Read file
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  
  // Listen for app closing event (for cleanup)
  onAppClosing: (callback) => {
    ipcRenderer.on('app-closing', () => callback());
  },
  
  // Load highlights for a specific book
  loadHighlights: (bookIdentifier) => ipcRenderer.invoke('highlights:load', bookIdentifier),
  
  // Save highlights for a specific book
  saveHighlights: (bookIdentifier, highlights) => ipcRenderer.invoke('highlights:save', bookIdentifier, highlights),
  
  // Library operations
  loadLibrary: () => ipcRenderer.invoke('library:load'),
  saveLibrary: (library) => ipcRenderer.invoke('library:save', library),
  saveCover: (bookId, imageData) => ipcRenderer.invoke('library:saveCover', bookId, imageData),
  getCoverPath: (bookId) => ipcRenderer.invoke('library:getCoverPath', bookId)
});
