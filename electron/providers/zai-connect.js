const { BrowserWindow } = require('electron');

const LOGIN_URL = 'https://z.ai/manage-apikey/subscription';
const TOKEN_KEY = 'z-ai-open-platform-token-production';

/**
 * Ouvre une fenêtre, attend que l'user soit loggué (token apparaît
 * dans localStorage), retourne le JWT.
 */
async function captureZaiToken() {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 1024,
      height: 768,
      title: 'Connect to Z.ai',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        partition: 'persist:zai-connect',
      },
    });

    let resolved = false;
    const cleanup = () => { if (!win.isDestroyed()) win.close(); };
    const finishOk = (token) => { if (resolved) return; resolved = true; cleanup(); resolve(token); };
    const finishErr = (err) => { if (resolved) return; resolved = true; cleanup(); reject(err); };

    win.on('closed', () => { if (!resolved) finishErr(new Error('User closed the window')); });

    const tryRead = async () => {
      try {
        const token = await win.webContents.executeJavaScript(
          `localStorage.getItem(${JSON.stringify(TOKEN_KEY)})`
        );
        if (token && typeof token === 'string' && token.length > 50) {
          finishOk(token);
        }
      } catch (e) { /* page navigation, retry */ }
    };

    win.webContents.on('did-finish-load', tryRead);
    win.webContents.on('did-navigate-in-page', tryRead);
    win.webContents.on('did-navigate', tryRead);

    // Polling de secours toutes les 1.5s (au cas où aucun event ne fire)
    const interval = setInterval(tryRead, 1500);
    const timeout = setTimeout(() => finishErr(new Error('Connect Z.ai: timeout (5 min)')), 5 * 60 * 1000);

    win.on('closed', () => { clearInterval(interval); clearTimeout(timeout); });

    win.loadURL(LOGIN_URL);
  });
}

module.exports = { captureZaiToken };
