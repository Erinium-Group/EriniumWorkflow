'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const pathResolver = require('./core/path-resolver');
const persistence  = require('./core/persistence');
const slug         = require('./core/slug');
const conflict     = require('./core/conflict-resolver');
const questionEng  = require('./core/question-engine');
const htmlBuilder  = require('./core/html-builder');
const roadmapSync  = require('./core/roadmap-sync');

let mainWindow = null;
let docsRoot = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#f8f4f1',
    title: 'Erisclave',
    icon: path.join(__dirname, 'renderer', 'assets', 'grimoire.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.webContents.on('console-message', (_e, level, message, line, source) => {
    const tag = ['log', 'warn', 'error'][level] || 'info';
    process.stdout.write('[renderer:' + tag + '] ' + message + ' (' + source + ':' + line + ')\n');
  });

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    process.stderr.write('[render-process-gone] ' + JSON.stringify(details) + '\n');
  });

  if (process.argv.includes('--dev') || !!process.env.ERISCLAVE_DEV) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function resolveDocs() {
  try {
    const settings = persistence.loadSettings(__dirname);
    if (settings.docsRootOverride && fs.existsSync(settings.docsRootOverride)) {
      docsRoot = settings.docsRootOverride;
    } else {
      docsRoot = pathResolver.resolveDocsRoot(__dirname);
    }
  } catch (err) {
    docsRoot = null;
  }
}

