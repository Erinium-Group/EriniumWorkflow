const { contextBridge, ipcRenderer } = require('electron');

// =========================
//  API EXPOSEE AU RENDERER
// =========================

contextBridge.exposeInMainWorld('api', {
  // Charge la template Markdown
  loadMarkdownTemplate: () => ipcRenderer.invoke('load-md-template')
});
