/* Ecran 7 : Final (confetti + recap fichiers) */

window.Screens = window.Screens || {};

window.Screens.final = function() {
  const { el } = Utils;
  const state = Store.get();
  const gen = state.generated || {};

  // Lance le confetti
  setTimeout(() => Utils.fireConfetti(), 200);

  const screen = el('div', { class: 'final fade-up' });
  screen.appendChild(el('img', { class: 'grimoire grimoire-md final-grimoire', src: 'assets/grimoire-moyen-140px.gif', alt: '', draggable: 'false' }));
  screen.appendChild(el('h1', null, 'Termine !'));
  screen.appendChild(el('p', null,
    'Les fichiers ont ete crees, la roadmap est a jour. Vous pouvez maintenant commit & push manuellement quand vous etes pret.'
  ));

  // Liste des fichiers
  const files = el('div', { class: 'final-files' });
  (gen.files || []).forEach(f => {
    const row = el('div', { class: 'final-file',
      onclick: () => window.erisclave.shell.openPath(f.path)
    });
    const ico = el('div', { class: 'ico' });
    ico.innerHTML = '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM13 9V3.5L18.5 9H13z"/></svg>';
    row.appendChild(ico);
    row.appendChild(el('span', { class: 'path' }, f.relativePath || f.path));
    row.appendChild(el('span', { class: 'open' }, 'Ouvrir →'));
    files.appendChild(row);
  });

  // Roadmap
  if (gen.roadmapUpdated) {
    const row = el('div', { class: 'final-file',
      onclick: () => window.erisclave.shell.openPath(gen.roadmapPath)
    });
    const ico = el('div', { class: 'ico' });
    ico.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>';
    row.appendChild(ico);
    row.appendChild(el('span', { class: 'path' }, 'docs/roadmap.html (mis a jour)'));
    row.appendChild(el('span', { class: 'open' }, 'Ouvrir →'));
    files.appendChild(row);
  }

  screen.appendChild(files);

  // Actions
  const actions = el('div', { class: 'final-actions' });
  actions.appendChild(el('button', { class: 'btn btn-secondary', type: 'button',
    onclick: () => { Store.reset(); navigate('home'); }
  }, 'Retour a l\'accueil'));
  actions.appendChild(el('button', { class: 'btn btn-primary', type: 'button',
    onclick: () => {
      Store.reset();
      const draftId = 'draft-' + Date.now();
      Store.set({ draftId });
      Autosave.start();
      navigate('project');
    }
  }, 'Nouveau projet'));
  screen.appendChild(actions);

  return screen;
};
