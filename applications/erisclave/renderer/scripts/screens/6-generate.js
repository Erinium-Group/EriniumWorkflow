/* Ecran 6 : Generation (hold button) */

window.Screens = window.Screens || {};

window.Screens.generate = function() {
  const { el } = Utils;
  const state = Store.get();

  const screen = el('div', { class: 'generate fade-up' });

  screen.appendChild(el('div', { class: 'eyebrow' }, 'Etape 5 sur 6'));
  screen.appendChild(el('h1', null, 'Pret a generer ?'));
  screen.appendChild(el('p', { class: 'sub' },
    'On va ecrire ' + state.features.length + ' fichier(s) HTML dans docs/specs/, et ajouter / mettre a jour la card dans docs/roadmap.html. Aucune action git ne sera effectuee.'
  ));

  // Summary stats
  const totalTasks = state.tasks.length;
  const doneTasks = state.tasks.filter(t => t.status === 'done').length;
  const summary = el('div', { class: 'generate-summary' },
    el('div', { class: 'item' }, el('strong', null, String(state.features.length)), 'features'),
    el('div', { class: 'item' }, el('strong', null, doneTasks + '/' + totalTasks), 'taches faites'),
    el('div', { class: 'item' }, el('strong', null, String(state.project.tags.length)), 'tags')
  );
  screen.appendChild(summary);

  // Bouton hold
  const hold = HoldButton.create({
    label: 'Generer',
    onTrigger: () => doGenerate(screen)
  });
  screen.appendChild(hold);

  // Cancel
  const cancel = el('button', { class: 'btn btn-ghost', type: 'button',
    onclick: () => navigate('preview')
  }, '← Annuler');
  screen.appendChild(cancel);

  return screen;
};

async function doGenerate(host) {
  const { el } = Utils;

  // Conflict check : pour chaque feature
  const data = Store.toJSON();
  const state = Store.get();

  // Pre-resolve slugs s'ils ne sont pas encore poses
  for (let i = 0; i < data.features.length; i++) {
    const f = data.features[i];
    if (!f.slugFinal) {
      // Genere depuis le titre
      const slugRes = await window.erisclave.spec.slug(f.titleProvisoire || ('feature-' + (i+1)));
      f.slugFinal = slugRes.slug;
      state.features[i].slugFinal = slugRes.slug;
    }
    // En mode edition, on ecrase volontairement le spec d'origine
    if (state.editingSlug && f.slugFinal === state.editingSlug) {
      continue;
    }
    // Check conflict
    const c = await window.erisclave.spec.checkConflict(f.slugFinal);
    if (c.conflict) {
      const ok = await Utils.confirm({
        eyebrow: 'Conflit de slug',
        title: f.slugFinal + '.html existe deja',
        message: 'Voulez-vous utiliser le slug alternatif "' + c.suggestion + '" ?',
        confirmLabel: 'Utiliser ' + c.suggestion,
        cancelLabel: 'Annuler la generation'
      });
      if (ok) {
        f.slugFinal = c.suggestion;
        state.features[i].slugFinal = c.suggestion;
      } else {
        Utils.toast('Generation annulee', { type: 'error' });
        return;
      }
    }
  }

  // Affiche loader
  Utils.clear(host);
  host.appendChild(el('img', { class: 'grimoire grimoire-md', src: 'assets/grimoire-moyen-140px.gif', alt: '', draggable: 'false' }));
  host.appendChild(el('div', { class: 'loading-text' }, 'Generation en cours...'));

  try {
    const res = await window.erisclave.generate.run(data);
    if (res.ok) {
      Store.set({ generated: res });
      Autosave.stop();
      // Supprime le brouillon
      if (state.draftId) await window.erisclave.drafts.delete(state.draftId).catch(() => {});
      navigate('final');
    } else {
      Utils.toast(res.error || 'Echec de la generation', { type: 'error' });
      // Re-render
      const fresh = window.Screens.generate();
      const root = document.getElementById('root');
      Utils.clear(root); root.appendChild(fresh);
    }
  } catch (e) {
    Utils.toast(e.message || 'Erreur', { type: 'error' });
    const fresh = window.Screens.generate();
    const root = document.getElementById('root');
    Utils.clear(root); root.appendChild(fresh);
  }
}
