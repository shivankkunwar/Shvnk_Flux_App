const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Video generation
  generateVideo: (params) => ipcRenderer.invoke('generate-video', params),
  
  // Health check
  checkHealth: () => ipcRenderer.invoke('check-health'),
  
  // Video download
  downloadVideo: (path) => ipcRenderer.invoke('download-video', path),
  
  // Logging
  onRenderLog: (callback) => {
    const cleanup = () => ipcRenderer.removeAllListeners('render-log');
    ipcRenderer.on('render-log', callback);
    return cleanup;
  },

  // Auto-updater methods
  updater: {
    // Manual update check
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    
    // Download update
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    
    // Install and restart
    installUpdate: () => ipcRenderer.invoke('install-update'),
    
    // Get current app version
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    
    // Update event listeners
    onUpdateStatus: (callback) => {
      const cleanup = () => ipcRenderer.removeAllListeners('update-status');
      ipcRenderer.on('update-status', callback);
      return cleanup;
    },
    
    onUpdateAvailable: (callback) => {
      const cleanup = () => ipcRenderer.removeAllListeners('update-available');
      ipcRenderer.on('update-available', callback);
      return cleanup;
    },
    
    onUpdateNotAvailable: (callback) => {
      const cleanup = () => ipcRenderer.removeAllListeners('update-not-available');
      ipcRenderer.on('update-not-available', callback);
      return cleanup;
    },
    
    onUpdateError: (callback) => {
      const cleanup = () => ipcRenderer.removeAllListeners('update-error');
      ipcRenderer.on('update-error', callback);
      return cleanup;
    },
    
    onDownloadProgress: (callback) => {
      const cleanup = () => ipcRenderer.removeAllListeners('update-download-progress');
      ipcRenderer.on('update-download-progress', callback);
      return cleanup;
    },
    
    onUpdateDownloaded: (callback) => {
      const cleanup = () => ipcRenderer.removeAllListeners('update-downloaded');
      ipcRenderer.on('update-downloaded', callback);
      return cleanup;
    }
  }
}); 