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
  },
  app: {
    setAutostart: (enabled) => ipcRenderer.invoke('app:setAutostart', enabled),
    getAutostart: ()        => ipcRenderer.invoke('app:getAutostart'),
  },
});
