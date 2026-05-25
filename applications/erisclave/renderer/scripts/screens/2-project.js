/* Ecran 2 : Projet (titre, statut, tags, categorie, features) */

window.Screens = window.Screens || {};

window.Screens.project = function() {
  const { el } = Utils;
  const state = Store.get();

  const screen = el('div', { class: 'screen fade-up' });
  const inner = el('div', { class: 'screen-inner' });

  // Header
  const header = el('div', { class: 'screen-header' },
    el('div', { class: 'left' },
      el('div', { class: 'eyebrow' }, 'Etape 1 sur 6'),
      el('h1', null, 'Votre projet'),
      el('p', null, 'Donnez un nom au projet et listez les features couvertes. Chaque feature aura son propre cahier des charges.')
    )
  );
  inner.appendChild(header);

  // Formulaire projet
  const form = el('div', { class: 'project-form glass card' });

  // Titre
  form.appendChild(Inputs.render(
    { id: 'title', label: 'Nom du projet', type: 'text', required: true,
      placeholder: 'Ex: Refonte du systeme de combat' },
    state.project.title,
    v => { Store.patch('project.title', v); Autosave.trigger(); }
  ));

  // Statut
  form.appendChild(Inputs.render(
    { id: 'status', label: 'Statut', type: 'select',
      options: [
        { value: 'todo',    label: 'Planifie' },
        { value: 'wip',     label: 'En cours' },
        { value: 'test',    label: 'En test' },
        { value: 'done',    label: 'Termine' },
        { value: 'blocked', label: 'Bloque' }
      ]
    },
    state.project.status,
    v => { Store.patch('project.status', v); Autosave.trigger(); }
  ));

  // Categorie
  const catGroup = Inputs.render(
    { id: 'category', label: 'Categorie (roadmap)', type: 'text',
      hint: 'Categorie deja existante dans la roadmap (laissez vide pour ajouter dans la grille principale).',
      placeholder: 'Ex: Combat' },
    state.project.category,
    v => { Store.patch('project.category', v); Autosave.trigger(); }
  );
  form.appendChild(catGroup);

  // Tags
  const tagsGroup = el('div', { class: 'field-group full', style: { gridColumn: '1 / -1' } });
  tagsGroup.appendChild(el('label', { class: 'field-label' }, 'Tags'));
  tagsGroup.appendChild(el('div', { class: 'field-hint' }, 'Selectionnez les categories qui s\'appliquent (filtrables sur la roadmap).'));
  const tagsCtrl = Inputs.render(
    { id: 'tags', label: '', type: 'tags',
      options: state.availableTags.map(t => ({ value: t.id, label: t.label })) },
    state.project.tags,
    v => { Store.patch('project.tags', v); Autosave.trigger(); }
  );
  const tagLabelEl = tagsCtrl.querySelector('.field-label');
  if (tagLabelEl) tagLabelEl.remove();
  const tagHintEl = tagsCtrl.querySelector('.field-hint');
  if (tagHintEl) tagHintEl.remove();
  const tagInputEl = tagsCtrl.querySelector('.tag-input') || tagsCtrl.firstElementChild || tagsCtrl;
  tagsGroup.appendChild(tagInputEl);
  form.appendChild(tagsGroup);

  inner.appendChild(form);

  // --- Features ---
  inner.appendChild(el('h2', { class: 'title-md', style: { marginTop: '40px', marginBottom: '14px' } }, 'Features couvertes'));
  inner.appendChild(el('p', { class: 'text-soft', style: { marginBottom: '16px' } },
    'Chaque feature donnera lieu a un cahier des charges propre. Une feature simple = 1 spec.'
  ));

  const featList = el('div', { class: 'feature-list' });
  renderFeatures(featList);
  inner.appendChild(featList);

  const addBtn = el('button', { class: 'add-feature-btn', type: 'button',
    onclick: async () => {
      const name = await Utils.prompt({
        eyebrow: 'Nouvelle feature',
        title: 'Nom provisoire',
        message: 'Vous pourrez modifier le slug final plus tard.',
        placeholder: 'Ex: Combo d\'attaques',
        confirmLabel: 'Ajouter'
      });
      if (!name) return;
      Store.addFeature(name);
      Autosave.trigger();
      renderFeatures(featList);
    }
  });
  addBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg> Ajouter une feature';
  inner.appendChild(addBtn);

  // Footer
  const footer = el('div', { class: 'screen-footer' },
    el('div', { class: 'left' },
      el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => navigate('home') }, '← Retour')
    ),
    el('div', { class: 'right' },
      el('button', { class: 'btn btn-primary', type: 'button',
        onclick: () => {
          const s = Store.get();
          if (!s.project.title.trim()) {
            Utils.toast('Donnez un nom au projet', { type: 'error' });
            return;
          }
          if (!s.features.length) {
            Utils.toast('Ajoutez au moins une feature', { type: 'error' });
            return;
          }
          const unfilled = s.features.filter(f => !isFeatureFilled(f));
          if (unfilled.length === s.features.length) {
            Utils.toast('Editez au moins une feature avant de continuer', { type: 'error' });
            return;
          }
          if (unfilled.length > 0) {
            Utils.toast(unfilled.length + ' feature(s) non remplie(s) — elles seront ignorees', { type: 'warn' });
          }
          navigate('tasks');
        }
      }, 'Continuer →')
    )
  );
  inner.appendChild(footer);

  screen.appendChild(inner);
  return screen;
};

