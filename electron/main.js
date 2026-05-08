const path = require('node:path');
const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');

const db = require('./db');
const secrets = require('./secrets');
const providers = require('./providers');
const Scheduler = require('./scheduler');

let mainWindow = null;
let tray = null;
let scheduler = null;

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

  // Hide to tray on close (so the scheduler keeps running).
  mainWindow.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  if (scheduler) scheduler.setMainWindow(mainWindow);
}

function createTray() {
  try {
    const icon = nativeImage.createFromPath(
      path.join(__dirname, '..', 'build', 'icon.ico'),
    );
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  } catch {
    tray = new Tray(nativeImage.createEmpty());
  }

  const ctx = Menu.buildFromTemplate([
    { label: 'Ouvrir', click: () => mainWindow?.show() },
    { label: 'Rafraîchir maintenant', click: () => scheduler.runNow() },
    { type: 'separator' },
    {
      label: 'Quitter',
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]);
  tray.setToolTip('AI Usage Monitor');
  tray.setContextMenu(ctx);
  tray.on('click', () => (mainWindow?.isVisible() ? mainWindow.hide() : mainWindow?.show()));
}

// ---------------------------- IPC ----------------------------

function registerIpc() {
  ipcMain.handle('providers:list', () => providers.list());

  ipcMain.handle('providers:configs', () => {
    const rows = db.getProviderConfigs();
    return rows.map((r) => ({
      provider: r.provider,
      enabled: !!r.enabled,
      base_url: r.base_url,
      key_kind: r.key_kind,
      org_id: r.org_id,
      hasKey: !!r.encrypted_key,
      updated_at: r.updated_at,
    }));
  });

  ipcMain.handle('providers:save', (_e, cfg) => {
    let encrypted_key = undefined;
    if (cfg.apiKey === '') {
      encrypted_key = null; // explicit clear
    } else if (cfg.apiKey) {
      encrypted_key = secrets.encrypt(cfg.apiKey);
    }
    db.upsertProviderConfig({
      provider: cfg.provider,
      enabled: cfg.enabled !== false,
      base_url: cfg.base_url || null,
      encrypted_key,
      key_kind: cfg.key_kind || null,
      org_id: cfg.org_id || null,
      extra_json: cfg.extra || null,
    });
    return { ok: true };
  });

  ipcMain.handle('providers:clear-key', (_e, provider) => {
    db.clearProviderKey(provider);
    return { ok: true };
  });

  ipcMain.handle('providers:test', async (_e, provider) => {
    const mod = providers.get(provider);
    if (!mod) return { ok: false, error: 'Unknown provider' };
    const cfg = db.getProviderConfig(provider);
    if (!cfg) return { ok: false, error: 'No config' };
    const apiKey = cfg.encrypted_key ? secrets.decrypt(cfg.encrypted_key) : null;
    return mod.ping({ apiKey, baseUrl: cfg.base_url });
  });

  ipcMain.handle('usage:refresh', async () => scheduler.runNow());
  ipcMain.handle('usage:daily', (_e, opts) => db.getDailySeries(opts || {}));
  ipcMain.handle('usage:mtd', () => db.getMonthToDateTotals());
  ipcMain.handle('usage:recent', (_e, opts) => db.getRecentSnapshots(opts || {}));

  ipcMain.handle('quotas:list', () => db.getQuotas());
  ipcMain.handle('quotas:save', (_e, q) => {
    db.upsertQuota(q);
    return { ok: true };
  });

  ipcMain.handle('alerts:list', () => db.getAlerts());
  ipcMain.handle('alerts:add', (_e, a) => ({ id: db.addAlert(a) }));
  ipcMain.handle('alerts:delete', (_e, id) => {
    db.deleteAlert(id);
    return { ok: true };
  });

  ipcMain.handle('settings:get', (_e, { key, fallback }) => db.getSetting(key, fallback));
  ipcMain.handle('settings:set', (_e, { key, value }) => {
    db.setSetting(key, value);
    return { ok: true };
  });

  ipcMain.handle('app:status', () => ({
    version: app.getVersion(),
    encryptionAvailable: secrets.isAvailable(),
    lastRunAt: scheduler?.lastRunAt || null,
    notes: scheduler?.lastNotes || {},
  }));

  ipcMain.handle('app:open-external', (_e, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
    return { ok: true };
  });
}

// ---------------------------- App lifecycle ----------------------------

app.whenReady().then(() => {
  db.init();
  registerIpc();
  createWindow();
  createTray();

  scheduler = new Scheduler({ db, mainWindow });
  const intervalMin = db.getSetting('refresh_interval_minutes', 30);
  scheduler.start((intervalMin || 30) * 60 * 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  app.isQuiting = true;
  scheduler?.stop();
});

app.on('window-all-closed', () => {
  // Keep running in tray; quit only on explicit Quit.
  if (process.platform !== 'darwin' && app.isQuiting) app.quit();
});
