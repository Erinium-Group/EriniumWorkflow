/* Store global — etat partage entre ecrans */

window.Store = (function() {
  'use strict';

  const state = {
    screen: 'home',
    docsRoot: null,
    docsStatus: 'pending',
    draftId: null,
    project: {
      title: '',
      status: 'wip',
      tags: [],
      category: ''
    },
    features: [],
    activeFeatureIdx: 0,
    tasks: [],
    lastSavedAt: null,
    questionnaires: {},
    featureTypes: [],
    availableTags: [],
    availableCategories: []
  };

  const listeners = new Set();

  function get() { return state; }

  function set(partial) {
    Object.assign(state, partial);
    emit();
  }

  function patch(path, value) {
    const parts = path.split('.');
    let cur = state;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]]) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
    emit();
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function emit() {
    listeners.forEach(fn => {
      try { fn(state); } catch (e) { console.error(e); }
    });
  }

  // --- Helpers feature ---
  function newFeature() {
    return {
      id: 'feat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      titleProvisoire: '',
      slugFinal: '',
      featureType: 'system',
      answers: {},
      done: false
    };
  }

  function addFeature(name) {
    const f = newFeature();
    f.titleProvisoire = name || '';
    state.features.push(f);
    state.activeFeatureIdx = state.features.length - 1;
    emit();
    return f;
  }

  function removeFeature(idx) {
    state.features.splice(idx, 1);
    if (state.activeFeatureIdx >= state.features.length) {
      state.activeFeatureIdx = Math.max(0, state.features.length - 1);
    }
    emit();
  }

  function activeFeature() {
    return state.features[state.activeFeatureIdx] || null;
  }

  function reset() {
    state.draftId = null;
    state.editingSlug = null;
    state.project = { title: '', status: 'wip', tags: [], category: '' };
    state.features = [];
    state.activeFeatureIdx = 0;
    state.tasks = [];
    state.lastSavedAt = null;
    emit();
  }

  function toJSON() {
    return {
      project: state.project,
      features: state.features,
      tasks: state.tasks,
      meta: { version: 1, savedAt: new Date().toISOString() }
    };
  }

  function fromJSON(data) {
    state.project = data.project || { title: '', status: 'wip', tags: [], category: '' };
    state.features = data.features || [];
    state.tasks = data.tasks || [];
    state.activeFeatureIdx = 0;
    emit();
  }

  return {
    get, set, patch, subscribe,
    addFeature, removeFeature, activeFeature, newFeature,
    reset, toJSON, fromJSON
  };
})();
