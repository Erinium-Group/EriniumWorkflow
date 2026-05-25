'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('erisclave', {
  docs: {
    status:        ()      => ipcRenderer.invoke('docs:status'),
    pick:          ()      => ipcRenderer.invoke('docs:pick')
  },
  roadmap: {
    listCategories: () => ipcRenderer.invoke('roadmap:list-categories'),
    listTags:       () => ipcRenderer.invoke('roadmap:list-tags')
  },
  questions: {
    load:       (type) => ipcRenderer.invoke('questions:load', type),
    listTypes:  ()     => ipcRenderer.invoke('questions:list-types')
  },
  drafts: {
    list:   ()         => ipcRenderer.invoke('draft:list'),
    load:   (id)       => ipcRenderer.invoke('draft:load', id),
    save:   (id, data) => ipcRenderer.invoke('draft:save', id, data),
    delete: (id)       => ipcRenderer.invoke('draft:delete', id)
  },
  spec: {
    preview:       (payload) => ipcRenderer.invoke('spec:preview', payload),
    checkConflict: (slug)    => ipcRenderer.invoke('spec:check-conflict', slug),
    slug:          (raw)     => ipcRenderer.invoke('spec:slug', raw)
  },
  generate: {
    run: (state) => ipcRenderer.invoke('generate:run', state)
  },
  specs: {
    list:   ()     => ipcRenderer.invoke('specs:list'),
    delete: (slug) => ipcRenderer.invoke('specs:delete', slug),
    load:   (slug) => ipcRenderer.invoke('specs:load', slug)
  },
  assets: {
    upload: (opts) => ipcRenderer.invoke('asset:upload', opts)
  },
  shell: {
    openPath: (p) => ipcRenderer.invoke('app:open-path', p)
  }
});
