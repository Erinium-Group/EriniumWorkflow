'use strict';

const fs = require('fs');
const cheerio = require('cheerio');
const { escapeHtml } = require('../html-builder/escape');
const persistence = require('../persistence');

const STATUS_MAP = {
  'todo':    { card: 'cat-card-planned', badge: 'badge-planned', label: 'Planifie' },
  'wip':     { card: 'cat-card-wip',     badge: 'badge-wip',     label: 'En cours' },
  'test':    { card: 'cat-card-test',    badge: 'badge-test',    label: 'En test' },
  'done':    { card: 'cat-card-done',    badge: 'badge-done',    label: 'Termine' },
  'blocked': { card: 'cat-card-todo',    badge: 'badge-todo',    label: 'Bloque' }
};

const AVAILABLE_TAGS = [
  { id: 'faction',     label: 'Faction' },
  { id: 'combat',      label: 'Combat' },
  { id: 'rpg',         label: 'RPG' },
  { id: 'monde',       label: 'Monde' },
  { id: 'economie',    label: 'Economie' },
  { id: 'admin',       label: 'Admin' },
  { id: 'social',      label: 'Social' },
  { id: 'anti-cheat',  label: 'Anti-Cheat' },
  { id: 'performance', label: 'Performance' },
  { id: 'api',         label: 'API / Outils' },
  { id: 'ui',          label: 'Interface' },
  { id: 'evenements',  label: 'Evenements' },
  { id: 'infra',       label: 'Infra' },
  { id: 'autre',       label: 'Autre' }
];

const SPEC_LINK_SVG = '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM6 20V4h5v7h7v9H6z"/><path d="M8 13h8v2H8zm0 4h5v2H8z"/></svg>';

function listAvailableTags() {
  return AVAILABLE_TAGS;
}

function listCategories(roadmapPath) {
  if (!fs.existsSync(roadmapPath)) return [];
  const html = fs.readFileSync(roadmapPath, 'utf8');
  const $ = cheerio.load(html);
  const titles = [];
  $('.cat-card .card-title').each(function() {
    titles.push($(this).text().trim());
  });
  return titles;
}

function buildCardHtml(projectState) {
  const project = projectState.project || {};
  const features = projectState.features || [];
  const tasks = projectState.tasks || [];
  const status = STATUS_MAP[project.status] || STATUS_MAP['wip'];
  const wide = features.length > 1 || tasks.length > 12 ? ' wide' : '';

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === 'done').length;
  const pct = totalTasks > 0 ? Math.round(doneTasks / totalTasks * 100) : 0;

  const taskItems = tasks.map(t => {
    const checked = t.status === 'done' ? ' checked' : '';
    const doneCls = t.status === 'done' ? ' done' : '';
    return `        <div class="task-item">
          <div class="task-check${checked}"></div>
          <span class="task-name${doneCls}">${escapeHtml(t.title)}</span>
        </div>`;
  }).join('\n');

  // Lien spec : si plusieurs features, on lie a la premiere (les autres sont mentionnes en taches)
  const firstSlug = features.length > 0
    ? (features[0].slugFinal || '')
    : '';

  const specLink = firstSlug
    ? `      <a href="specs/${escapeHtml(firstSlug)}.html" class="spec-link">
        ${SPEC_LINK_SVG}
        Voir le cahier des charges complet
      </a>`
    : '';

  return `
    <!-- AUTO Erisclave : ${escapeHtml(project.title)} -->
    <div class="cat-card ${status.card}${wide}" data-erisclave-slug="${escapeHtml(firstSlug)}">
      <div class="card-head">
        <div class="card-title">${escapeHtml(project.title)}</div>
        <div class="badge ${status.badge}">${escapeHtml(status.label)}</div>
        <span class="card-toggle-icon">&#9660;</span>
      </div>
      <div class="card-progress-row">
        <span class="card-progress-label">Progression</span>
        <span class="card-progress-count">${doneTasks} / ${totalTasks} taches</span>
      </div>
      <div class="card-track">
        <div class="card-fill" style="width: ${pct}%;"></div>
      </div>
      <div class="card-body">
      <div class="task-list">
${taskItems}
      </div>
${specLink}
      </div>
    </div>
`;
}

function updateCardTagsScript(scriptText, projectTitle, tags) {
  // Trouve le bloc CARD_TAGS = [ ... ]; et ajoute / met a jour l'entree
  const tagsJson = JSON.stringify(tags);
  const entry = `    { match: '${projectTitle.replace(/'/g, "\\'")}',                tags: ${tagsJson} },\n`;

  // Si une entree avec le meme match existe, on la remplace
  const escapedTitle = projectTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existingRe = new RegExp("\\s*\\{\\s*match:\\s*['\"]" + escapedTitle + "['\"][^}]+\\},?\\s*\\n", 'm');

  if (existingRe.test(scriptText)) {
    return scriptText.replace(existingRe, '\n' + entry);
  }

  // Sinon, insere avant le `];` qui ferme CARD_TAGS
  const closeRe = /(var CARD_TAGS = \[[\s\S]*?)(\s*\];)/m;
  return scriptText.replace(closeRe, function(_, before, close) {
    return before + entry + close;
  });
}

