/* Ecran 4 : Liste des taches roadmap */

window.Screens = window.Screens || {};

window.Screens.tasks = function() {
  const { el } = Utils;
  const state = Store.get();

  // Auto-population : si vide, suggere les feature names en taches
  if (!state.tasks.length && state.features.length) {
    state.tasks = state.features.map(f => ({ id: 't-' + Math.random().toString(36).slice(2,8), title: f.titleProvisoire || '', status: 'todo' }));
  }

  const screen = el('div', { class: 'screen fade-up' });
  const inner = el('div', { class: 'screen-inner' });

  const header = el('div', { class: 'screen-header' },
    el('div', { class: 'left' },
      el('div', { class: 'eyebrow' }, 'Etape 3 sur 6'),
      el('h1', null, 'Taches de la roadmap'),
      el('p', null, 'Ces taches s\'afficheront dans la card de la roadmap, avec une barre de progression. Cochez celles deja realisees.')
    )
  );
  inner.appendChild(header);

  const board = el('div', { class: 'tasks-board' });
  renderTasks(board);
  inner.appendChild(board);

  const addBtn = el('button', { class: 'add-feature-btn', type: 'button', style: { marginTop: '14px' },
    onclick: () => {
      state.tasks.push({ id: 't-' + Math.random().toString(36).slice(2,8), title: '', status: 'todo' });
      Autosave.trigger();
      renderTasks(board);
      const last = board.lastElementChild;
      if (last) last.querySelector('.title-input').focus();
    }
  });
  addBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg> Ajouter une tache';
  inner.appendChild(addBtn);

  // Footer
  const footer = el('div', { class: 'screen-footer' },
    el('div', { class: 'left' },
      el('button', { class: 'btn btn-ghost', type: 'button',
        onclick: () => {
          Store.set({ activeFeatureIdx: Store.get().features.length - 1 });
          navigate('questionnaire');
        }
      }, '← Retour aux questions')
    ),
    el('div', { class: 'right' },
      el('button', { class: 'btn btn-primary', type: 'button',
        onclick: () => navigate('preview')
      }, 'Voir l\'apercu →')
    )
  );
  inner.appendChild(footer);

  screen.appendChild(inner);
  return screen;
};

function renderTasks(host) {
  const { el, clear } = Utils;
  clear(host);
  const tasks = Store.get().tasks;
  tasks.forEach((t, idx) => {
    const row = el('div', { class: 'task-row' + (t.status === 'done' ? ' done' : '') });
    const handle = el('div', { class: 'handle' });
    handle.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 3h2v2H9V3zm4 0h2v2h-2V3zM9 7h2v2H9V7zm4 0h2v2h-2V7zM9 11h2v2H9v-2zm4 0h2v2h-2v-2zM9 15h2v2H9v-2zm4 0h2v2h-2v-2zM9 19h2v2H9v-2zm4 0h2v2h-2v-2z"/></svg>';
    row.appendChild(handle);

    const chk = el('div', { class: 'check' + (t.status === 'done' ? ' done' : ''),
      onclick: () => {
        t.status = t.status === 'done' ? 'todo' : 'done';
        Autosave.trigger();
        renderTasks(host);
      }
    });
    row.appendChild(chk);

    const inp = el('input', { class: 'title-input', type: 'text', placeholder: 'Decrivez la tache...' });
    inp.value = t.title || '';
    inp.addEventListener('input', () => { t.title = inp.value; Autosave.trigger(); });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        tasks.splice(idx + 1, 0, { id: 't-' + Math.random().toString(36).slice(2,8), title: '', status: 'todo' });
        Autosave.trigger();
        renderTasks(host);
        const next = host.children[idx + 1];
        if (next) next.querySelector('.title-input').focus();
      } else if (e.key === 'Backspace' && !inp.value && tasks.length > 1) {
        e.preventDefault();
        tasks.splice(idx, 1);
        Autosave.trigger();
        renderTasks(host);
        const prev = host.children[idx - 1] || host.children[0];
        if (prev) prev.querySelector('.title-input').focus();
      }
    });
    row.appendChild(inp);

    const del = el('button', { class: 'icon-btn del', type: 'button', title: 'Supprimer',
      onclick: () => {
        Store.get().tasks.splice(idx, 1);
        Autosave.trigger();
        renderTasks(host);
      }
    });
    del.innerHTML = '<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor;opacity:0.5"><path d="M19 13H5v-2h14v2z"/></svg>';
    row.appendChild(del);

    host.appendChild(row);
  });
}
