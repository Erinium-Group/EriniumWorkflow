/* App router : navigation entre ecrans */

(function() {
  'use strict';

  const SCREENS = {
    home:          () => window.Screens.home(),
    loading:       () => window.Screens.loading(),
    project:       () => window.Screens.project(),
    questionnaire: () => window.Screens.questionnaire(),
    tasks:         () => window.Screens.tasks(),
    preview:       () => window.Screens.preview(),
    generate:      () => window.Screens.generate(),
    final:         () => window.Screens.final(),
    manage:        () => window.Screens.manage()
  };

  const HIDE_APPBAR = new Set(['loading']);

  const root = document.getElementById('root');
  const appBar = document.getElementById('app-bar');
  const docsStatus = document.getElementById('docs-status');
  const pickBtn = document.getElementById('pick-docs-btn');

  // --- Navigation ---
  function navigate(screen) {
    Store.set({ screen });
    render();
  }
  window.navigate = navigate;

  function render() {
    const state = Store.get();
    Utils.clear(root);

    appBar.dataset.visible = HIDE_APPBAR.has(state.screen) ? 'false' : 'true';

    const fn = SCREENS[state.screen];
    if (!fn) { root.innerHTML = '<p style="padding:40px">Ecran introuvable: ' + state.screen + '</p>'; return; }
    try {
      const node = fn();
      if (node) root.appendChild(node);
    } catch (err) {
      console.error('[render] ' + state.screen + ' failed', err);
      root.innerHTML = '<div style="padding:40px;color:#d97070;font-family:monospace;white-space:pre-wrap">'
        + 'Erreur de rendu (' + state.screen + ') :\n\n' + (err && err.stack ? err.stack : String(err))
        + '</div>';
    }
  }

  // --- docs status ---
  function updateDocsStatus() {
    const state = Store.get();
    const label = docsStatus.querySelector('.docs-label');
    if (state.docsStatus === 'ok') {
      docsStatus.dataset.state = 'ok';
      label.textContent = 'Dossier docs/ detecte';
    } else if (state.docsStatus === 'error') {
      docsStatus.dataset.state = 'error';
      label.textContent = 'docs/ introuvable';
    } else {
      docsStatus.dataset.state = '';
      label.textContent = 'Detection du dossier docs/...';
    }
  }

  pickBtn.addEventListener('click', async () => {
    const res = await window.erisclave.docs.pick();
    if (res && res.ok) {
      Store.set({ docsRoot: res.docsRoot, docsStatus: 'ok' });
      Utils.toast('Dossier docs defini : ' + res.docsRoot, { type: 'success' });
    } else if (res && res.canceled) {
      // ignore
    } else if (res && res.error) {
      Utils.toast(res.error, { type: 'error' });
    }
  });

  Store.subscribe(updateDocsStatus);

  // --- Init ---
  async function init() {
    // Affiche loading
    navigate('loading');
    Utils.fireConfetti; // no-op preload

    // Detection docs/
    try {
      const docsRes = await window.erisclave.docs.status();
      Store.set({
        docsRoot: docsRes.docsRoot || null,
        docsStatus: docsRes.ok ? 'ok' : 'error'
      });
    } catch (e) {
      Store.set({ docsStatus: 'error' });
    }

    // Charge metadata
    try {
      const [types, tags, cats] = await Promise.all([
        window.erisclave.questions.listTypes(),
        window.erisclave.roadmap.listTags(),
        window.erisclave.roadmap.listCategories().catch(() => [])
      ]);
      Store.set({
        featureTypes: types || [],
        availableTags: tags || [],
        availableCategories: cats || []
      });
    } catch (e) {
      console.warn('metadata load failed', e);
    }

    // Attendre 800ms minimum pour montrer l'orbe
    await new Promise(r => setTimeout(r, 900));
    navigate('home');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
