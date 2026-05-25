/* Ecran 0 : Home */

window.Screens = window.Screens || {};

window.Screens.home = function() {
  const { el } = Utils;

  const wrap = el('div', { class: 'home fade-in' });
  const card = el('div', { class: 'home-card glass-strong card' });

  card.appendChild(el('img', { class: 'grimoire grimoire-lg home-grimoire', src: 'assets/grimoire-normal-160px.gif', alt: '', draggable: 'false' }));
  card.appendChild(el('h1', null, 'Erisclave'));
  card.appendChild(el('p', { class: 'subtitle' },
    'Concevez vos cahiers des charges et synchronisez la roadmap. Sans IA, sans devinette, juste vos reponses.'
  ));

  const actions = el('div', { class: 'actions' });
  const newBtn = el('button', { class: 'btn btn-primary', type: 'button',
    onclick: () => startNew() });
  newBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2c-1.1 0-2 .9-2 2v6H4c-1.1 0-2 .9-2 2s.9 2 2 2h6v6c0 1.1.9 2 2 2s2-.9 2-2v-6h6c1.1 0 2-.9 2-2s-.9-2-2-2h-6V4c0-1.1-.9-2-2-2z"/></svg> Nouveau projet';
  actions.appendChild(newBtn);

  const manageBtn = el('button', { class: 'btn btn-ghost', type: 'button',
    onclick: () => {
      const state = Store.get();
      if (state.docsStatus !== 'ok') {
        Utils.toast('Definissez d\'abord le dossier docs/ via le bouton en haut a droite', { type: 'error' });
        return;
      }
      navigate('manage');
    }
  });
  manageBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/></svg> Gerer les specs';
  actions.appendChild(manageBtn);

  card.appendChild(actions);

  // Liste des brouillons
  const draftWrap = el('div', { class: 'draft-list' });
  card.appendChild(draftWrap);

  loadDrafts(draftWrap);

  // Petits items "ce que fait l'app"
  const list = el('div', { class: 'home-list' },
    item('1', 'Repondez aux questions du cahier des charges'),
    item('2', 'Generez les fichiers HTML stylises'),
    item('3', 'Roadmap mise a jour automatiquement')
  );
  card.appendChild(list);

  wrap.appendChild(card);
  return wrap;
};

function item(num, txt) {
  return Utils.el('div', { class: 'item' },
    Utils.el('div', { class: 'ico' }, num),
    Utils.el('div', null, txt)
  );
}

async function startNew() {
  const state = Store.get();
  if (state.docsStatus !== 'ok') {
    Utils.toast('Definissez d\'abord le dossier docs/ via le bouton en haut a droite', { type: 'error' });
    return;
  }
  Store.reset();
  // Cree un nouveau brouillon
  const draftId = 'draft-' + Date.now();
  Store.set({ draftId });
  Autosave.start();
  navigate('project');
}

async function loadDrafts(host) {
  const { el, clear } = Utils;
  try {
    const drafts = await window.erisclave.drafts.list();
    if (!drafts || !drafts.length) return;

    const title = el('div', { class: 'eyebrow', style: { marginTop: '16px', marginBottom: '12px' } }, 'Reprendre');
    host.appendChild(title);

    drafts.forEach(d => {
      const row = el('div', { class: 'draft-row',
        onclick: (e) => {
          if (e.target.closest('.del')) return;
          openDraft(d.id);
        }
      });
      row.appendChild(el('div', { class: 'meta' },
        el('div', { class: 'name' }, d.title || '(sans titre)'),
        el('div', { class: 'when' }, (d.featuresCount || 0) + ' feature(s) · ' + Utils.relTime(d.updatedAt))
      ));
      const del = el('button', { class: 'del', type: 'button', title: 'Supprimer le brouillon',
        onclick: async (e) => {
          e.stopPropagation();
          const ok = await Utils.confirm({
            eyebrow: 'Supprimer',
            danger: true,
            title: 'Supprimer ce brouillon ?',
            message: d.title || '(sans titre)',
            confirmLabel: 'Supprimer'
          });
          if (!ok) return;
          await window.erisclave.drafts.delete(d.id);
          row.remove();
        }
      });
      del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
      row.appendChild(del);
      host.appendChild(row);
    });
  } catch (e) {
    console.warn('drafts load failed', e);
  }
}

async function openDraft(id) {
  try {
    const data = await window.erisclave.drafts.load(id);
    if (!data) { Utils.toast('Brouillon introuvable', { type: 'error' }); return; }
    Store.reset();
    Store.set({ draftId: id });
    Store.fromJSON(data);
    Autosave.start();
    navigate('project');
  } catch (e) {
    Utils.toast('Echec du chargement', { type: 'error' });
  }
}
