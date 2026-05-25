/* Auto-save : sauvegarde du brouillon en debounce */

window.Autosave = (function() {
  'use strict';

  let active = false;
  let busy = false;
  let pending = false;

  const flush = Utils.debounce(async function() {
    if (busy) { pending = true; return; }
    if (!active) return;
    const state = Store.get();
    if (!state.draftId) return;

    busy = true;
    try {
      const data = Store.toJSON();
      const res = await window.erisclave.drafts.save(state.draftId, data);
      if (res.ok) {
        Store.set({ lastSavedAt: new Date().toISOString() });
        updateStatus('Sauvegarde a ' + Utils.relTime(state.lastSavedAt));
      }
    } catch (e) {
      console.error('autosave failed', e);
      updateStatus('Echec de la sauvegarde', true);
    } finally {
      busy = false;
      if (pending) { pending = false; flush(); }
    }
  }, 700);

  function updateStatus(text, isError) {
    const dot = document.querySelector('.docs-status');
    if (!dot) return;
    // Pas d'override de la statut docs, juste un mini-flash
  }

  function start() { active = true; }
  function stop() { active = false; }
  function trigger() { flush(); }

  return { start, stop, trigger };
})();
