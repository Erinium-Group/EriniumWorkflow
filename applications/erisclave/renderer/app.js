// =========================
//  RÉFÉRENCES DOM
// =========================
const preview = document.getElementById('preview');
const dynamicFieldsContainer = document.getElementById('dynamicFields');

// =========================
//  CHARGEMENT TEMPLATE MD
// =========================
async function loadTemplate() {
  const md = await window.api.loadMarkdownTemplate();
  const fields = parseMarkdown(md);
  generateUI(fields);
}

loadTemplate();

// =========================
//  PARSEUR MARKDOWN SIMPLE
// =========================
function parseMarkdown(md) {
  const lines = md.split('\n');
  const fields = [];
  let currentSection = null;

  lines.forEach(line => {
    // Section
    if (line.startsWith('## ')) {
      currentSection = line.replace('## ', '').trim();
      return;
    }

    // Question ouverte (bloc > *)
    if (line.trim().startsWith('> *')) {
      fields.push({
        type: 'textarea',
        section: currentSection,
        question: line.replace('> *', '').replace('*', '').trim(),
        id: slugify(currentSection + '_' + fields.length)
      });
      return;
    }

    // Checkbox
    if (line.trim().startsWith('- [ ]')) {
      fields.push({
        type: 'checkbox',
        section: currentSection,
        label: line.replace('- [ ]', '').trim(),
        id: slugify(line + '_' + fields.length)
      });
      return;
    }

    // Tableau
    if (line.trim().startsWith('|') && line.includes('|')) {
      fields.push({
        type: 'table',
        section: currentSection,
        raw: line,
        id: slugify(currentSection + '_table_' + fields.length)
      });
      return;
    }
  });

  return fields;
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

// =========================
//  GÉNÉRATION DE L’UI
// =========================
function generateUI(fields) {
  dynamicFieldsContainer.innerHTML = '';

  fields.forEach(field => {
    if (field.type === 'textarea') createTextareaField(field);
    if (field.type === 'checkbox') createCheckboxField(field);
    if (field.type === 'table') createTableField(field);
  });

  // Ajoute un bouton pour générer le HTML final
  const generateBtn = document.createElement('button');
  generateBtn.className = 'btn-primary';
  generateBtn.textContent = 'Générer le HTML';
  generateBtn.onclick = generateHTML;
  dynamicFieldsContainer.appendChild(generateBtn);
}

// =========================
//  UI : TEXTAREA
// =========================
function createTextareaField(field) {
  const block = document.createElement('div');
  block.className = 'block';

  block.innerHTML = `
    <h3>${field.section}</h3>
    <p>${field.question}</p>
    <textarea class="text-input" id="${field.id}" rows="4"></textarea>
  `;

  dynamicFieldsContainer.appendChild(block);
}

// =========================
//  UI : CHECKBOX
// =========================
function createCheckboxField(field) {
  const block = document.createElement('div');
  block.className = 'block';

  block.innerHTML = `
    <label>
      <input type="checkbox" id="${field.id}">
      ${field.label}
    </label>
  `;

  dynamicFieldsContainer.appendChild(block);
}

// =========================
//  UI : TABLEAU (simple)
// =========================
function createTableField(field) {
  const block = document.createElement('div');
  block.className = 'block';

  block.innerHTML = `
    <h3>${field.section}</h3>
    <p>Remplis le tableau (une ligne par entrée, séparée par | ) :</p>
    <textarea class="text-input" id="${field.id}" rows="4"></textarea>
  `;

  dynamicFieldsContainer.appendChild(block);
}

// =========================
//  GÉNÉRATION DU HTML FINAL
// =========================
function generateHTML() {
  const inputs = document.querySelectorAll('.text-input, input[type="checkbox"]');

  const data = {};

  inputs.forEach(input => {
    if (input.type === 'checkbox') {
      data[input.id] = input.checked;
    } else {
      data[input.id] = input.value.trim();
    }
  });

  const html = buildHTML(data);

  const doc = preview.contentDocument || preview.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
}

// =========================
//  CONSTRUCTION DU HTML
// =========================
function buildHTML(data) {
  let html = `
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Cahier des charges</title>
      </head>
      <body>
        <h1>Cahier des charges généré</h1>
  `;

  for (const key in data) {
    html += `
      <h3>${key.replace(/_/g, ' ')}</h3>
      <p>${escapeHtml(data[key])}</p>
    `;
  }

  html += `
      </body>
    </html>
  `;

  return html;
}

// =========================
//  SÉCURISATION HTML
// =========================
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