function syncCard(roadmapPath, projectState, appDir) {
  if (!fs.existsSync(roadmapPath)) throw new Error('roadmap.html introuvable : ' + roadmapPath);
  const backupPath = persistence.backupRoadmap(appDir, roadmapPath);

  const html = fs.readFileSync(roadmapPath, 'utf8');
  const $ = cheerio.load(html, { decodeEntities: false });

  const cardHtml = buildCardHtml(projectState);
  const project = projectState.project || {};
  const projectTitle = project.title || 'Sans titre';

  // Cherche une card existante avec le meme titre OU un slug Erisclave deja pose
  const features = projectState.features || [];
  const firstSlug = features.length > 0 ? (features[0].slugFinal || '') : '';
  let existingCard = null;
  if (firstSlug) {
    existingCard = $('[data-erisclave-slug="' + firstSlug + '"]').first();
  }
  if ((!existingCard || existingCard.length === 0) && projectTitle) {
    $('.cat-card .card-title').each(function() {
      const t = $(this).text().trim();
      if (t === projectTitle) existingCard = $(this).closest('.cat-card');
    });
  }

  if (existingCard && existingCard.length > 0) {
    existingCard.replaceWith(cardHtml);
  } else {
    const grid = $('.cards-grid').first();
    if (grid.length === 0) throw new Error('.cards-grid introuvable dans roadmap.html');
    grid.append(cardHtml);
  }

  // Met a jour le script CARD_TAGS
  $('script').each(function() {
    const txt = $(this).html();
    if (txt && txt.indexOf('var CARD_TAGS') !== -1) {
      const updated = updateCardTagsScript(txt, projectTitle, project.tags || []);
      $(this).html(updated);
    }
  });

  fs.writeFileSync(roadmapPath, $.html(), 'utf8');
  return { backupPath };
}

function removeCardTagsScript(scriptText, projectTitle) {
  const escapedTitle = projectTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existingRe = new RegExp("\\s*\\{\\s*match:\\s*['\"]" + escapedTitle + "['\"][^}]+\\},?\\s*\\n", 'm');
  return scriptText.replace(existingRe, '\n');
}

function listSpecCards(roadmapPath) {
  if (!fs.existsSync(roadmapPath)) return [];
  const $ = cheerio.load(fs.readFileSync(roadmapPath, 'utf8'));
  const out = [];
  $('.cat-card[data-erisclave-slug]').each(function() {
    const slug = $(this).attr('data-erisclave-slug') || '';
    const title = $(this).find('.card-title').first().text().trim();
    if (slug) out.push({ slug, title });
  });
  return out;
}

function removeCard(roadmapPath, slugOrTitle, appDir) {
  if (!fs.existsSync(roadmapPath)) throw new Error('roadmap.html introuvable : ' + roadmapPath);
  const backupPath = persistence.backupRoadmap(appDir, roadmapPath);

  const $ = cheerio.load(fs.readFileSync(roadmapPath, 'utf8'), { decodeEntities: false });

  let removedTitle = null;
  let target = $('[data-erisclave-slug="' + slugOrTitle + '"]').first();
  if (target && target.length > 0) {
    removedTitle = target.find('.card-title').first().text().trim();
  } else {
    $('.cat-card .card-title').each(function() {
      if ($(this).text().trim() === slugOrTitle) {
        target = $(this).closest('.cat-card');
        removedTitle = slugOrTitle;
      }
    });
  }

  if (!target || target.length === 0) {
    return { ok: false, backupPath, error: 'Card introuvable dans roadmap.html' };
  }

  // Retire aussi le commentaire AUTO Erisclave juste avant
  const prev = target[0].prev;
  if (prev && prev.type === 'comment' && /AUTO Erisclave/.test(prev.data || '')) {
    $(prev).remove();
  }
  target.remove();

  if (removedTitle) {
    $('script').each(function() {
      const txt = $(this).html();
      if (txt && txt.indexOf('var CARD_TAGS') !== -1) {
        $(this).html(removeCardTagsScript(txt, removedTitle));
      }
    });
  }

  fs.writeFileSync(roadmapPath, $.html(), 'utf8');
  return { ok: true, backupPath, removedTitle };
}

module.exports = { listAvailableTags, listCategories, listSpecCards, syncCard, removeCard, buildCardHtml };
