'use strict';

const { escapeHtml, escapeAttr } = require('./escape');
const { renderField, fieldHasContent } = require('./fieldRenderers');
const styles = require('./styles');

const FOOTER_SCRIPT = `<script>
document.addEventListener('scroll', function() {
  var sections = document.querySelectorAll('.section-card');
  var links = document.querySelectorAll('.nav-link');
  var current = '';
  sections.forEach(function(s) {
    if (window.scrollY >= s.offsetTop - 120) current = s.id;
  });
  links.forEach(function(l) {
    l.classList.remove('active');
    if (l.getAttribute('href') === '#' + current) l.classList.add('active');
  });
});
</script>`;

const STATUS_BADGES = {
  'todo':    { label: 'Planifie',  cls: 'badge-slate' },
  'wip':     { label: 'En cours',  cls: 'badge-cyan' },
  'test':    { label: 'En test',   cls: 'badge-gold' },
  'done':    { label: 'Termine',   cls: 'badge-green' },
  'blocked': { label: 'Bloque',    cls: 'badge-red' }
};

function statusBadge(status) {
  const meta = STATUS_BADGES[status] || STATUS_BADGES['todo'];
  return '<span class="badge ' + meta.cls + '">' + meta.label + '</span>';
}

function buildHead(feature) {
  const title = escapeHtml(feature.title || 'Cahier des charges');
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cahier des charges — ${title} | EriniumFaction</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
${styles}
</style>
</head>`;
}

function buildSidebar(sections, project) {
  const links = sections.map(s =>
    `    <a class="nav-link" href="#${s.id}"><span class="num">${escapeHtml(s.num)}</span> ${escapeHtml(s.title)}</a>`
  ).join('\n');
  return `<nav class="sidebar" id="sidebar">
    <div class="sidebar-logo">Erinium<span>Faction</span></div>
    <a class="sidebar-back" href="../roadmap.html">&#8592; Roadmap</a>
    <span class="sidebar-title">Sommaire</span>
${links}
  </nav>`;
}

function buildHeader(project, feature) {
  const eyebrow  = escapeHtml(project.category || 'Cahier des charges') + ' &middot; EriniumFaction';
  const title    = escapeHtml(feature.title || 'Sans titre');
  const summary  = feature.values && feature.values.summary ? feature.values.summary : '';
  const author   = project.author ? '<span class="badge badge-slate">Auteur : ' + escapeHtml(project.author) + '</span>' : '';
  const featType = feature.type ? '<span class="badge badge-violet">' + escapeHtml(feature.type) + '</span>' : '';
  const status   = statusBadge(feature.status || project.status || 'todo');
  const date     = '<span class="badge badge-slate">' + new Date().toLocaleDateString('fr-FR') + '</span>';
  return `    <div class="page-header">
      <div class="eyebrow">${eyebrow}</div>
      <h1>${title}</h1>
      <p>${escapeHtml(summary)}</p>
      <div class="header-badges">${status}${featType}${author}${date}</div>
    </div>`;
}

function buildSection(section, values, ctx) {
  const populatedFields = section.fields.filter(f => fieldHasContent(f, values[f.id]));
  if (populatedFields.length === 0) return '';
  const numClass = section.color ? section.color + '-num' : '';
  const hint = section.hint ? '<div class="hint">' + escapeHtml(section.hint) + '</div>' : '';
  const body = populatedFields.map(f => renderField(f, values[f.id], ctx)).filter(Boolean).join('\n');
  return `    <section class="section-card" id="${section.id}">
      <h2><span class="s-num ${numClass}">${escapeHtml(section.num)}</span> ${escapeHtml(section.title)}</h2>
      ${hint}
      ${body}
    </section>`;
}

function renderSpec(payload) {
  const project = payload.project || {};
  const feature = payload.feature || {};
  const sections = (feature.questionnaire && feature.questionnaire.sections) || [];
  const values   = feature.values || {};
  const ctx = { project, feature };

  const head    = buildHead(feature);
  const sidebar = buildSidebar(sections, project);
  const header  = buildHeader(project, feature);
  const sectionsHtml = sections.map(s => buildSection(s, values, ctx)).filter(Boolean).join('\n\n');

  return `${head}
<body>
<div class="layout">

  ${sidebar}

  <main class="main">

${header}

${sectionsHtml}

  </main>
</div>

<button class="mobile-nav-toggle" onclick="document.getElementById('sidebar').classList.toggle('open')">&#9776;</button>

${FOOTER_SCRIPT}

</body>
</html>`;
}

function buildTwin(project, feature) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    project: {
      title: project.title,
      author: project.author,
      category: project.category,
      status: project.status
    },
    feature: {
      title: feature.title,
      type: feature.type,
      slugFinal: feature.slugFinal,
      status: feature.status,
      values: feature.values,
      assets: (feature.assets || []).map(a => ({ filename: a.filename })),
      questionnaire: feature.questionnaire
    }
  };
}

module.exports = { renderSpec, buildTwin };