function isFeatureFilled(f) {
  if (!f) return false;
  if (!f.featureType) return false;
  if (!f.answers) return false;
  return Object.keys(f.answers).some(k => {
    const v = f.answers[k];
    if (v == null) return false;
    if (typeof v === 'string') return v.trim().length > 0;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return true;
  });
}
window.isFeatureFilled = isFeatureFilled;

function renderFeatures(host) {
  const { el, clear } = Utils;
  clear(host);
  const features = Store.get().features;
  features.forEach((f, idx) => {
    const filled = isFeatureFilled(f);
    const row = el('div', { class: 'feature-row' + (filled ? ' is-filled' : '') });
    row.appendChild(el('div', { class: 'idx' }, String(idx + 1)));

    const info = el('div', { class: 'info' });
    const nameLine = el('div', { class: 'name' }, f.titleProvisoire || '(sans titre)');
    info.appendChild(nameLine);
    const sub = el('div', { class: 'sub' });
    sub.appendChild(el('span', null, f.featureType ? typeLabel(f.featureType) : 'Type a definir'));
    sub.appendChild(el('span', { class: 'feature-chip ' + (filled ? 'ok' : 'empty') },
      filled ? 'Remplie' : 'Non remplie'
    ));
    info.appendChild(sub);
    row.appendChild(info);

    const actions = el('div', { class: 'actions' });

    const editBtn = el('button', {
      class: 'btn ' + (filled ? 'btn-ghost' : 'btn-primary') + ' small',
      type: 'button',
      onclick: () => {
        Store.set({ activeFeatureIdx: idx });
        navigate('questionnaire');
      }
    });
    editBtn.innerHTML = '<svg viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;fill:currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg> ' + (filled ? 'Modifier' : 'Editer');
    actions.appendChild(editBtn);

    const rename = el('button', { class: 'icon-btn', type: 'button', title: 'Renommer',
      onclick: async () => {
        const v = await Utils.prompt({
          eyebrow: 'Renommer',
          title: 'Nouveau nom de la feature',
          defaultValue: f.titleProvisoire,
          confirmLabel: 'Renommer'
        });
        if (v) {
          f.titleProvisoire = v;
          Autosave.trigger();
          renderFeatures(host);
        }
      }
    });
    rename.innerHTML = '<svg viewBox="0 0 24 24"><path d="M14.06 9.02l.92.92L5.92 19H5v-.92l9.06-9.06M17.66 3c-.25 0-.51.1-.7.29l-1.83 1.83 3.75 3.75 1.83-1.83c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.2-.2-.45-.29-.71-.29zm-3.6 3.19L3 17.25V21h3.75L17.81 9.94l-3.75-3.75z"/></svg>';
    actions.appendChild(rename);

    const del = el('button', { class: 'icon-btn del', type: 'button', title: 'Supprimer',
      onclick: async () => {
        const ok = await Utils.confirm({
          eyebrow: 'Supprimer',
          danger: true,
          title: 'Supprimer cette feature ?',
          message: f.titleProvisoire || '(sans titre)',
          confirmLabel: 'Supprimer'
        });
        if (ok) {
          Store.removeFeature(idx);
          Autosave.trigger();
          renderFeatures(host);
        }
      }
    });
    del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
    actions.appendChild(del);

    row.appendChild(actions);
    host.appendChild(row);
  });
}

function typeLabel(id) {
  const t = (Store.get().featureTypes || []).find(x => x.id === id);
  return t ? t.label : id;
}
