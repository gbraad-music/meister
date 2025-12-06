const { app, BrowserWindow } = require('electron');
//const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // Enable Web MIDI API in Electron
      enableBlinkFeatures: 'WebMIDIAPI'
    },
    // Uncomment for fullscreen/kiosk mode
    fullscreen: true,
    // kiosk: true,
    backgroundColor: '#000000',
    title: 'Meister - MIDI Controller Suite for DJ Performance'
  });

  mainWindow.loadFile('index.html');

  // Open DevTools in development mode
  if (process.argv.includes('--enable-logging')) {
    mainWindow.webContents.openDevTools();
  }

  // Toggle DevTools with F12
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked and no windows are open
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});