app.whenReady().then(() => {
  persistence.initDirs(__dirname);
  resolveDocs();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- docs ---

ipcMain.handle('docs:status', () => ({
  ok: !!docsRoot,
  docsRoot: docsRoot
}));

ipcMain.handle('docs:pick', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selectionner le dossier docs/ (contenant roadmap.html + specs/)',
    properties: ['openDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };
  const picked = result.filePaths[0];
  const roadmap = path.join(picked, 'roadmap.html');
  const specs = path.join(picked, 'specs');
  if (!fs.existsSync(roadmap) || !fs.existsSync(specs)) {
    return { ok: false, error: 'Le dossier choisi ne contient pas roadmap.html + specs/' };
  }
  docsRoot = picked;
  persistence.saveSettings(__dirname, { docsRootOverride: picked });
  return { ok: true, docsRoot: picked };
});

// --- roadmap meta ---

ipcMain.handle('roadmap:list-categories', () => {
  if (!docsRoot) return [];
  return roadmapSync.listCategories(path.join(docsRoot, 'roadmap.html'));
});

ipcMain.handle('roadmap:list-tags', () => {
  return roadmapSync.listAvailableTags();
});

// --- questions ---

ipcMain.handle('questions:load', (_evt, featureType) => {
  return questionEng.getQuestionnaire(featureType);
});

ipcMain.handle('questions:list-types', () => {
  return questionEng.listFeatureTypes();
});

// --- drafts ---

ipcMain.handle('draft:list', () => {
  return persistence.listDrafts(__dirname);
});

ipcMain.handle('draft:load', (_evt, draftId) => {
  return persistence.loadDraft(__dirname, draftId);
});

ipcMain.handle('draft:save', (_evt, draftId, data) => {
  const draft = Object.assign({}, data, { id: draftId });
  const r = persistence.saveDraft(__dirname, draft);
  return { ok: true, updatedAt: r.updatedAt };
});

ipcMain.handle('draft:delete', (_evt, draftId) => {
  return persistence.deleteDraft(__dirname, draftId);
});

// --- spec ---

// Mappe une feature du Store renderer (titleProvisoire, featureType, answers)
// vers le shape attendu par html-builder (title, type, values, questionnaire.sections).
function adaptFeatureForBuilder(rawFeature, project) {
  const featureType = rawFeature.featureType || null;
  const questionnaire = featureType ? questionEng.getQuestionnaire(featureType) : { featureType: null, sections: [] };

  const typeMeta = (questionEng.listFeatureTypes() || []).find(t => t.id === featureType);
  const typeLabel = typeMeta ? typeMeta.label : (featureType || '');

  return {
    title: rawFeature.titleProvisoire || rawFeature.title || '(sans titre)',
    type: typeLabel,
    featureTypeId: featureType,
    slugFinal: rawFeature.slugFinal || '',
    status: rawFeature.status || (project && project.status) || 'todo',
    values: rawFeature.answers || rawFeature.values || {},
    assets: rawFeature.assets || [],
    questionnaire
  };
}

ipcMain.handle('spec:preview', (_evt, payload) => {
  try {
    const project = (payload && payload.project) || {};
    const rawFeature = (payload && payload.feature) || {};
    const feature = adaptFeatureForBuilder(rawFeature, project);
    const html = htmlBuilder.renderSpec({ project, feature, allFeatures: (payload && payload.allFeatures) || [] });
    return { ok: true, html };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('spec:check-conflict', (_evt, slugCandidate) => {
  if (!docsRoot) return { conflict: false };
  return conflict.checkSlug(path.join(docsRoot, 'specs'), slugCandidate);
});

ipcMain.handle('spec:slug', (_evt, raw) => {
  return { slug: slug.toSlug(raw) };
});

// --- generate ---

ipcMain.handle('generate:run', async (_evt, projectState) => {
  if (!docsRoot) return { ok: false, error: 'docs/ introuvable' };
  try {
    const files = [];
    const specsDir = path.join(docsRoot, 'specs');
    if (!fs.existsSync(specsDir)) fs.mkdirSync(specsDir, { recursive: true });

    for (const rawFeature of (projectState.features || [])) {
      const finalSlug = rawFeature.slugFinal || slug.toSlug(rawFeature.titleProvisoire || 'feature');
      rawFeature.slugFinal = finalSlug;

      const adapted = adaptFeatureForBuilder(rawFeature, projectState.project);

      const html = htmlBuilder.renderSpec({
        project: projectState.project,
        feature: adapted,
        allFeatures: projectState.features
      });
      const twin = htmlBuilder.buildTwin(projectState.project, adapted);

      // Garde l'historique brut du store dans le twin pour ré-édition
      twin.draft = {
        titleProvisoire: rawFeature.titleProvisoire,
        featureType: rawFeature.featureType,
        slugFinal: finalSlug,
        answers: rawFeature.answers || {},
        assets: rawFeature.assets || []
      };
      const feature = rawFeature;

      const htmlPath = path.join(specsDir, finalSlug + '.html');
      const jsonPath = path.join(specsDir, finalSlug + '.json');

      fs.writeFileSync(htmlPath, html, 'utf8');
      fs.writeFileSync(jsonPath, JSON.stringify(twin, null, 2), 'utf8');

      // Copie d'assets
      if (Array.isArray(feature.assets) && feature.assets.length > 0) {
        const assetDir = path.join(specsDir, 'assets', finalSlug);
        fs.mkdirSync(assetDir, { recursive: true });
        for (const asset of feature.assets) {
          const src = asset.sourcePath || asset.path;
          if (src && fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(assetDir, asset.filename || path.basename(src)));
          }
        }
      }

      files.push({
        path: htmlPath,
        relativePath: path.relative(docsRoot, htmlPath).replace(/\\/g, '/')
      });
      files.push({
        path: jsonPath,
        relativePath: path.relative(docsRoot, jsonPath).replace(/\\/g, '/')
      });
    }

    // Roadmap sync
    const roadmapPath = path.join(docsRoot, 'roadmap.html');
    const syncResult = roadmapSync.syncCard(roadmapPath, projectState, __dirname);

    return {
      ok: true,
      files,
      roadmapUpdated: true,
      roadmapPath,
      backup: syncResult.backupPath
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// --- specs management ---

ipcMain.handle('specs:list', () => {
  if (!docsRoot) return { ok: false, error: 'docs/ introuvable' };
  const specsDir = path.join(docsRoot, 'specs');
  if (!fs.existsSync(specsDir)) return { ok: true, specs: [] };

  const roadmapPath = path.join(docsRoot, 'roadmap.html');
  const cards = roadmapSync.listSpecCards(roadmapPath);
  const cardBySlug = new Map(cards.map(c => [c.slug, c.title]));

  const files = fs.readdirSync(specsDir).filter(f => f.endsWith('.html'));
  const specs = files.map(f => {
    const slug = f.replace(/\.html$/, '');
    const htmlPath = path.join(specsDir, f);
    const jsonPath = path.join(specsDir, slug + '.json');
    const assetDir = path.join(specsDir, 'assets', slug);
    const stat = fs.statSync(htmlPath);

    let title = cardBySlug.get(slug) || slug;
    let projectTitle = null;
    let featureType = null;
    if (fs.existsSync(jsonPath)) {
      try {
        const twin = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (twin.feature && twin.feature.titleProvisoire) title = twin.feature.titleProvisoire;
        if (twin.project && twin.project.title) projectTitle = twin.project.title;
        if (twin.feature && twin.feature.featureType) featureType = twin.feature.featureType;
      } catch {}
    }

    return {
      slug,
      title,
      projectTitle,
      featureType,
      inRoadmap: cardBySlug.has(slug),
      size: stat.size,
      updatedAt: stat.mtimeMs,
      hasJson: fs.existsSync(jsonPath),
      hasAssets: fs.existsSync(assetDir),
      htmlPath
    };
  }).sort((a, b) => b.updatedAt - a.updatedAt);

  return { ok: true, specs };
});

ipcMain.handle('specs:load', (_evt, slug) => {
  if (!docsRoot) return { ok: false, error: 'docs/ introuvable' };
  if (!slug || typeof slug !== 'string' || slug.indexOf('..') !== -1 || slug.indexOf('/') !== -1 || slug.indexOf('\\') !== -1) {
    return { ok: false, error: 'Slug invalide' };
  }
  try {
    const jsonPath = path.join(docsRoot, 'specs', slug + '.json');
    if (!fs.existsSync(jsonPath)) {
      return { ok: false, error: 'Aucun JSON jumeau pour ce spec — il n\'a pas ete genere par l\'app.' };
    }
    const twin = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    return { ok: true, twin };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  const stat = fs.lstatSync(p);
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(p)) rmrf(path.join(p, child));
    fs.rmdirSync(p);
  } else {
    fs.unlinkSync(p);
  }
}

ipcMain.handle('specs:delete', (_evt, slug) => {
  if (!docsRoot) return { ok: false, error: 'docs/ introuvable' };
  if (!slug || typeof slug !== 'string' || slug.indexOf('..') !== -1 || slug.indexOf('/') !== -1 || slug.indexOf('\\') !== -1) {
    return { ok: false, error: 'Slug invalide' };
  }

  try {
    const specsDir = path.join(docsRoot, 'specs');
    const htmlPath = path.join(specsDir, slug + '.html');
    const jsonPath = path.join(specsDir, slug + '.json');
    const assetDir = path.join(specsDir, 'assets', slug);

    const removed = [];
    if (fs.existsSync(htmlPath)) { fs.unlinkSync(htmlPath); removed.push('html'); }
    if (fs.existsSync(jsonPath)) { fs.unlinkSync(jsonPath); removed.push('json'); }
    if (fs.existsSync(assetDir)) { rmrf(assetDir); removed.push('assets'); }

    // Retire la card de la roadmap (backup auto)
    let backupPath = null;
    let roadmapUpdated = false;
    const roadmapPath = path.join(docsRoot, 'roadmap.html');
    if (fs.existsSync(roadmapPath)) {
      const r = roadmapSync.removeCard(roadmapPath, slug, __dirname);
      backupPath = r.backupPath;
      roadmapUpdated = !!r.ok;
    }

    return { ok: true, removed, roadmapUpdated, backupPath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// --- shell ---

ipcMain.handle('app:open-path', (_evt, p) => {
  if (!p) return false;
  try {
    shell.showItemInFolder(p);
    return true;
  } catch (e) { return false; }
});

// --- assets ---

ipcMain.handle('asset:upload', async (_evt, opts) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selectionner une ou plusieurs images',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] }],
    properties: ['openFile', 'multiSelections']
  });
  if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true };
  return {
    ok: true,
    files: result.filePaths.map(p => ({
      absolutePath: p,
      name: path.basename(p)
    }))
  };
});
