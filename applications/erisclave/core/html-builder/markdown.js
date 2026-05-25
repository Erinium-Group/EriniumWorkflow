'use strict';

const { escapeHtml } = require('./escape');

// Markdown léger : **gras**, *italique*, `code`, [texte](url), retours ligne -> <br>
function renderInlineMd(raw) {
  if (raw === null || raw === undefined) return '';
  let s = escapeHtml(String(raw));
  // code inline (avant le reste pour ne pas matcher * dans `code`)
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  // gras
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // italique
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  // liens
  s = s.replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, function(_, txt, url) {
    if (!/^(https?:|\.\/|\.\.\/|\/)/.test(url)) return '[' + txt + '](' + url + ')';
    return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' + txt + '</a>';
  });
  // line breaks
  s = s.replace(/\n/g, '<br>');
  return s;
}

// Markdown bloc : paragraphes séparés par double newline, listes a puces
function renderBlockMd(raw) {
  if (raw === null || raw === undefined || raw === '') return '';
  const blocks = String(raw).split(/\n\s*\n/);
  return blocks.map(block => {
    const lines = block.split('\n');
    const isBulletList = lines.every(l => /^\s*[-*]\s+/.test(l));
    if (isBulletList) {
      const items = lines.map(l => '<li>' + renderInlineMd(l.replace(/^\s*[-*]\s+/, '')) + '</li>').join('');
      return '<ul>' + items + '</ul>';
    }
    return '<p>' + renderInlineMd(block) + '</p>';
  }).join('\n');
}

module.exports = { renderInlineMd, renderBlockMd };
