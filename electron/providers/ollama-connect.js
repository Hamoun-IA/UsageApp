const { BrowserWindow } = require('electron');

const SIGNIN_URL = 'https://ollama.com/signin';
const SUCCESS_URL_PATTERN = /^https:\/\/ollama\.com\/(settings|$)/;

async function captureOllamaCookie() {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 1024,
      height: 768,
      title: 'Connect to Ollama',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        partition: 'persist:ollama-connect',
      },
    });

    let resolved = false;
    const cleanup = () => { if (!win.isDestroyed()) win.close(); };
    const finishOk = (cookie) => { if (resolved) return; resolved = true; cleanup(); resolve(cookie); };
    const finishErr = (err) => { if (resolved) return; resolved = true; cleanup(); reject(err); };

    win.on('closed', () => { if (!resolved) finishErr(new Error('User closed the window')); });

    const tryCapture = async () => {
      try {
        const url = win.webContents.getURL();
        if (!SUCCESS_URL_PATTERN.test(url)) return;
        const cookies = await win.webContents.session.cookies.get({ url: 'https://ollama.com' });
        if (cookies && cookies.length > 0) {
          const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
          finishOk(cookieStr);
        }
      } catch (e) { /* retry */ }
    };

    win.webContents.on('did-finish-load', tryCapture);
    win.webContents.on('did-navigate', tryCapture);

    const interval = setInterval(tryCapture, 1500);
    const timeout = setTimeout(() => finishErr(new Error('Connect Ollama: timeout (5 min)')), 5 * 60 * 1000);

    win.on('closed', () => { clearInterval(interval); clearTimeout(timeout); });

    win.loadURL(SIGNIN_URL);
  });
}

module.exports = { captureOllamaCookie };
