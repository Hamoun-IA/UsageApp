const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  providers: {
    list:        () => ipcRenderer.invoke('providers:list'),
    refresh:     (id) => ipcRenderer.invoke('providers:refresh', id),
    refreshAll:  () => ipcRenderer.invoke('providers:refreshAll'),
    connect:     (id) => ipcRenderer.invoke('providers:connect', id),
    disconnect:  (id) => ipcRenderer.invoke('providers:disconnect', id),
  },
  db: {
    recentSnapshots: (provider, sinceMs) => ipcRenderer.invoke('db:recentSnapshots', provider, sinceMs),
    getPref:         (key, fallback) => ipcRenderer.invoke('db:getPref', key, fallback),
    setPref:         (key, value) => ipcRenderer.invoke('db:setPref', key, value),
  },
  widget: {
    setHeight:   (h) => ipcRenderer.send('widget:setHeight', h),
    onShow:      (cb) => {
      const handler = () => cb();
      ipcRenderer.on('widget:onShow', handler);
      return () => ipcRenderer.removeListener('widget:onShow', handler);
    },
  },
  app: {
    setAutostart:      (enabled) => ipcRenderer.invoke('app:setAutostart', enabled),
    getAutostart:      ()        => ipcRenderer.invoke('app:getAutostart'),
    setPollInterval:   (min)     => ipcRenderer.invoke('app:setPollInterval', min),
    setGlobalShortcut: (acc)     => ipcRenderer.invoke('app:setGlobalShortcut', acc),
    openDetail:        ()        => ipcRenderer.invoke('app:openDetail'),
    openSettings:      ()        => ipcRenderer.invoke('app:openSettings'),
    onNavigateTo:      (cb) => {
      const handler = (_e, page) => cb(page);
      ipcRenderer.on('app:navigateTo', handler);
      return () => ipcRenderer.removeListener('app:navigateTo', handler);
    },
  },
});
