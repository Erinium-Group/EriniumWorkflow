'use strict';

const slugify = require('slugify');

function toSlug(raw) {
  if (!raw) return '';
  return slugify(String(raw), {
    lower: true,
    strict: true,
    locale: 'fr',
    trim: true
  });
}

function uniqueId() {
  return 'draft-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

module.exports = { toSlug, uniqueId };
