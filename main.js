const { app, BrowserWindow, ipcMain, protocol, dialog, net } = require('electron');
const fs = require('fs');
const { pathToFileURL, URL } = require('url');

// Register protocol as standard scheme before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app-video',
    privileges: {
      secure: true,
      standard: true,
      supportsFetchAPI: true,
      stream: true // Critical for media playback
    }
  }
]);
const path = require('path');
const isDev = require('electron-is-dev');
const { setupApiHandlers } = require('./server-node/api');

// Keep a global reference of the window object
let mainWindow;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false, // Security: disable node integration in renderer
      contextIsolation: true, // Security: enable context isolation
      enableRemoteModule: false, // Security: disable remote module
      preload: path.join(__dirname, 'preload.js') // Load our preload script
    },
    show: false, // Don't show until ready to prevent visual flash
    icon: path.join(__dirname, 'assets/icon.png') // Will add icon later
  });

  // Load the appropriate content based on environment
  if (isDev) {
    // Development: Load from Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // Production: Load from built files
    mainWindow.loadFile(path.join(__dirname, 'frontend/dist/index.html'));
  }

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // --- New Download Handler ---
  // Listen for download requests from the renderer process
  mainWindow.webContents.session.on('will-download', (event, item, webContents) => {
    // Prevent default Electron download behavior
    event.preventDefault();

    // Show a native "Save As..." dialog
    const savePath = dialog.showSaveDialogSync({
      defaultPath: item.getFilename()
    });

    if (savePath) {
      // If the user chose a location, save the file there
      item.setSavePath(savePath);
      item.on('done', (e, state) => {
        if (state === 'completed') {
          console.log('Download completed successfully');
          // Optionally, send a notification to the renderer
          // webContents.send('download-complete', savePath);
        } else {
          console.log(`Download failed: ${state}`);
        }
      });
    }
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  protocol.handle('app-video', (request) => {
    // Parse the video ID from the URL using the URL API to avoid trailing slash
    const urlObj = new URL(request.url);
    const videoId = urlObj.hostname;
    const videoPath = path.normalize(
      path.join(__dirname, 'server-node', 'media', 'videos', `${videoId}.mp4`)
    );
    
    // Ensure the file exists
    if (!fs.existsSync(videoPath)) {
      console.error(`Video file not found: ${videoPath}`);
      return new Response('File not found', { status: 404 });
    }
    
    // Convert to a file:// URL and use net.fetch to stream it
    const fileUrl = pathToFileURL(videoPath).toString();
    return net.fetch(fileUrl);
  });

  createWindow();
  
  // Setup API Handlers - replaces the TODO comment
  setupApiHandlers(ipcMain);
  
  // On macOS, re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
  });
}); 