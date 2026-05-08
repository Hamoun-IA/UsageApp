const { BrowserWindow, screen } = require('electron');
const path = require('path');

let widgetWin = null;
let lastTray = null;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 900;

function getWidgetUrl() {
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:5173/widget.html';
  }
  return `file://${path.join(__dirname, '..', 'dist', 'widget.html')}`;
}

function createWidgetWindow() {
  if (widgetWin && !widgetWin.isDestroyed()) return widgetWin;
  widgetWin = new BrowserWindow({
    width: 340,
    height: 200,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  widgetWin.loadURL(getWidgetUrl());
  widgetWin.on('blur', () => { if (widgetWin && !widgetWin.isDestroyed()) widgetWin.hide(); });
  return widgetWin;
}

function positionNearTray(tray) {
  if (!widgetWin || widgetWin.isDestroyed()) return;
  const trayBounds = tray.getBounds();
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
  const work = display.workArea;
  const w = widgetWin.getBounds().width;
  const h = widgetWin.getBounds().height;
  // Bottom-right Windows: tray en bas-droite -> popup au-dessus du tray
  const x = Math.min(trayBounds.x + (trayBounds.width / 2) - (w / 2), work.x + work.width - w - 8);
  const y = trayBounds.y - h - 8;
  widgetWin.setPosition(Math.round(x), Math.round(Math.max(work.y + 8, y)));
}

function toggleWidget(tray) {
  lastTray = tray;
  const w = createWidgetWindow();
  if (w.isVisible()) {
    w.hide();
  } else {
    positionNearTray(tray);
    w.show();
    w.focus();
  }
}

function setWidgetHeight(contentHeight) {
  if (!widgetWin || widgetWin.isDestroyed()) return;
  const h = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.ceil(contentHeight)));
  const bounds = widgetWin.getBounds();
  if (bounds.height === h) return;
  widgetWin.setBounds({ width: bounds.width, height: h, x: bounds.x, y: bounds.y });
  if (lastTray) positionNearTray(lastTray);
}

module.exports = { createWidgetWindow, toggleWidget, setWidgetHeight };
