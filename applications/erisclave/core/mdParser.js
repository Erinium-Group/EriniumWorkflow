const fs = require('fs');
const path = require('path');

function loadMarkdownTemplate() {
  const mdPath = path.join(__dirname, '../templates/SPEC_TEMPLATE.md');
  return fs.readFileSync(mdPath, 'utf8');
}

function parseTemplate(md) {
  const lines = md.split('\n');

  const fields = [];
  let currentSection = null;

  lines.forEach(line => {
    // Détection d’un titre de section
    if (line.startsWith('## ')) {
      currentSection = line.replace('## ', '').trim();
      return;
    }

    // Détection d’une question (bloc > *)
    if (line.trim().startsWith('> *')) {
      fields.push({
        type: 'textarea',
        section: currentSection,
        question: line.replace('> *', '').replace('*', '').trim(),
        id: slugify(currentSection)
      });
      return;
    }

    // Détection d’une checkbox
    if (line.trim().startsWith('- [ ]')) {
      fields.push({
        type: 'checkbox',
        section: currentSection,
        label: line.replace('- [ ]', '').trim(),
        id: slugify(line)
      });
      return;
    }

    // Détection d’un tableau
    if (line.trim().startsWith('|') && line.includes('|')) {
      fields.push({
        type: 'table',
        section: currentSection,
        raw: line
      });
      return;
    }
  });

  return fields;
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

module.exports = { loadMarkdownTemplate, parseTemplate };
