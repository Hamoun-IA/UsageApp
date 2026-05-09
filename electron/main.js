const path = require('node:path');
const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, globalShortcut, Notification } = require('electron');

const db = require('./db');
const ipcModule = require('./ipc');
const { registerIpcHandlers, deps: ipcDeps } = ipcModule;
const { listAdapters, getAdapter } = require('./providers');
const alerts = require('./alerts');
const refreshProviders = require('./refresh-providers');
const { Poller } = require('./poller');
const notifyModule = require('./notify');
const trayState = require('./tray-state');
const { toggleWidget, setWidgetHeight } = require('./widget-window');

const DEFAULT_POLL_INTERVAL_MIN = 5;
const DEFAULT_SHORTCUT = 'CommandOrControl+Shift+Alt+U';

let mainWindow = null;
let tray = null;
let poller = null;
let currentShortcut = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function trayIconPaths() {
  return {
    normal:   path.join(__dirname, '..', 'build', 'tray-normal.png'),
    critical: path.join(__dirname, '..', 'build', 'tray-critical.png'),
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#020617',
    title: 'AI Usage Monitor',
    autoHideMenuBar: true,
    show: false,
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

  mainWindow.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const fs = require('fs');
  const paths = trayIconPaths();
  const fallback = path.join(__dirname, '..', 'build', 'icon.png');

  let initial;
  try {
    if (fs.existsSync(paths.normal)) initial = nativeImage.createFromPath(paths.normal);
    else if (fs.existsSync(fallback)) initial = nativeImage.createFromPath(fallback);
    else initial = nativeImage.createEmpty();
  } catch {
    initial = nativeImage.createEmpty();
  }
  tray = new Tray(initial.isEmpty() ? nativeImage.createEmpty() : initial);

  const ctx = Menu.buildFromTemplate([
    { label: 'Open Widget', click: () => toggleWidget(tray) },
    { label: 'Open Detail Window', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
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
  tray.on('double-click', () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  });
}

ipcMain.handle('app:open-external', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
  return { ok: true };
});

ipcMain.on('widget:setHeight', (_e, height) => {
  if (typeof height === 'number' && Number.isFinite(height)) setWidgetHeight(height);
});

ipcMain.handle('app:openDetail', () => {
  if (!mainWindow) return false;
  mainWindow.show();
  mainWindow.focus();
  return true;
});

ipcMain.handle('app:openSettings', () => {
  if (!mainWindow) return false;
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('app:navigateTo', 'settings');
  return true;
});

function tryRegisterShortcut(accelerator) {
  if (currentShortcut) {
    try { globalShortcut.unregister(currentShortcut); } catch {}
  }
  let ok = false;
  try {
    ok = globalShortcut.register(accelerator, () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible()) mainWindow.hide();
      else { mainWindow.show(); mainWindow.focus(); }
    });
  } catch (e) {
    console.warn(`globalShortcut.register threw for "${accelerator}":`, e);
    ok = false;
  }
  if (ok) {
    currentShortcut = accelerator;
    return { ok: true };
  }
  if (currentShortcut) {
    try {
      globalShortcut.register(currentShortcut, () => {
        if (!mainWindow) return;
        if (mainWindow.isVisible()) mainWindow.hide();
        else { mainWindow.show(); mainWindow.focus(); }
      });
    } catch {}
  }
  return { ok: false, reason: 'CONFLICT' };
}

function readPollIntervalMin(database) {
  const v = db.getPref(database, 'pollIntervalMin', DEFAULT_POLL_INTERVAL_MIN);
  if (Number.isFinite(v) && v >= 1 && v <= 60) return v;
  return DEFAULT_POLL_INTERVAL_MIN;
}

function readGlobalShortcut(database) {
  const v = db.getPref(database, 'globalShortcut', DEFAULT_SHORTCUT);
  return typeof v === 'string' && v.trim() !== '' ? v : DEFAULT_SHORTCUT;
}

app.whenReady().then(() => {
  const dbInstance = db.init();

  ipcDeps.registerShortcut = tryRegisterShortcut;

  registerIpcHandlers({ db: dbInstance });

  const retentionDays = db.getPref(dbInstance, 'retentionDays', 90);
  const pruned = db.pruneOldSnapshots(dbInstance, retentionDays);
  if (pruned > 0) console.log(`Pruned ${pruned} stale snapshots`);

  createWindow();
  createTray();

  trayState.updateTrayIcon({
    tray,
    database: dbInstance,
    db,
    paths: trayIconPaths(),
  });

  const desiredShortcut = readGlobalShortcut(dbInstance);
  const shortcutResult = tryRegisterShortcut(desiredShortcut);
  if (!shortcutResult.ok && desiredShortcut !== DEFAULT_SHORTCUT) {
    console.warn(`Configured shortcut "${desiredShortcut}" failed; falling back to default.`);
    tryRegisterShortcut(DEFAULT_SHORTCUT);
  }
  if (!currentShortcut) {
    console.warn(`Failed to register any global shortcut — feature disabled until restart.`);
  }

  poller = new Poller({
    refresh: () => refreshProviders.refreshAllAndPersist({
      database: dbInstance,
      db,
      alerts,
      listAdapters,
    }),
    onResults: ({ snaps, newAlerts }) => {
      try { notifyModule.fireAlertNotifications(newAlerts); } catch (e) { console.error('fireAlertNotifications failed:', e); }
      try {
        trayState.updateTrayIcon({
          tray,
          database: dbInstance,
          db,
          paths: trayIconPaths(),
        });
      } catch (e) { console.error('updateTrayIcon failed:', e); }
    },
  });
  ipcDeps.poller = poller;
  const intervalMin = readPollIntervalMin(dbInstance);
  poller.start(intervalMin * 60_000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  app.isQuiting = true;
  if (poller) poller.stop();
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && app.isQuiting) app.quit();
});
