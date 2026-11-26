const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  save: (content, saveAs) => ipcRenderer.invoke('project:save', content, saveAs),
  open: () => ipcRenderer.invoke('project:open'),
  accept: (path) => ipcRenderer.invoke('project:accept', path),
  reset: () => ipcRenderer.invoke('project:reset'),
  dirty: (value) => ipcRenderer.invoke('project:dirty', value),
  autosave: (content) => ipcRenderer.invoke('project:autosave', content),
  recovery: () => ipcRenderer.invoke('project:recovery'),
  clearRecovery: () => ipcRenderer.invoke('project:clearRecovery'),
  export: (content, format) => ipcRenderer.invoke('file:export', content, format),
  importMesh: () => ipcRenderer.invoke('file:import'),
  importTexture: () => ipcRenderer.invoke('texture:import'),
  readLibrary: () => ipcRenderer.invoke('library:read'),
  writeLibrary: (content) => ipcRenderer.invoke('library:write', content),
  exportPDF: (svg, paper) => ipcRenderer.invoke('sheet:pdf', svg, paper),
});
