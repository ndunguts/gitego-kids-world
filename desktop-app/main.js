const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const APP_URL = process.env.GITEGO_APP_URL || 'https://gitego-kids-world.onrender.com';

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'Gitego Kids World',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#06070b',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Open external links safely in the user's system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Show sleek offline page if no internet connection
  win.webContents.on('did-fail-load', (_event, errorCode) => {
    if (errorCode !== -3) {
      win.loadFile(path.join(__dirname, 'offline.html'));
    }
  });

  win.loadURL(APP_URL);
}

app.whenReady().then(() => {
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
