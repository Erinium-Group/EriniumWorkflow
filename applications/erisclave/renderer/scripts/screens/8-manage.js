/* Ecran 8 : Gerer les cahiers des charges generes */

window.Screens = window.Screens || {};

window.Screens.manage = function() {
  const { el } = Utils;

  const screen = el('div', { class: 'screen fade-up' });
  const inner = el('div', { class: 'screen-inner' });

  // Header
  inner.appendChild(el('div', { class: 'screen-header' },
    el('div', { class: 'left' },
      el('div', { class: 'eyebrow' }, 'Gestion'),
      el('h1', null, 'Cahiers des charges'),
      el('p', null, 'Liste de tous les specs presents dans docs/specs/. Supprimer une entree retire le fichier HTML, son JSON, ses assets et l\'entree de la roadmap. Un backup auto est cree.')
    ),
    el('div', { class: 'right' },
      el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => navigate('home') }, '← Accueil')
    )
  ));

  // Barre de recherche
  const search = el('input', {
    class: 'manage-search',
    type: 'search',
    placeholder: 'Rechercher par titre ou slug...',
    oninput: () => applyFilter()
  });
  inner.appendChild(el('div', { class: 'manage-toolbar' }, search));

  // Etat
  const statusLine = el('div', { class: 'manage-status' }, 'Chargement...');
  inner.appendChild(statusLine);

  const listHost = el('div', { class: 'manage-list' });
  inner.appendChild(listHost);

  let allSpecs = [];

  function applyFilter() {
    const q = (search.value || '').trim().toLowerCase();
    const filtered = !q ? allSpecs : allSpecs.filter(s =>
      s.title.toLowerCase().includes(q)
      || s.slug.toLowerCase().includes(q)
      || (s.projectTitle && s.projectTitle.toLowerCase().includes(q))
    );
    renderList(filtered);
  }

  function fmtSize(n) {
    if (n < 1024) return n + ' o';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' Ko';
    return (n / 1024 / 1024).toFixed(2) + ' Mo';
  }

  function renderList(specs) {
    Utils.clear(listHost);
    if (!specs.length) {
      listHost.appendChild(el('div', { class: 'manage-empty glass card' },
        el('img', { class: 'grimoire grimoire-sm', src: 'assets/grimoire-petit-96px.gif', alt: '', draggable: 'false' }),
        el('p', null, 'Aucun cahier des charges trouve.')
      ));
      return;
    }

    specs.forEach(s => {
      const row = el('div', { class: 'manage-row glass card' });

      const main = el('div', { class: 'manage-row-main' });
      const titleLine = el('div', { class: 'manage-row-title' }, s.title);
      if (s.projectTitle && s.projectTitle !== s.title) {
        titleLine.appendChild(el('span', { class: 'manage-row-project' }, ' · ' + s.projectTitle));
      }
      main.appendChild(titleLine);

      const meta = el('div', { class: 'manage-row-meta' });
      meta.appendChild(el('span', { class: 'manage-chip slug' }, s.slug));
      if (s.featureType) meta.appendChild(el('span', { class: 'manage-chip' }, s.featureType));
      if (s.inRoadmap) meta.appendChild(el('span', { class: 'manage-chip ok' }, 'dans roadmap'));
      else            meta.appendChild(el('span', { class: 'manage-chip warn' }, 'hors roadmap'));
      if (s.hasAssets) meta.appendChild(el('span', { class: 'manage-chip' }, 'assets'));
      meta.appendChild(el('span', { class: 'manage-chip soft' }, fmtSize(s.size)));
      meta.appendChild(el('span', { class: 'manage-chip soft' }, Utils.relTime(s.updatedAt)));
      main.appendChild(meta);

      row.appendChild(main);

      const actions = el('div', { class: 'manage-row-actions' });

      const openBtn = el('button', { class: 'btn btn-ghost small', type: 'button',
        onclick: () => window.erisclave.shell.openPath(s.htmlPath)
      }, 'Ouvrir');
      actions.appendChild(openBtn);

      const editBtn = el('button', { class: 'btn btn-primary small', type: 'button',
        onclick: () => openEdit(s)
      }, 'Modifier');
      if (!s.hasJson) {
        editBtn.disabled = true;
        editBtn.title = 'Spec sans JSON jumeau — non editable depuis l\'app';
      }
      actions.appendChild(editBtn);

      const delBtn = el('button', { class: 'btn btn-danger small', type: 'button',
        onclick: () => openDeleteDialog(s)
      }, 'Supprimer');
      actions.appendChild(delBtn);

      row.appendChild(actions);
      listHost.appendChild(row);
    });
  }

  function openDeleteDialog(spec) {
    const overlay = el('div', { class: 'modal-overlay fade-in' });
    const dialog = el('div', { class: 'modal glass-strong card' });

    dialog.appendChild(el('div', { class: 'eyebrow danger' }, 'Suppression definitive'));
    dialog.appendChild(el('h2', null, spec.title));

    const targets = el('ul', { class: 'modal-targets' });
    targets.appendChild(el('li', null, 'docs/specs/' + spec.slug + '.html'));
    if (spec.hasJson)   targets.appendChild(el('li', null, 'docs/specs/' + spec.slug + '.json'));
    if (spec.hasAssets) targets.appendChild(el('li', null, 'docs/specs/assets/' + spec.slug + '/ (recursif)'));
    if (spec.inRoadmap) targets.appendChild(el('li', null, 'Carte dans docs/roadmap.html'));
    dialog.appendChild(targets);

    dialog.appendChild(el('p', { class: 'modal-hint' },
      'Un backup de roadmap.html est cree automatiquement dans recap/backups/. Maintenez le bouton pour confirmer.'
    ));

    const btnRow = el('div', { class: 'modal-actions' });

    const hold = HoldButton.create({
      label: 'Supprimer',
      onTrigger: async () => {
        const res = await window.erisclave.specs.delete(spec.slug);
        overlay.remove();
        if (res && res.ok) {
          Utils.toast('Supprime : ' + spec.slug + (res.roadmapUpdated ? ' (roadmap + backup)' : ''), { type: 'success' });
          load();
        } else {
          Utils.toast(res && res.error ? res.error : 'Echec de la suppression', { type: 'error' });
        }
      }
    });
    btnRow.appendChild(hold);

    const cancel = el('button', { class: 'btn btn-ghost', type: 'button',
      onclick: () => overlay.remove()
    }, 'Annuler');
    btnRow.appendChild(cancel);

    dialog.appendChild(btnRow);
    overlay.appendChild(dialog);

    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
  }

  async function openEdit(spec) {
    try {
      const res = await window.erisclave.specs.load(spec.slug);
      if (!res || !res.ok) {
        Utils.toast(res && res.error ? res.error : 'Echec du chargement', { type: 'error' });
        return;
      }
      const twin = res.twin || {};
      if (!twin.draft) {
        Utils.toast('Ce spec n\'a pas de brouillon ré-éditable.', { type: 'error' });
        return;
      }
      const project = twin.project || { title: '', status: 'wip', tags: [], category: '' };
      // Le store accepte {project, features}
      Store.reset();
      Store.set({ draftId: 'edit-' + spec.slug, editingSlug: spec.slug });
      Store.fromJSON({
        project: {
          title:    project.title    || '',
          status:   project.status   || 'wip',
          tags:     project.tags     || [],
          category: project.category || ''
        },
        features: [{
          id: 'feat-edit-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
          titleProvisoire: twin.draft.titleProvisoire || twin.feature && twin.feature.title || '(sans titre)',
          slugFinal:       twin.draft.slugFinal       || spec.slug,
          featureType:     twin.draft.featureType     || (twin.feature && twin.feature.featureTypeId) || 'system',
          answers:         twin.draft.answers         || {},
          assets:          twin.draft.assets          || [],
          done: false
        }]
      });
      Autosave.start();
      Utils.toast('Edition de "' + spec.slug + '" — regenerer ecrasera le spec actuel.', { type: 'success' });
      navigate('project');
    } catch (e) {
      Utils.toast('Erreur : ' + e.message, { type: 'error' });
    }
  }

  async function load() {
    statusLine.textContent = 'Chargement...';
    try {
      const res = await window.erisclave.specs.list();
      if (!res || !res.ok) {
        statusLine.textContent = (res && res.error) || 'Erreur de chargement';
        return;
      }
      allSpecs = res.specs || [];
      statusLine.textContent = allSpecs.length + ' cahier(s) des charges';
      applyFilter();
    } catch (e) {
      statusLine.textContent = 'Erreur : ' + e.message;
    }
  }

  load();

  screen.appendChild(inner);
  return screen;
};
