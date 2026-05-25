/* Ecran 5 : Apercu du cahier des charges genere */

window.Screens = window.Screens || {};

window.Screens.preview = function() {
  const { el } = Utils;
  const state = Store.get();

  const screen = el('div', { class: 'screen fade-up' });
  const inner = el('div', { class: 'screen-inner' });

  const header = el('div', { class: 'screen-header' },
    el('div', { class: 'left' },
      el('div', { class: 'eyebrow' }, 'Etape 4 sur 6'),
      el('h1', null, 'Apercu du cahier des charges'),
      el('p', null, 'Verifiez le rendu HTML de chaque feature. Vous pouvez encore revenir en arriere si quelque chose ne va pas.')
    )
  );
  inner.appendChild(header);

  const layout = el('div', { class: 'preview-wrap' });

  // Sidebar : selection feature + stats
  const sidebar = el('aside', { class: 'preview-sidebar' });
  sidebar.appendChild(el('div', { class: 'eyebrow', style: { marginBottom: '12px' } }, 'Feature affichee'));

  const sel = el('select', { class: 'select' });
  state.features.forEach((f, i) => {
    sel.appendChild(el('option', { value: String(i) }, (i + 1) + '. ' + (f.titleProvisoire || 'Sans titre')));
  });
  sel.addEventListener('change', () => {
    loadPreview(Number(sel.value), iframe);
  });
  sidebar.appendChild(sel);

  // Stats
  const stats = el('div', { class: 'preview-stats', style: { marginTop: '20px' } });
  const totalFeatures = state.features.length;
  const totalTasks = state.tasks.length;
  const doneTasks = state.tasks.filter(t => t.status === 'done').length;
  stats.appendChild(stat('Features', totalFeatures));
  stats.appendChild(stat('Taches', totalTasks));
  stats.appendChild(stat('Termine', doneTasks + ' / ' + totalTasks));
  stats.appendChild(stat('Tags', state.project.tags.length));
  sidebar.appendChild(stats);

  layout.appendChild(sidebar);

  // Iframe
  const frameWrap = el('div', { class: 'preview-frame-wrap' });
  const iframe = el('iframe', { class: 'preview-frame', sandbox: 'allow-same-origin' });
  frameWrap.appendChild(iframe);
  layout.appendChild(frameWrap);

  inner.appendChild(layout);

  // Footer
  const footer = el('div', { class: 'screen-footer' },
    el('div', { class: 'left' },
      el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => navigate('tasks') }, '← Retour aux taches')
    ),
    el('div', { class: 'right' },
      el('button', { class: 'btn btn-primary', type: 'button',
        onclick: () => navigate('generate')
      }, 'Generer →')
    )
  );
  inner.appendChild(footer);

  screen.appendChild(inner);

  // Initial preview
  setTimeout(() => loadPreview(0, iframe), 50);

  return screen;
};

function stat(label, value) {
  const { el } = Utils;
  return el('div', { class: 'preview-stat' },
    el('span', null, label),
    el('span', { class: 'v' }, String(value))
  );
}

async function loadPreview(featureIdx, iframe) {
  try {
    const state = Store.get();
    const data = Store.toJSON();
    const res = await window.erisclave.spec.preview({
      project: data.project,
      feature: data.features[featureIdx],
      allFeatures: data.features
    });
    if (res && res.html) {
      iframe.srcdoc = res.html;
    } else {
      iframe.srcdoc = '<p style="padding:40px;color:#a371a6">Echec du rendu</p>';
    }
  } catch (e) {
    iframe.srcdoc = '<p style="padding:40px;color:#d97070">' + (e.message || 'Erreur') + '</p>';
  }
}
