const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('api', {
  // ---- Providers ----
  listProviders: () => invoke('providers:list'),
  getProviderConfigs: () => invoke('providers:configs'),
  saveProviderConfig: (cfg) => invoke('providers:save', cfg),
  testProvider: (provider) => invoke('providers:test', provider),
  clearProviderKey: (provider) => invoke('providers:clear-key', provider),

  // ---- Usage / data ----
  refreshNow: () => invoke('usage:refresh'),
  getDailySeries: (opts) => invoke('usage:daily', opts),
  getMonthToDate: () => invoke('usage:mtd'),
  getRecent: (opts) => invoke('usage:recent', opts),

  // ---- Quotas ----
  getQuotas: () => invoke('quotas:list'),
  saveQuota: (q) => invoke('quotas:save', q),

  // ---- Alerts ----
  getAlerts: () => invoke('alerts:list'),
  addAlert: (a) => invoke('alerts:add', a),
  deleteAlert: (id) => invoke('alerts:delete', id),

  // ---- Settings ----
  getSetting: (key, fallback) => invoke('settings:get', { key, fallback }),
  setSetting: (key, value) => invoke('settings:set', { key, value }),

  // ---- Misc ----
  getStatus: () => invoke('app:status'),
  openExternal: (url) => invoke('app:open-external', url),

  onUsageUpdated: (handler) => {
    const listener = (_evt, payload) => handler(payload);
    ipcRenderer.on('usage:updated', listener);
    return () => ipcRenderer.removeListener('usage:updated', listener);
  },
});
