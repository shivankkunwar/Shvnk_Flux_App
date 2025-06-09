const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Generate video function - invokes the main process
  generateVideo: (options) => {
    return ipcRenderer.invoke('generate-video', options);
  },

  // Check health function - invokes the main process
  checkHealth: (engine) => {
    return ipcRenderer.invoke('check-health', engine);
  },

  // Listen for render log events from the main process
  onRenderLog: (callback) => {
    // Remove any existing listeners to prevent memory leaks
    ipcRenderer.removeAllListeners('render-log');
    
    // Add the new listener
    ipcRenderer.on('render-log', (event, data) => {
      callback(data);
    });
  },

  // Utility function to remove render log listeners
  removeRenderLogListeners: () => {
    ipcRenderer.removeAllListeners('render-log');
  }
}); 