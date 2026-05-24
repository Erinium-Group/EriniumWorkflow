const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// =========================
//  CRÉATION DE LA FENÊTRE
// =========================
function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    backgroundColor: '#f8f4f1',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('renderer/index.html');
}

// =========================
//  ÉVÈNEMENTS ELECTRON
// =========================
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// =========================
//  API : CHARGEMENT TEMPLATE MD
// =========================
ipcMain.handle('load-md-template', async () => {
  try {
    const mdPath = path.join(__dirname, 'templates', 'SPEC_TEMPLATE.md');
    const content = fs.readFileSync(mdPath, 'utf8');
    return content;
  } catch (err) {
    console.error('Erreur lors du chargement du Markdown :', err);
    return '';
  }
});
