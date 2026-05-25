'use strict';

const { escapeHtml, escapeAttr } = require('./escape');
const { renderInlineMd, renderBlockMd } = require('./markdown');

function isEmpty(v) {
  if (v === null || v === undefined || v === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (typeof v === 'object' && !Array.isArray(v)) return Object.keys(v).length === 0;
  return false;
}

function fieldHasContent(field, value) {
  if (isEmpty(value)) return false;
  if (field.type === 'table') {
    if (!Array.isArray(value)) return false;
    return value.some(row => Object.values(row || {}).some(v => !isEmpty(v)));
  }
  if (field.type === 'list') {
    if (!Array.isArray(value)) return false;
    return value.some(v => !isEmpty(v));
  }
  if (field.type === 'checklist') {
    if (Array.isArray(value)) return value.length > 0;
    return !isEmpty(value);
  }
  return true;
}

function renderText(field, value) {
  return '<p>' + renderInlineMd(value) + '</p>';
}

function renderLongtext(field, value) {
  return renderBlockMd(value);
}

function renderTable(field, value) {
  const rows = (value || []).filter(row => Object.values(row || {}).some(v => !isEmpty(v)));
  if (rows.length === 0) return '';
  const cols = field.columns || [];
  const head = '<thead><tr>' + cols.map(c => '<th>' + escapeHtml(c.label) + '</th>').join('') + '</tr></thead>';
  const body = '<tbody>' + rows.map(row =>
    '<tr>' + cols.map(c => '<td>' + renderInlineMd(row[c.id] || '') + '</td>').join('') + '</tr>'
  ).join('') + '</tbody>';
  return '<div class="table-wrap"><table>' + head + body + '</table></div>';
}

function renderList(field, value) {
  const items = (value || []).filter(v => !isEmpty(v));
  if (items.length === 0) return '';
  return '<ul>' + items.map(it => '<li>' + renderInlineMd(it) + '</li>').join('') + '</ul>';
}

function renderChecklist(field, value) {
  let items = [];
  if (Array.isArray(value)) items = value;
  else if (typeof value === 'string') items = [value];
  items = items.filter(v => !isEmpty(v));
  if (items.length === 0) return '';
  return '<ul class="checklist">' + items.map(it => '<li>' + renderInlineMd(it) + '</li>').join('') + '</ul>';
}

function renderImage(field, value, ctx) {
  if (!Array.isArray(value) || value.length === 0) return '';
  const slug = ctx.feature && ctx.feature.slugFinal ? ctx.feature.slugFinal : 'feature';
  const imgs = value.map(asset => {
    const src = 'assets/' + slug + '/' + escapeAttr(asset.filename);
    return '<figure class="ref-img"><img src="' + src + '" alt="' + escapeAttr(asset.filename) + '" loading="lazy"></figure>';
  }).join('');
  return '<div class="ref-images">' + imgs + '</div>';
}

function renderField(field, value, ctx) {
  if (!fieldHasContent(field, value)) return '';
  let body = '';
  switch (field.type) {
    case 'text':      body = renderText(field, value); break;
    case 'longtext':  body = renderLongtext(field, value); break;
    case 'table':     body = renderTable(field, value); break;
    case 'list':      body = renderList(field, value); break;
    case 'checklist': body = renderChecklist(field, value); break;
    case 'image':     body = renderImage(field, value, ctx); break;
    default:          body = '<p>' + renderInlineMd(String(value)) + '</p>';
  }
  if (!body) return '';
  const heading = field.label ? '<h3>' + escapeHtml(field.label) + '</h3>' : '';
  return heading + body;
}

module.exports = { renderField, fieldHasContent };
