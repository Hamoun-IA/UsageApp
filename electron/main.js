const path = require('node:path');
const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');

const db = require('./db');
const { registerIpcHandlers } = require('./ipc');
const { toggleWidget, setWidgetHeight } = require('./widget-window');

// Scheduler and notifier disabled during transition (M1.8) — will be refactored in M5.
// const Scheduler = require('./scheduler');
// const notifier = require('./notifier');

let mainWindow = null;
let tray = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#020617',
    title: 'AI Usage Monitor',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Hide to tray on close (so the app keeps running in the background).
  mainWindow.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const fs = require('fs');
  const pngPath = path.join(__dirname, '..', 'build', 'icon.png');
  const icoPath = path.join(__dirname, '..', 'build', 'icon.ico');

  try {
    const iconPath = fs.existsSync(pngPath) ? pngPath : icoPath;
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  } catch {
    tray = new Tray(nativeImage.createEmpty());
  }

  const ctx = Menu.buildFromTemplate([
    { label: 'Open Widget', click: () => toggleWidget(tray) },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]);
  tray.setToolTip('AI Usage Monitor');
  tray.setContextMenu(ctx);
  tray.on('click', () => toggleWidget(tray));
}

// ---- Misc IPC kept from legacy (non-db) ----

ipcMain.handle('app:open-external', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
  return { ok: true };
});

ipcMain.on('widget:setHeight', (_e, height) => {
  if (typeof height === 'number' && Number.isFinite(height)) setWidgetHeight(height);
});

// ---------------------------- App lifecycle ----------------------------

app.whenReady().then(() => {
  db.init();
  registerIpcHandlers({ db });
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  app.isQuiting = true;
});

app.on('window-all-closed', () => {
  // Keep running in tray; quit only on explicit Quit.
  if (process.platform !== 'darwin' && app.isQuiting) app.quit();
});
