const { BrowserWindow } = require('electron');

const LOGIN_URL = 'https://chatgpt.com/';
const SUCCESS_URL_PATTERN = /^https?:\/\/chatgpt\.com\/(?!login|share|auth|api|backend-api)/;
const SESSION_COOKIE = '__Secure-next-auth.session-token';

async function captureCodexCookie() {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 1024,
      height: 768,
      title: 'Connect to Codex',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        partition: 'persist:codex-connect',
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
        const cookies = await win.webContents.session.cookies.get({ url: 'https://chatgpt.com' });
        if (cookies && cookies.some((c) => c.name === SESSION_COOKIE)) {
          const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
          finishOk(cookieStr);
        }
      } catch (e) { /* retry */ }
    };

    win.webContents.on('did-finish-load', tryCapture);
    win.webContents.on('did-navigate', tryCapture);

    const interval = setInterval(tryCapture, 1500);
    const timeout = setTimeout(() => finishErr(new Error('Connect Codex: timeout (5 min)')), 5 * 60 * 1000);

    win.on('closed', () => { clearInterval(interval); clearTimeout(timeout); });

    win.loadURL(LOGIN_URL);
  });
}

module.exports = { captureCodexCookie };
