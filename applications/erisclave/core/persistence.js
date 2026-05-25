'use strict';

const fs = require('fs');
const path = require('path');

function recapDir(appDir)     { return path.join(appDir, 'recap'); }
function draftsDir(appDir)    { return path.join(recapDir(appDir), 'drafts'); }
function backupsDir(appDir)   { return path.join(recapDir(appDir), 'backups'); }
function settingsPath(appDir) { return path.join(recapDir(appDir), 'settings.json'); }

function initDirs(appDir) {
  fs.mkdirSync(draftsDir(appDir),  { recursive: true });
  fs.mkdirSync(backupsDir(appDir), { recursive: true });
}

function loadSettings(appDir) {
  const p = settingsPath(appDir);
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
}

function saveSettings(appDir, patch) {
  const current = loadSettings(appDir);
  const next = Object.assign({}, current, patch);
  fs.writeFileSync(settingsPath(appDir), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function listDrafts(appDir) {
  const dir = draftsDir(appDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        return {
          id: raw.id,
          title: raw.project ? raw.project.title : '(sans titre)',
          author: raw.project ? raw.project.author : '',
          featuresCount: raw.features ? raw.features.length : 0,
          updatedAt: raw.updatedAt || 0
        };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function loadDraft(appDir, id) {
  const p = path.join(draftsDir(appDir), id + '.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function saveDraft(appDir, draft) {
  if (!draft || !draft.id) throw new Error('draft.id requis');
  const stamped = Object.assign({}, draft, { updatedAt: Date.now() });
  const p = path.join(draftsDir(appDir), draft.id + '.json');
  fs.writeFileSync(p, JSON.stringify(stamped, null, 2), 'utf8');
  return { id: draft.id, updatedAt: stamped.updatedAt };
}

function deleteDraft(appDir, id) {
  const p = path.join(draftsDir(appDir), id + '.json');
  if (fs.existsSync(p)) fs.unlinkSync(p);
  return { ok: true };
}

function backupRoadmap(appDir, roadmapPath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(backupsDir(appDir), 'roadmap-' + stamp + '.html');
  fs.copyFileSync(roadmapPath, dest);
  // rotation : garde les 10 derniers
  const all = fs.readdirSync(backupsDir(appDir))
    .filter(f => f.startsWith('roadmap-'))
    .sort();
  while (all.length > 10) {
    const old = all.shift();
    try { fs.unlinkSync(path.join(backupsDir(appDir), old)); } catch {}
  }
  return dest;
}

module.exports = {
  initDirs, loadSettings, saveSettings,
  listDrafts, loadDraft, saveDraft, deleteDraft,
  backupRoadmap
};
