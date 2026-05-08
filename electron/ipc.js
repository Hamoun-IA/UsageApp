const { ipcMain } = require('electron');
const { listAdapters, getAdapter } = require('./providers');

function registerIpcHandlers(deps) {
  const { db } = deps;

  ipcMain.handle('providers:list', () => {
    return listAdapters().map(a => ({ id: a.id, label: a.label, authMode: a.authMode }));
  });

  ipcMain.handle('providers:refresh', async (_e, providerId) => {
    const a = getAdapter(providerId);
    return a.refresh();
  });

  ipcMain.handle('providers:refreshAll', async () => {
    return Promise.all(listAdapters().map(a => a.refresh()));
  });

  ipcMain.handle('providers:connect', async (_e, providerId) => {
    const a = getAdapter(providerId);
    return a.connect();
  });

  ipcMain.handle('providers:disconnect', async (_e, providerId) => {
    const a = getAdapter(providerId);
    return a.disconnect();
  });
}

module.exports = { registerIpcHandlers };
