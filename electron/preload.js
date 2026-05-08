const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  providers: {
    list:        () => ipcRenderer.invoke('providers:list'),
    refresh:     (id) => ipcRenderer.invoke('providers:refresh', id),
    refreshAll:  () => ipcRenderer.invoke('providers:refreshAll'),
    connect:     (id) => ipcRenderer.invoke('providers:connect', id),
    disconnect:  (id) => ipcRenderer.invoke('providers:disconnect', id),
  },
  widget: {
    setHeight:   (h) => ipcRenderer.send('widget:setHeight', h),
  },
});
